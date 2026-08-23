// calendar.test.mjs — the Calendar's pure logic (architecture §7's test list).
//
//   node tests/calendar.test.mjs        (needs nothing installed)
//
// Everything Calendar DRAWS is geometry a headless test can never see. What it
// can check — and what actually goes wrong — is the arithmetic underneath:
// which band of the ramp a date falls in, where a day lands on a compressed
// axis, whether a flip clock carries correctly across a month end, and whether
// a tooltip can be pushed off the edge of its container.
//
// The last section is a different kind of check: a source audit that fails the
// build if a literal colour appears anywhere in the Calendar's code. That is
// not style policing — a baked colour is precisely the bug that makes a theme
// swap need a re-render, which §7 forbids.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const cal = await import("../js/views/calendar.js");
const fd = await import("../js/widgets/flipdate.js");

let fail = 0, n = 0;
const ok = (name, cond, extra = "") => {
  n++; if (!cond) fail++;
  console.log((cond ? "PASS  " : "FAIL  ") + name + (cond || !extra ? "" : `\n      ${extra}`));
};
const near = (a, b, eps = 0.001) => Math.abs(a - b) <= eps;

const TODAY = "2026-08-22";
const due = (start, extra = {}) => ({
  id: `x:${start}`, source: "milestone", kind: "due", itemId: "p1", mid: "m1",
  label: "x", context: "P", start, end: null, allDay: true,
  done: false, overdue: false, ...extra,
});
// today + n days, built the same way milestones.js does (noon, DST-immune)
function plus(n) {
  const d = new Date(2026, 7, 22, 12);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ===================================================================
console.log("\n--- the ramp classifier, at every boundary (§1 rule 2) ---");
// The boundaries are the whole point: one day either side of 2/7/14 has to
// land in a different band, or the ramp is decorative rather than informative.
{
  const band = (n) => cal.rampOf(due(plus(n)), TODAY).key;

  ok("today is in the near band", band(0) === "near");
  ok("+2 is still near (the last day of the hard-edge band)", band(2) === "near");
  ok("+3 crosses into soon", band(3) === "soon", `got ${band(3)}`);
  ok("+7 is still soon", band(7) === "soon");
  ok("+8 crosses into mid — dye thins, grain arrives", band(8) === "mid", `got ${band(8)}`);
  ok("+14 is still mid", band(14) === "mid");
  ok("+15 crosses into far", band(15) === "far", `got ${band(15)}`);
  ok("+120 (the horizon) is far", band(cal.CAL_HORIZON_DAYS) === "far");

  ok("-1 is overdue", band(-1) === "overdue");
  ok("-400 is still just overdue, not something else", band(-400) === "overdue");

  ok("done outranks distance — a thing finished late reads as history, not debt",
     cal.rampOf(due(plus(-9), { done: true }), TODAY).key === "done");
  ok("a reminder is never a deadline, however close it is",
     cal.rampOf(due(plus(1), { kind: "remind" }), TODAY).key === "remind");
  ok("a reminder in the past is still a reminder, not overdue",
     cal.rampOf(due(plus(-3), { kind: "remind" }), TODAY).key === "remind");

  ok("grain arrives with the thinned dye and not before",
     !cal.hasGrain("near") && !cal.hasGrain("soon") &&
     cal.hasGrain("mid") && cal.hasGrain("far") &&
     !cal.hasGrain("overdue") && !cal.hasGrain("done"));
}

console.log("\n--- the ramp's percentages match the tokens they claim to be ---");
// The classifier returns a number and css/tokens.css declares one. If those
// two ever drift, the documentation in the code becomes a lie and nobody
// notices, because the SCREEN still looks fine.
{
  const tokens = fs.readFileSync(path.join(ROOT, "css/tokens.css"), "utf8");
  const tok = (name) => {
    const m = new RegExp(`--cal-dye-${name}:\\s*(\\d+)%`).exec(tokens);
    return m ? +m[1] : null;
  };
  ok("--cal-dye-near is 100%, and rampOf agrees", tok("near") === 100 && cal.rampOf(due(plus(1)), TODAY).dye === 100);
  ok("--cal-dye-soon is 100%, and rampOf agrees", tok("soon") === 100 && cal.rampOf(due(plus(5)), TODAY).dye === 100);
  ok("--cal-dye-mid is 55%, and rampOf agrees", tok("mid") === 55 && cal.rampOf(due(plus(10)), TODAY).dye === 55);
  ok("--cal-dye-far is 24%, and rampOf agrees (§9 item 1: checked on a swatch, kept)",
     tok("far") === 24 && cal.rampOf(due(plus(40)), TODAY).dye === 24);
  ok("--cal-grain-opacity and --radius-housing and --cal-fog-ceiling are all declared",
     /--cal-grain-opacity:\s*0\.45/.test(tokens) &&
     /--radius-housing:\s*6px/.test(tokens) &&
     /--cal-fog-ceiling:\s*0\.8/.test(tokens));
  ok("tokens.css parses as balanced CSS (the --focus-ring line was literally broken before this build)",
     (tokens.match(/\{/g) || []).length === (tokens.match(/\}/g) || []).length &&
     !/\\n/.test(tokens),
     "a literal backslash-n in a stylesheet silently drops the declaration after it");
}

// ===================================================================
console.log("\n--- weight is size, and only size (§1 rule 3) ---");
{
  const ms = (extra) => ({ source: "milestone", kind: "due", ...extra });
  ok("a project's FINAL milestone is 3", cal.weightOf(ms({}), true) === 3);
  ok("any other milestone is 2", cal.weightOf(ms({}), false) === 2);
  ok("a plain item's due date is 1", cal.weightOf({ source: "item-due", kind: "due" }, false) === 1);
  ok("a reminder carries no weight at all (it is hollow by rule 2)",
     cal.weightOf({ source: "milestone", kind: "remind" }, true) === 0);
  ok("radius follows weight and nothing else",
     cal.markRadius(3) === 13 && cal.markRadius(2) === 9 && cal.markRadius(1) === 6);
}

// ===================================================================
console.log("\n--- the approach axis, at CAL_HORIZON_DAYS = 120 (§2a) ---");
{
  ok("the horizon is four months, not six", cal.CAL_HORIZON_DAYS === 120);

  const W = 1000;
  const quiet = cal.approachGeometry(W, 0);
  ok("with nothing overdue the ember zone collapses to a sliver", quiet.zone === 26);
  ok("today lands exactly on the NOW line", near(cal.approachX(0, quiet), quiet.nowX));
  ok("the horizon lands exactly at the far end of the span",
     near(cal.approachX(120, quiet), quiet.nowX + quiet.span));

  let prev = -Infinity, monotone = true;
  for (let d = 0; d <= 120; d++) {
    const x = cal.approachX(d, quiet);
    if (x <= prev) monotone = false;
    prev = x;
  }
  ok("every day from today to the horizon moves strictly rightward", monotone);

  // The compression IS the theory of attention: near time spacious, far time
  // dense. If the first fortnight ever stops owning most of the strip, the
  // instrument has quietly turned back into a ruler.
  const firstFortnight = cal.approachX(14, quiet) - cal.approachX(0, quiet);
  ok("the first 14 days take more than half the strip, the remaining 106 take less",
     firstFortnight / quiet.span > 0.5,
     `14 days = ${(100 * firstFortnight / quiet.span).toFixed(1)}% of the span`);
  const dayOne = cal.approachX(1, quiet) - cal.approachX(0, quiet);
  const dayLast = cal.approachX(120, quiet) - cal.approachX(119, quiet);
  ok("tomorrow gets a wide bay; the last day of the horizon gets a sliver",
     dayOne > dayLast * 20, `+1 is ${dayOne.toFixed(1)}px, +120 is ${dayLast.toFixed(2)}px`);

  // The NOW line is anchored; the ember field behind it breathes.
  const small = cal.approachGeometry(W, 3);
  const big = cal.approachGeometry(W, 200);
  ok("more debt widens the overdue field", big.zone > small.zone);
  ok("...but it never eats more than 28% of the strip", big.zone <= 0.28 * W + 0.001);
  ok("overdue marks sit BEHIND the line", cal.approachX(-5, big) < big.nowX);
  ok("a very old debt is still on screen rather than off in the negative",
     cal.approachX(-4000, big) >= 4);

  // Month mode: the same renderer, a linear axis.
  ok("month day 1 sits on the left inset", near(cal.monthX(1, 31, W), 56));
  ok("month day 31 sits on the right inset", near(cal.monthX(31, 31, W), W - 56));
  const a = cal.monthX(10, 31, W) - cal.monthX(9, 31, W);
  const b = cal.monthX(30, 31, W) - cal.monthX(29, 31, W);
  ok("...and every day in between is the same width — this axis is LINEAR", near(a, b));
  ok("a one-day month does not divide by zero", Number.isFinite(cal.monthX(1, 1, W)));
}

// ===================================================================
console.log("\n--- the tooltip cannot be pushed off its container (§2a) ---");
{
  const host = 800, tipW = 300, tipH = 70;
  const mid = cal.tooltipPlacement({ x: 400, y: 200, r: 9, tipW, tipH, hostW: host });
  ok("in open space the card is centred on the mark", near(mid.left, 400 - tipW / 2));
  ok("...and sits above it, with the arrow pointing back down at it",
     mid.below === false && near(mid.arrowX, tipW / 2));

  const left = cal.tooltipPlacement({ x: 8, y: 200, r: 9, tipW, tipH, hostW: host });
  ok("a mark at the left edge clamps the card inside the container", left.left === 6);
  ok("...and the arrow stays with the MARK, not with the card", near(left.arrowX, 2));

  const right = cal.tooltipPlacement({ x: 795, y: 200, r: 9, tipW, tipH, hostW: host });
  ok("a mark at the right edge clamps too", near(right.left, host - tipW - 6));
  ok("...arrow still on the mark", near(right.arrowX, 795 - (host - tipW - 6)));

  const top = cal.tooltipPlacement({ x: 400, y: 10, r: 9, tipW, tipH, hostW: host });
  ok("a mark near the top flips the card below it", top.below === true && top.top > 10);

  const narrow = cal.tooltipPlacement({ x: 50, y: 200, r: 9, tipW: 900, tipH, hostW: 200 });
  ok("a card wider than its container still starts inside it rather than off-screen",
     narrow.left === 6);
}

// ===================================================================
console.log("\n--- the load gauge: one continuous read, no stages (§3b) ---");
{
  const w = (e) => (e.source === "milestone" ? 2 : 1);
  ok("an empty desk reads zero", cal.loadScore([], TODAY, w) === 0);

  const one = [due(plus(3))];
  ok("one milestone in the window registers", cal.loadScore(one, TODAY, w) > 0);
  ok("the same milestone OVERDUE weighs more than it did on time",
     cal.loadScore([due(plus(-3))], TODAY, w) > cal.loadScore(one, TODAY, w));
  ok("...by exactly the documented multiplier",
     near(cal.loadScore([due(plus(-3))], TODAY, w),
          Math.round(cal.loadScore(one, TODAY, w) * cal.LOAD_OVERDUE_MULTIPLIER), 1));

  ok("something beyond the fortnight is not load yet",
     cal.loadScore([due(plus(20))], TODAY, w) === 0);
  ok("+14 is inside the window, +15 is not",
     cal.loadScore([due(plus(14))], TODAY, w) > 0 && cal.loadScore([due(plus(15))], TODAY, w) === 0);
  ok("a reminder is a nudge, not work — it never moves the gauge",
     cal.loadScore([due(plus(2), { kind: "remind" })], TODAY, w) === 0);
  ok("a finished thing is not load", cal.loadScore([due(plus(2), { done: true })], TODAY, w) === 0);

  const flood = Array.from({ length: 200 }, (_, i) => due(plus(i % 14)));
  ok("the score is clamped at 100 however bad the fortnight is",
     cal.loadScore(flood, TODAY, w) === 100);
}

console.log("\n--- the fog itself: continuous, and capped at 80% ---");
{
  const zero = cal.fogLayers(0, 0.8);
  const half = cal.fogLayers(50, 0.8);
  const full = cal.fogLayers(100, 0.8);

  ok("a quiet day has no bank of fog at all", zero.bank === 0);
  ok("...and the valley floor is where the wash starts from", zero.bankTop === 320);
  ok("half load is half the fog", near(half.bank, 0.4));
  ok("full load stops at the ceiling — the hills are NEVER fully gone", near(full.bank, 0.8));
  ok("the ceiling is honoured even if something asks for more",
     cal.fogLayers(400, 0.8).bank <= 0.8 + 1e-9);
  ok("the sky dims before the scene reads as heavy (the veil is a fraction of the bank)",
     near(full.veil, full.bank * 0.4) && half.veil < half.bank);
  ok("grain arrives with the fog and is itself capped",
     zero.grain < half.grain && half.grain < full.grain && full.grain <= 0.35);
  ok("the wash rises as load rises", full.bankTop < half.bankTop && half.bankTop < zero.bankTop);

  // "No named stops, no stepped feel." A stage boundary would show up as a
  // jump between two adjacent values; a continuous function cannot have one.
  let biggest = 0;
  for (let v = 1; v <= 100; v++) {
    biggest = Math.max(biggest, Math.abs(cal.fogLayers(v, 0.8).bank - cal.fogLayers(v - 1, 0.8).bank));
  }
  ok("no seam anywhere on the slider — every step is the same size", near(biggest, 0.008, 0.0005),
     `largest single-point change was ${biggest.toFixed(4)}`);
}

console.log("\n--- distant hills fade first ---");
{
  ok("a quiet day leaves every ridge fully painted",
     [0, 1, 2, 3].every(d => near(cal.ridgeOpacity(0, d, 3), 1)));
  // Checked at a working load rather than at the very top: at maximum the two
  // farthest ridges both bottom out, which is correct — that IS what "gone
  // into the fog" looks like — so the ordering is asserted where it is doing
  // its job, and only the floor is asserted at 100.
  const rolling = [0, 1, 2, 3].map(d => cal.ridgeOpacity(70, d, 3));
  ok("under load the farthest ridge is the most lost",
     rolling[0] < rolling[1] && rolling[1] < rolling[2] && rolling[2] < rolling[3],
     `got ${rolling.join(" < ")}`);
  const heavy = [0, 1, 2, 3].map(d => cal.ridgeOpacity(100, d, 3));
  ok("...and at maximum no ridge is ever ahead of a nearer one",
     heavy.every((v, i) => i === 0 || v >= heavy[i - 1] - 1e-9), `got ${heavy.join(", ")}`);
  ok("...with the nearest field still visibly there, even at maximum", heavy[3] > 0.2);
  let monotone = true;
  for (let v = 1; v <= 100; v++) if (cal.ridgeOpacity(v, 0, 3) > cal.ridgeOpacity(v - 1, 0, 3)) monotone = false;
  ok("fog only ever thickens as load rises", monotone);
  ok("a single-ridge landscape does not divide by zero",
     Number.isFinite(cal.ridgeOpacity(50, 0, 0)));
}

// ===================================================================
console.log("\n--- the shelf sheds in the order Andra confirmed (§3a, §9 item 3) ---");
{
  ok("a wide window keeps everything", cal.shelfShedFor(1600).length === 0);
  ok("the year radar goes first — it is texture, no information is lost",
     cal.shelfShedFor(1200).join(",") === "year");
  ok("then the open slot, which was never load-bearing",
     cal.shelfShedFor(900).join(",") === "year,open");
  ok("the dial and the load gauge hold longest — the two she would miss",
     cal.shelfPanelsFor(600).join(",") === "dial,gauge");
  ok("the shedding order never removes a panel and then puts it back",
     [1600, 1300, 1249, 1000, 949, 700, 400]
       .map(w => cal.shelfPanelsFor(w).length)
       .every((len, i, a) => i === 0 || len <= a[i - 1]));
}

// ===================================================================
// The flip clock stopped being a Calendar-only widget on August 23, 2026 and
// became the date input for the whole app. Its carry fixtures stay here,
// because the carry is §4 of the Calendar design and that has not changed;
// everything it grew to serve the editors — the compact size, the empty state,
// the unsaved-vs-saved edge, autocommit — is in tests/dateinput.test.mjs.
console.log("\n--- the flip clock carries like a real one (§4) ---");
{
  const at = (s) => fd.parseISO(s);
  const step = (s, key, dir) => {
    const v = fd.stepDate(at(s), key, dir);
    return fd.toISO(v.y, v.mo, v.d);
  };

  ok("Aug 31 + 1 day rolls the month, exactly like midnight", step("2026-08-31", "d", 1) === "2026-09-01");
  ok("Mar 1 - 1 day falls back into February", step("2026-03-01", "d", -1) === "2026-02-28");
  ok("...and finds the 29th in a leap year", step("2028-03-01", "d", -1) === "2028-02-29");
  ok("Feb 28 + 1 is Mar 1 in an ordinary year", step("2026-02-28", "d", 1) === "2026-03-01");
  ok("...but Feb 29 in a leap year", step("2028-02-28", "d", 1) === "2028-02-29");
  ok("Feb 29 + 1 is Mar 1", step("2028-02-29", "d", 1) === "2028-03-01");
  ok("Dec 31 + 1 day rolls the month AND the year", step("2026-12-31", "d", 1) === "2027-01-01");
  ok("Jan 1 - 1 day rolls both back", step("2026-01-01", "d", -1) === "2025-12-31");

  ok("moving the MONTH card clamps the day rather than rolling it (Jan 31 -> Feb)",
     step("2026-01-31", "mo", 1) === "2026-02-28",
     "someone turning the month card meant to change the month");
  ok("...and finds the leap day when there is one", step("2028-01-31", "mo", 1) === "2028-02-29");
  ok("December + 1 month rolls the year", step("2026-12-15", "mo", 1) === "2027-01-15");
  ok("January - 1 month rolls it back", step("2026-01-15", "mo", -1) === "2025-12-15");
  ok("moving the YEAR off a leap day clamps it", step("2028-02-29", "y", 1) === "2029-02-28");

  ok("the year stops at its bounds instead of running away",
     step("2100-06-01", "y", 1) === "2100-06-01" && step("2020-06-01", "y", -1) === "2020-06-01");

  // Each CHANGED unit flips exactly once — that is what makes a carry read as
  // a carry rather than as two unrelated cards twitching.
  const nye = fd.changedUnits(at("2026-12-31"), fd.stepDate(at("2026-12-31"), "d", 1));
  ok("New Year's Eve flips all three cards, once each", nye.join(",") === "d,mo,y");
  const plain = fd.changedUnits(at("2026-08-10"), fd.stepDate(at("2026-08-10"), "d", 1));
  ok("an ordinary day flips only the day card", plain.join(",") === "d");
  const rollover = fd.changedUnits(at("2026-08-31"), fd.stepDate(at("2026-08-31"), "d", 1));
  ok("a month end flips the day and the month, and leaves the year alone", rollover.join(",") === "d,mo");

  ok("the faces read the way a split-flap reads",
     fd.faceText(at("2026-08-07"), "d") === "07" &&
     fd.faceText(at("2026-08-07"), "mo") === "AUG" &&
     fd.faceText(at("2026-08-07"), "y") === "2026");
  ok("February knows how long it is", fd.daysInMonth(2028, 2) === 29 && fd.daysInMonth(2026, 2) === 28);
  ok("a flutter only kicks in past a few queued ticks, so a single tick is always deliberate",
     fd.FLUTTER_AFTER === 3 && fd.FLUTTER_MS < fd.TICK_MS);
  ok("there is no momentum constant anywhere in the widget — only pixels per tick",
     fd.DRAG_PX_PER_TICK > 0);
}

// ===================================================================
console.log("\n--- reduced motion is a real path, not a hope ---");
{
  const css = fs.readFileSync(path.join(ROOT, "css/calendar.css"), "utf8");
  const js = fs.readFileSync(path.join(ROOT, "js/widgets/flipdate.js"), "utf8");
  ok("the dial's sweep is hidden under prefers-reduced-motion",
     /@media \(prefers-reduced-motion: reduce\)[^}]*\{[^}]*\.cal-sweep[^}]*\}/s.test(css));
  ok("...and under the Motion toggle, which is a separate switch",
     /\.cal-root\[data-motion="off"\] \.cal-sweep/.test(css));
  const dateCss = fs.readFileSync(path.join(ROOT, "css/dateinput.css"), "utf8");
  ok("the flip's flaps are hidden under prefers-reduced-motion",
     /@media \(prefers-reduced-motion: reduce\)[^}]*\.fd-flap/s.test(dateCss),
     "the widget's styles moved to css/dateinput.css when it went app-wide");
  ok("...and flipdate.js carries the matching JS guard, so the timers do not run either",
     /prefers-reduced-motion/.test(js) && /prefersReducedMotion\(\)/.test(js),
     "CSS alone would hide the flap and still wait 150ms for nothing");
}

