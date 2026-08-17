// release-safety.test.mjs — make service-worker bookkeeping fail loudly.
//
// Dash deliberately has no build step. sw.js is still a hand-maintained list,
// because that keeps the app understandable and publishable through GitHub's
// website. This test does not replace that design; it checks the easy-to-forget
// parts after every push so a stale offline cache becomes a clear red check
// instead of a mysterious "I uploaded it and nothing changed" later.
//
// It checks two layers:
//   1. Current tree: every SHELL entry exists, and every local asset that
//      index.html / manifest.json / active ES-module imports load is in SHELL.
//   2. Current commit (when git history is available): changing a cached app
//      file also changes sw.js, and any sw.js change bumps CACHE_VERSION.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// A tiny explicit escape hatch for files that are deliberately NOT part of
// offline Dash. Keep this list exceptional and explained. focus-debug.js is a
// temporary diagnostic loaded only when ?focusdebug is requested; app.js says
// normal Dash never loads it and intentionally keeps it out of SHELL.
const ONLINE_ONLY_RUNTIME_ASSETS = new Set([
  "./js/focus-debug.js",
]);

let failures = 0;
let checks = 0;

function pass(message) {
  checks++;
  console.log(`PASS  ${message}`);
}

function fail(message, detail = "") {
  checks++;
  failures++;
  console.log(`FAIL  ${message}${detail ? `\n      ${detail}` : ""}`);
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function parseWorker(source) {
  const version = source.match(/const\s+CACHE_VERSION\s*=\s*["']([^"']+)["']/)?.[1] || null;
  const block = source.match(/const\s+SHELL\s*=\s*\[([\s\S]*?)\];/)?.[1] || "";
  const shell = [...block.matchAll(/["'](\.\/[^"']*)["']/g)].map((m) => m[1]);
  return { version, shell };
}

function localAsset(fromRel, spec) {
  if (!spec || spec.startsWith("#")) return null;
  const clean = spec.split("#")[0].split("?")[0];
  if (!clean || clean === "." || clean === "./") return "./";
  if (/^(?:[a-z]+:|\/\/|data:|blob:)/i.test(clean)) return null;
  if (clean.startsWith("/")) return null; // Dash intentionally uses relative URLs on GitHub Pages.

  const from = fromRel.replace(/^\.\//, "");
  const joined = path.posix.normalize(path.posix.join(path.posix.dirname(from), clean));
  if (joined === ".") return "./";
  if (joined.startsWith("../")) return null;
  return `./${joined.replace(/^\.\//, "")}`;
}

function addDependency(queue, seen, fromRel, spec) {
  const rel = localAsset(fromRel, spec);
  if (!rel || seen.has(rel)) return;
  seen.add(rel);
  queue.push(rel);
}

function htmlDependencies(rel, source, queue, seen) {
  const clean = source.replace(/<!--[\s\S]*?-->/g, "");
  for (const match of clean.matchAll(/<(?:script|link)\b[^>]*(?:src|href)\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
    addDependency(queue, seen, rel, match[1]);
  }
}

function jsDependencies(rel, source, queue, seen) {
  // Remove block comments and full-line // comments first, so deliberately
  // shelved imports stay documentation rather than becoming false dependencies.
  const clean = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .filter((line) => !/^\s*\/\//.test(line))
    .join("\n");

  const staticImport = /^\s*(?:import|export)\s+(?:[^;\n]*?\s+from\s+)?["']([^"']+)["']/gm;
  for (const match of clean.matchAll(staticImport)) addDependency(queue, seen, rel, match[1]);

  // Literal dynamic imports are rare in Dash, but if one is introduced it is
  // just as much an offline dependency as a static import.
  for (const match of clean.matchAll(/import\s*\(\s*["']([^"']+)["']\s*\)/g)) {
    addDependency(queue, seen, rel, match[1]);
  }
}

function cssDependencies(rel, source, queue, seen) {
  const clean = source.replace(/\/\*[\s\S]*?\*\//g, "");

  // A data: image can contain CSS-looking text of its own. Dash's sketch-paper
  // SVG contains filter='url(%23n)'; scanning inside that quoted data URL made
  // the first version of this test invent a file named css/%23n. Remove quoted
  // data URLs before looking for real stylesheet dependencies.
  const withoutDataUrls = clean.replace(/url\(\s*(["'])data:[\s\S]*?\1\s*\)/gi, "");

  for (const match of withoutDataUrls.matchAll(/@import\s+(?:url\(\s*)?["']([^"']+)["']/gi)) {
    addDependency(queue, seen, rel, match[1]);
  }
  for (const match of withoutDataUrls.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
    addDependency(queue, seen, rel, match[1].trim());
  }
}

function manifestDependencies(rel, source, queue, seen) {
  let manifest;
  try {
    manifest = JSON.parse(source);
  } catch (error) {
    fail("manifest.json is valid JSON", error.message);
    return;
  }
  for (const icon of manifest.icons || []) addDependency(queue, seen, rel, icon.src);
}

function discoverRuntimeAssets() {
  const seen = new Set(["./index.html", "./manifest.json"]);
  const queue = ["./index.html", "./manifest.json"];

  while (queue.length) {
    const rel = queue.shift();
    if (rel === "./") continue;
    const diskRel = rel.replace(/^\.\//, "");
    const absolute = path.join(ROOT, diskRel);
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) continue;

    const source = fs.readFileSync(absolute, "utf8");
    if (rel.endsWith(".html")) htmlDependencies(rel, source, queue, seen);
    else if (rel.endsWith(".js") || rel.endsWith(".mjs")) jsDependencies(rel, source, queue, seen);
    else if (rel.endsWith(".css")) cssDependencies(rel, source, queue, seen);
    else if (rel.endsWith("manifest.json")) manifestDependencies(rel, source, queue, seen);
  }

  return seen;
}

function sameSet(a, b) {
  if (a.size !== b.size) return false;
  for (const item of a) if (!b.has(item)) return false;
  return true;
}

function git(args, options = {}) {
  return execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  }).trim();
}

function parentCommit() {
  try {
    return git(["rev-parse", "HEAD^"]);
  } catch {
    // actions/checkout normally gives CI only the current commit. Deepen by one
    // there so this test can compare the upload without changing the workflow.
    if (process.env.GITHUB_ACTIONS === "true") {
      try {
        git(["fetch", "--quiet", "--deepen=1", "origin"]);
        return git(["rev-parse", "HEAD^"]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

console.log("\n--- release safety: current offline shell ---");
const currentWorker = parseWorker(read("sw.js"));
const currentShell = new Set(currentWorker.shell);

if (currentWorker.version) pass(`CACHE_VERSION is present (${currentWorker.version})`);
else fail("sw.js declares CACHE_VERSION", "Expected: const CACHE_VERSION = \"dash-v…\";");

if (currentShell.size === currentWorker.shell.length) pass(`SHELL has no duplicate paths (${currentShell.size} entries)`);
else {
  const counts = new Map();
  for (const rel of currentWorker.shell) counts.set(rel, (counts.get(rel) || 0) + 1);
  const duplicates = [...counts].filter(([, n]) => n > 1).map(([rel]) => rel);
  fail("SHELL has no duplicate paths", duplicates.join(", "));
}

const missingShellFiles = [...currentShell]
  .filter((rel) => rel !== "./")
  .filter((rel) => !fs.existsSync(path.join(ROOT, rel.replace(/^\.\//, ""))));
if (!missingShellFiles.length) pass("every file named in SHELL exists");
else fail("every file named in SHELL exists", `Missing: ${missingShellFiles.join(", ")}`);

const runtimeAssets = discoverRuntimeAssets();
const absentFromShell = [...runtimeAssets]
  .filter((rel) => rel !== "./")
  .filter((rel) => !ONLINE_ONLY_RUNTIME_ASSETS.has(rel))
  .filter((rel) => !currentShell.has(rel));
if (!absentFromShell.length) {
  const requiredCount = [...runtimeAssets]
    .filter((rel) => rel !== "./" && !ONLINE_ONLY_RUNTIME_ASSETS.has(rel)).length;
  pass(`every required runtime asset is covered by SHELL (${requiredCount} files)`);
}
else {
  fail(
    "every active runtime asset is covered by SHELL",
    `Dash loads ${absentFromShell.join(", ")}, but sw.js does not cache ${absentFromShell.length === 1 ? "it" : "them"}. Add ${absentFromShell.length === 1 ? "it" : "them"} to SHELL and bump CACHE_VERSION.`
  );
}

console.log("\n--- release safety: this commit ---");
let inGit = true;
try {
  inGit = git(["rev-parse", "--is-inside-work-tree"]) === "true";
} catch {
  inGit = false;
}

if (!inGit) {
  pass("commit comparison skipped outside a git checkout (current-tree checks still ran)");
} else {
  const parent = parentCommit();
  if (!parent) {
    pass("commit comparison skipped because no parent commit is available");
  } else {
    const changed = git(["diff", "--name-only", "--diff-filter=ACMRTD", parent, "HEAD", "--"])
      .split(/\r?\n/)
      .filter(Boolean);
    const changedSet = new Set(changed);

    let previousSource = "";
    try {
      previousSource = git(["show", `${parent}:sw.js`]);
    } catch {
      previousSource = "";
    }
    const previousWorker = parseWorker(previousSource);
    const previousShell = new Set(previousWorker.shell);

    const cachedPaths = new Set(
      [...currentShell, ...previousShell]
        .filter((rel) => rel !== "./")
        .map((rel) => rel.replace(/^\.\//, ""))
    );
    const changedCachedFiles = changed.filter((rel) => cachedPaths.has(rel));

    if (!changedCachedFiles.length) {
      pass("this commit did not change any file cached by the app shell");
    } else if (changedSet.has("sw.js")) {
      pass(`sw.js changed with cached app files (${changedCachedFiles.join(", ")})`);
    } else {
      fail(
        "cached app changes include sw.js in the same commit",
        `Changed cached file${changedCachedFiles.length === 1 ? "" : "s"}: ${changedCachedFiles.join(", ")}. Update sw.js in the same upload.`
      );
    }

    const shellMembershipChanged = !sameSet(currentShell, previousShell);
    const workerChanged = changedSet.has("sw.js");
    if (!workerChanged) {
      pass("CACHE_VERSION bump not needed for this commit");
    } else if (!previousWorker.version) {
      pass("previous CACHE_VERSION unavailable; current-tree checks still ran");
    } else if (currentWorker.version !== previousWorker.version) {
      pass(`CACHE_VERSION changed (${previousWorker.version} → ${currentWorker.version})`);
    } else {
      const why = shellMembershipChanged
        ? "The SHELL list changed"
        : "sw.js changed";
      fail(
        "a sw.js change bumps CACHE_VERSION",
        `${why}, but CACHE_VERSION is still ${currentWorker.version}. Give this release a new cache version.`
      );
    }
  }
}

console.log(failures ? `\n${failures} of ${checks} release-safety checks FAILED` : `\nall ${checks} release-safety checks passed`);
process.exit(failures ? 1 : 0);
