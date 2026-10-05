// Tap targets (October 2026): every control a finger can hit stays at least
// 44px, and the mouse-only desk keeps the 24px desktop floor.
//
//   node tests/tap-targets.test.mjs        (no browser, no jsdom: reads the CSS)
//
// jsdom has no layout, so this cannot measure a button. What it CAN do is stop
// the usual way a target shrinks: someone writes `min-height: 36px` on a
// control. It checks two things:
//   1. The controls found small in the October 2026 live audit are sized from
//      the --control-min / --tap-min tokens (44px on a touch screen, 28px with
//      a mouse), never a literal number.
//   2. A sweep of every stylesheet: no control-looking selector may set a
//      literal height or width under 44px, unless it is on the short
//      allow-list below, each with the reason it is allowed.
// The live check (headless Chromium, touch emulation, real hit-area scan) was
// done by hand for this round; see docs/changes-2026-10-05-tap-targets.md.
import { readFileSync, readdirSync } from 'node:fs';

let fail = 0, n = 0;
const ok = (name, c, extra = '') => { n++; if (!c) fail++; console.log((c ? 'PASS  ' : 'FAIL  ') + name + (c ? '' : '\n      ' + extra)); };

const cssDir = new URL('../css/', import.meta.url);
const files = readdirSync(cssDir).filter(f => f.endsWith('.css'));
const read = (f) => readFileSync(new URL(f, cssDir), 'utf8');

// ---- a small CSS reader: flattens @media nesting, returns {sel, decls, file} ----
function rulesOf(file) {
  const text = read(file).replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  (function walk(src) {
    let i = 0;
    while (i < src.length) {
      const open = src.indexOf('{', i);
      if (open < 0) break;
      const head = src.slice(i, open).trim();
      let depth = 1, j = open + 1;
      while (j < src.length && depth) { if (src[j] === '{') depth++; else if (src[j] === '}') depth--; j++; }
      const body = src.slice(open + 1, j - 1);
      if (head.startsWith('@')) { if (/^@(media|supports)/.test(head)) walk(body); }
      else out.push({ sel: head.replace(/\s+/g, ' '), decls: body, file, media: false });
      i = j;
    }
  })(text);
  return out;
}
const all = files.flatMap(rulesOf);
const declsFor = (selRe) => all.filter(r => r.sel.split(',').some(s => selRe.test(s.trim()))).map(r => r.decls).join('\n');
const prop = (decls, p) => [...decls.matchAll(new RegExp(`(?:^|[;\\s])${p}\\s*:\\s*([^;]+)`, 'g'))].map(m => m[1].trim());

