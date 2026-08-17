// Service-worker takeover must never throw away a visible navigation.
//
// This is intentionally a source-level contract test. The bug is a browser
// timing race around controllerchange; jsdom does not implement service
// workers, so pretending to reproduce that timing in jsdom would be false
// confidence. What we CAN enforce is the rule that removes the race:
//
//   controllerchange marks an update waiting;
//   reload happens only when the document is hidden.
import fs from "node:fs";

let fail = 0, n = 0;
const ok = (name, cond, extra = "") => {
  n++;
  if (!cond) fail++;
  console.log((cond ? "PASS  " : "FAIL  ") + name + (cond ? "" : "\n      " + extra));
};

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

console.log("\n--- visible tabs never reload on worker takeover ---");
ok("controllerchange is still handled",
   html.includes('navigator.serviceWorker.addEventListener("controllerchange"'));

ok("the old touched/not-touched race is gone",
   !html.includes("let touched = false") &&
   !html.includes("if (!touched)") &&
   !html.includes('addEventListener("pointerdown", noteTouch'));

ok("controllerchange records a waiting update",
   /controllerchange[\s\S]{0,250}updateWaiting\s*=\s*true/.test(html));

ok("an immediate controllerchange reload is allowed only when already hidden",
   /controllerchange[\s\S]{0,350}visibilityState\s*===\s*"hidden"[\s\S]{0,100}reloadForUpdate\(\)/.test(html));

ok("visibilitychange performs the deferred reload",
   /visibilitychange[\s\S]{0,300}updateWaiting[\s\S]{0,120}visibilityState\s*===\s*"hidden"[\s\S]{0,120}reloadForUpdate\(\)/.test(html));

console.log(fail ? `\n${fail} of ${n} FAILED` : `\nall ${n} passed`);
process.exit(fail ? 1 : 0);
