import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  isDeskImageExt,
  initialDeskImageSize,
  freshDeskImageRotation,
  proportionalResize,
  stepDeskLayer,
} from "../js/desk-images.js";

assert.equal(isDeskImageExt("jpg"), true);
assert.equal(isDeskImageExt("JPEG"), true);
assert.equal(isDeskImageExt("png"), true);
assert.equal(isDeskImageExt("webp"), true);
assert.equal(isDeskImageExt("gif"), false);
assert.equal(isDeskImageExt("svg"), false);

assert.deepEqual(initialDeskImageSize(1200, 600), { w: 330, h: 165 });
assert.deepEqual(initialDeskImageSize(100, 50), { w: 100, h: 50 });
assert.deepEqual(initialDeskImageSize(0, 0), { w: 330, h: 330 });

assert.equal(freshDeskImageRotation(() => 0), -1.6);
assert.equal(freshDeskImageRotation(() => 0.5), 0);
assert.equal(freshDeskImageRotation(() => 1), 1.6);

assert.deepEqual(proportionalResize({ w: 200, h: 100 }, 100, 0), { w: 300, h: 150 });
assert.deepEqual(proportionalResize({ w: 200, h: 100 }, -50, 0), { w: 150, h: 75 });
assert.deepEqual(proportionalResize({ w: 200, h: 100 }, -1000, -1000), { w: 144, h: 72 });
const resizedTall = proportionalResize({ w: 100, h: 200 }, 0, 100);
assert.equal(resizedTall.w, 150);
assert.equal(resizedTall.h, 300);

const units = [
  { id: "a", z: 1 },
  { id: "b", z: 2 },
  { id: "c", z: 3 },
];
assert.deepEqual(stepDeskLayer(units, "b", 1), [
  { id: "b", z: 3 },
  { id: "c", z: 2 },
]);
assert.deepEqual(stepDeskLayer(units, "b", -1), [
  { id: "b", z: 1 },
  { id: "a", z: 2 },
]);
assert.deepEqual(stepDeskLayer(units, "a", -1), []);
assert.deepEqual(stepDeskLayer(units, "c", 1), []);
assert.deepEqual(stepDeskLayer([
  { id: "a", z: 4 },
  { id: "b", z: 4 },
], "a", 1), [{ id: "a", z: 5 }]);

// Keep the no-build/offline wiring from drifting apart in a future edit.
const root = new URL("../", import.meta.url);
const text = path => readFileSync(new URL(path, root), "utf8");
const index = text("index.html");
const sw = text("sw.js");
const bootstrap = text("js/desk-images-bootstrap.js");
const runtime = text("js/desk-images-runtime.js");

assert.match(index, /css\/desk-images\.css/);
assert.match(index, /js\/desk-images-bootstrap\.js/);
for (const path of [
  "./css/desk-images.css",
  "./js/desk-images-bootstrap.js",
  "./js/desk-images-runtime.js",
  "./js/desk-images.js",
]) assert.ok(sw.includes(`"${path}"`), `${path} must be in the offline shell`);
assert.match(sw, /CACHE_VERSION = "dash-v69"/);
assert.ok(
  bootstrap.indexOf('await import("./app.js")') < bootstrap.indexOf('import("./desk-images-runtime.js")'),
  "Dash itself must start before the optional image runtime",
);
assert.match(runtime, /const LIMIT = 20/);
assert.match(runtime, /del\.textContent = "Delete"/);
assert.doesNotMatch(runtime, /input\.multiple\s*=\s*true/);

console.log("desk-images.test.mjs: ok");