console.log('\n--- the tokens that carry the floor ---');
const tokens = read('tokens.css');
ok('--tap-min is 44px', /--tap-min:\s*44px/.test(tokens));
ok('--control-min follows --tap-min on touch', /--control-min:\s*var\(--tap-min\)/.test(tokens));
ok('only a fine pointer (mouse) may shrink --control-min, and not below 24px',
   /@media \(pointer: fine\)\s*\{\s*:root\s*\{\s*--control-min:\s*(\d+)px/.test(tokens) &&
   Number(/@media \(pointer: fine\)\s*\{\s*:root\s*\{\s*--control-min:\s*(\d+)px/.exec(tokens)[1]) >= 24);

console.log('\n--- controls the October 2026 audit found too small ---');
// [what it is, selector, the property that must come from a token]
const MUST = [
  ['toast Dismiss / Copy details', /^\.toast button$/, 'min-height'],
  ['toast Dismiss / Copy details (width)', /^\.toast button$/, 'min-width'],
  ['tag / project / link chip remove (x)', /^\.chip-input \.chip button$/, 'min-height'],
  ['tag / project / link chip remove (x, width)', /^\.chip-input \.chip button$/, 'min-width'],
  ['Add tag input', /^\.chip-input input$/, 'min-height'],
  ['Add tag input (editor)', /^\.editor-details \.chip-input input$/, 'min-height'],
  ['attachment Remove', /^\.attach-remove$/, 'min-height'],
  ['sidebar index rows', /^\.nav-btn$/, 'min-height'],
  ['view tabs: List and Board width', /^\.view-tab$/, 'min-width', true],
  ['editor Done button', /^\.editor-head \.btn-primary$/, 'min-height'],
  ['editor Read-aloud button', /^\.editor-head \.icon-btn$/, 'min-height'],
  ['editor Read-aloud button (width)', /^\.editor-head \.icon-btn$/, 'min-width'],
  ['editor Type / Status selects', /^\.editor-sheet \.row \.field select$/, 'min-height'],
  ['editor Assign-to-project select', /^\.editor-detail-section select$/, 'min-height'],
  ['Group by / Sort by selects', /^\.catalog-band \.band-sel$/, 'min-height'],
  ['phone Select button', /^\.catalog-band \.band-select-btn\.btn$/, 'min-height'],
  ['calendar previous / next month', /^\.cal-ctl$/, 'min-width'],
  ['calendar controls', /^\.cal-ctl$/, 'min-height'],
  ['date field clear / set buttons', /^\.fd-btn$/, 'min-height'],
  ['date field clear / set buttons (width)', /^\.fd-btn$/, 'min-width'],
  ['Text size slider', /^input\[type="range"\]$/, 'min-height'],
];
for (const [what, re, p, zeroOk] of MUST) {
  // zeroOk: the phone strip lets each tab share the full row equally
  // (min-width: 0 with flex: 1 1 0), so a bare 0 is allowed there and only there.
  const vals = prop(declsFor(re), p);
  ok(`${what}: ${p} comes from a token`, vals.length > 0 && vals.every(v => /^var\(--(control-min|tap-min)\)$/.test(v) || (zeroOk && v === '0')),
     `${p} is ${JSON.stringify(vals)}`);
}

console.log('\n--- sweep: no control sets a literal size under the floor ---');
const FLOOR = 44;
const toPx = (v) => { const m = /^(-?[\d.]+)(px|rem)$/.exec(v); return m ? Number(m[1]) * (m[2] === 'rem' ? 16 : 1) : null; };
const CONTROL = /(^|[\s>+~])(button|select|summary|\[role=["']?(?:button|tab)["']?\])\b|\.btn\b|\.icon-btn\b|-btn\b|\.chip-input input\b|\.nav-btn\b|\.view-tab\b|-remove\b|\.cal-ctl\b|\.fd-btn\b/;
// Allowed, with the reason. Each is either a mouse-only surface (Desk needs a
// fine pointer AND a wide window, js/views/desk.js supportsDesk()), a control
// that is NOT the target (a decoration inside a bigger one), or a size that is
// the glyph not the button.
const ALLOW = [
  [/\.dcard|\.desk-|\.dclip|\.dnote|\.pb-|\.select-box/, 'Desk surface: mouse only, held to the 24px floor (see the live audit)'],
  [/\.tab-icon|\.sync-dot|\.dot\b/, 'a drawing inside a larger button, not the button'],
];
const bad = [];
for (const r of all) {
  const sels = r.sel.split(',').map(s => s.trim()).filter(s => CONTROL.test(s));
  if (!sels.length) continue;
  for (const p of ['height', 'min-height', 'width', 'min-width']) {
    for (const v of prop(r.decls, p)) {
      const px = toPx(v);
      if (px === null || px >= FLOOR) continue;
      for (const s of sels) {
        if (ALLOW.some(([re]) => re.test(s))) continue;
        bad.push(`${r.file}: ${s} { ${p}: ${v} }`);
      }
    }
  }
}
ok('no control selector sets a literal height or width under 44px', bad.length === 0, '\n      ' + bad.join('\n      '));

console.log('\n--- attachment Remove is a labelled strip, not a dot on the picture ---');
const editor = readFileSync(new URL('../js/editor.js', import.meta.url), 'utf8');
ok('the attachment button says Remove in words', /class: "attach-remove".*text: "Remove"/.test(editor));
ok('...and is not positioned over the thumbnail', !/position:\s*absolute/.test(declsFor(/^\.attach-remove$/)));

console.log('\n--- the service worker serves the new CSS ---');
const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
ok('every stylesheet touched is in the offline shell', ['app.css', 'ui-cleanup.css', 'calendar.css', 'dateinput.css'].every(f => sw.includes(`./css/${f}`)));

console.log(`\n${fail ? `${fail} of ${n} tap-target checks FAILED` : `all ${n} tap-target checks passed`}`);
process.exit(fail ? 1 : 0);