// ===================================================================
console.log("\n--- theme-swap audit: no colour is ever baked ---");
// The v3 prototype read computed colours into SVG attributes and had to
// redraw the whole instrument on a theme toggle. §7 says the build must not.
// The only way to guarantee that is for no literal colour to exist in the
// Calendar's code at all — every fill is a var() or a color-mix() of one.
{
  const HEX = /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?\b/g;
  const FUNCS = /\b(?:rgba?|hsla?|lab|lch|oklab|oklch)\s*\(/g;

  for (const rel of ["js/views/calendar.js", "js/widgets/flipdate.js",
                     "css/calendar.css", "css/dateinput.css"]) {
    const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
    const hexes = src.match(HEX) || [];
    const funcs = src.match(FUNCS) || [];
    ok(`${rel} contains no literal colour`, hexes.length === 0 && funcs.length === 0,
       `found: ${[...hexes, ...funcs].join(", ")}`);
  }

  const view = fs.readFileSync(path.join(ROOT, "js/views/calendar.js"), "utf8");
  // getComputedStyle is the mechanism the prototype used to bake colours. One
  // call survives in the build, and it reads a NUMBER, not a colour, because
  // the fog's veil is arithmetic on the bank rather than a paint value.
  const reads = view.match(/getPropertyValue\(([^)]*)\)/g) || [];
  ok("the one computed-style read in calendar.js is a number token, not a colour",
     reads.length === 1 && /name/.test(reads[0]) &&
     (view.match(/readNumberToken\(view\.root, "(--[a-z-]+)"/g) || [])
       .every(m => m.includes("--cal-fog-ceiling")),
     `reads: ${reads.join(", ")}`);

  const css = fs.readFileSync(path.join(ROOT, "css/calendar.css"), "utf8");
  ok("the dye ramp mixes into var(--surface), which is what makes it re-theme for free",
     /color-mix\(in srgb, var\(--pc[^)]*\)[^,]*,\s*var\(--surface\)\)/.test(css));

  // The landscape is the deliberate exception and is excluded above on purpose.
  // The file's own comment block explains the ridge contract in prose, so the
  // comments come out before anything is counted.
  const scene = fs.readFileSync(path.join(ROOT, "assets/window-scene.svg"), "utf8")
    .replace(/<!--[\s\S]*?-->/g, "");
  ok("assets/window-scene.svg is ART and is allowed its own colours — and says so",
     (scene.match(HEX) || []).length > 0 &&
     /ART, NOT A COMPONENT/.test(fs.readFileSync(path.join(ROOT, "assets/window-scene.svg"), "utf8")));
  ok("...and every ridge in it is tagged, which is the whole contract for the one-file swap",
     (scene.match(/class="ridge"/g) || []).length === 4 &&
     [0, 1, 2, 3].every(d => scene.includes(`data-depth="${d}"`)));
  const grain = fs.readFileSync(path.join(ROOT, "assets/grain.svg"), "utf8");
  ok("assets/grain.svg carries no colour of its own — it inherits whatever it lies on",
     (grain.match(HEX) || []).length === 0 && /feTurbulence/.test(grain));
}

