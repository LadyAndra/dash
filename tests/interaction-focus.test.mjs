// Neutral interaction state: ember is semantic, not generic selection/focus.
import fs from "node:fs";

let fail = 0, n = 0;
const ok = (name, cond, extra = "") => {
  n++;
  if (!cond) fail++;
  console.log((cond ? "PASS  " : "FAIL  ") + name + (cond ? "" : "\n      " + extra));
};

const tokens = fs.readFileSync(new URL("../css/tokens.css", import.meta.url), "utf8");
const interaction = fs.readFileSync(new URL("../css/interaction.css", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");

console.log("\n--- focus and selection use neutral interface ink ---");
ok("the shared focus ring no longer uses ember",
   /--focus-ring:[^;]*var\(--text-primary\)/.test(tokens) &&
   !/--focus-ring:[^;]*var\(--ember\)/.test(tokens));

ok("current view tabs use neutral ink",
   /\.view-tab\[aria-current="true"\][\s\S]*?box-shadow:[^;]*var\(--text-primary\)/.test(interaction));

ok("current navigation rows use neutral ink",
   /\.nav-btn\[aria-current="true"\][\s\S]*?box-shadow:[^;]*var\(--text-primary\)/.test(interaction));

ok("mount controls use a neutral mount focus ring",
   /catalog-band[\s\S]*?focus-visible[\s\S]*?box-shadow:[^;]*var\(--ink-on-mount\)/.test(interaction) &&
   !/focus-visible[\s\S]*?box-shadow:[^;]*ember/.test(interaction));

console.log("\n--- semantic ember remains available ---");
ok("ember token itself is untouched", /--ember:\s*#/.test(tokens));
ok("interaction layer does not redefine ember", !/--ember\s*:/.test(interaction));

console.log("\n--- release wiring is complete ---");
ok("interaction stylesheet loads after Projects",
   index.indexOf('href="css/interaction.css"') > index.indexOf('href="css/projects.css"'));
ok("service worker caches interaction stylesheet", sw.includes('"./css/interaction.css"'));

// This test was introduced when the interaction stylesheet shipped with
// dash-v67. The exact cache number is NOT part of the interaction feature:
// later releases must keep bumping it. Requiring "v67 or newer" preserves the
// original safety check without making every future legitimate cache bump
// break this unrelated test.
const cacheVersion = Number(sw.match(/CACHE_VERSION\s*=\s*"dash-v(\d+)"/)?.[1] || 0);
ok("service worker cache is v67 or newer",
   cacheVersion >= 67,
   `found ${cacheVersion ? `dash-v${cacheVersion}` : "no Dash cache version"}`);

console.log(fail ? `\n${fail} of ${n} FAILED` : `\nall ${n} passed`);
process.exit(fail ? 1 : 0);