// ===================================================================
console.log("\n--- registration and the phone gate, in the real app.js (§6, §7) ---");
// app.js boots the whole application on import, so this is read rather than
// run. It is still the check that matters: a view that is not in VIEWS has no
// tab, and a desktop instrument that is not gated turns up on a phone.
{
  const app = fs.readFileSync(path.join(ROOT, "js/app.js"), "utf8");
  ok("calendar.js is imported", /import \{ calendarView \} from "\.\/views\/calendar\.js";/.test(app));
  ok("...and registered in VIEWS, which is the whole of adding a tab",
     /const VIEWS = \[homeView, listView, boardView, projectView, calendarView\];/.test(app));
  ok("the existing views keep their order and their behaviour",
     /VIEWS = \[homeView, listView, boardView, projectView/.test(app));
  ok("Calendar is gated off phone-class screens, using the same isPhoneUI() Project already uses",
     /PHONE_HIDDEN_VIEWS = new Set\(\["project", "calendar"\]\)/.test(app) &&
     /PHONE_HIDDEN_VIEWS\.has\(requested\.name\) && isPhoneUI\(\)/.test(app) &&
     /PHONE_HIDDEN_VIEWS\.has\(name\) && isPhoneUI\(\)/.test(app));
  ok("there is still exactly ONE isPhoneUI() in app.js — no third copy was added",
     (app.match(/function isPhoneUI\(\)/g) || []).length === 1);
  ok("js/entries.js was not touched to make any of this work",
     !/order:/.test(fs.readFileSync(path.join(ROOT, "js/entries.js"), "utf8")
        .split("fromItem(item, emit, ctx) {")[1].split("const itemDueSource")[0]),
     "dated milestone entries still carry no .order, exactly as they did before");

  const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
  for (const f of ["./js/views/calendar.js", "./js/widgets/flipdate.js",
                   "./css/calendar.css", "./assets/grain.svg", "./assets/window-scene.svg"]) {
    ok(`sw.js caches ${f}`, sw.includes(`"${f}"`));
  }
  ok("index.html loads the Calendar stylesheet",
     /href="css\/calendar\.css"/.test(fs.readFileSync(path.join(ROOT, "index.html"), "utf8")));
}

console.log(fail ? `\n${fail} of ${n} Calendar checks FAILED` : `\nall ${n} Calendar checks passed`);
process.exit(fail ? 1 : 0);
