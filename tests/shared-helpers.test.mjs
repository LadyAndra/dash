// shared-helpers.test.mjs: the date helpers and the phone check each live in ONE place.
//
// Background (October 2026 audit, Round B): parseISO, toISO and daysInMonth
// were written out twice, word for word (views/calendar.js and
// widgets/flipdate.js), and the phone check three times (app.js, mobile-chrome.js,
// ui-cleanup.js, one of them with the number 600 typed in directly). Copies
// like that drift apart one small fix at a time.
//
// Promises tested here:
//   1. The shared helpers do the right thing, including leap years and bad input.
//   2. calendar.js and flipdate.js still export the same names, and they are
//      the SAME functions as in js/dates.js (so nothing that imports them broke).
//   3. isTouchDevice (the successor to that phone check) says yes to phones and
//      tablets of any size, no to laptops and narrow desktop windows, and
//      treats a browser that throws as a desktop.
//   4. Nobody has quietly written a second copy.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const dom = new JSDOM('<!doctype html><body></body>', {
  pretendToBeVisual: true,
  url: 'https://ladyandra.github.io/dash/',
});
for (const k of ['window','document','Node','Element','HTMLElement','SVGElement','MutationObserver','requestAnimationFrame','getComputedStyle','CustomEvent','Event','PointerEvent','MouseEvent','FileReader','Blob','URL'])
  globalThis[k] = dom.window[k];
globalThis.localStorage = dom.window.localStorage;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
dom.window.matchMedia = () => ({ matches: false, addEventListener(){}, removeEventListener(){} });

let fail = 0;
const ok = (name, cond, extra = '') => {
  if (!cond) fail++;
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (cond ? '' : '\n      ' + extra));
};

const dates = await import('../js/dates.js');
const device = await import('../js/device.js');
const flip = await import('../js/widgets/flipdate.js');
const cal = await import('../js/views/calendar.js');

console.log('\n--- the shared date helpers ---');
{
  const { parseISO, toISO, daysInMonth } = dates;
  const p = parseISO('2026-10-05');
  ok('parseISO reads a date', p && p.y === 2026 && p.mo === 10 && p.d === 5);
  ok('parseISO says null to nonsense', ['', null, undefined, '2026-1-5', '10/05/2026', '2026-10-05T00:00', 'abcd-ef-gh', 20261005].every((v) => parseISO(v) === null));
  ok('toISO pads months and days', toISO(2026, 3, 7) === '2026-03-07' && toISO(2026, 12, 31) === '2026-12-31');
  ok('toISO and parseISO round-trip', toISO(...Object.values(parseISO('2028-02-29'))) === '2028-02-29');
  ok('February has 29 days in a leap year, 28 otherwise', daysInMonth(2028, 2) === 29 && daysInMonth(2026, 2) === 28);
  ok('century years follow the leap rule', daysInMonth(2100, 2) === 28 && daysInMonth(2000, 2) === 29);
  ok('long and short months', daysInMonth(2026, 1) === 31 && daysInMonth(2026, 4) === 30 && daysInMonth(2026, 12) === 31);
}

console.log('\n--- the old homes still export the same functions ---');
for (const name of ['parseISO', 'toISO', 'daysInMonth']) {
  ok(`flipdate.js still exports ${name}, and it is the shared one`, flip[name] === dates[name]);
  ok(`calendar.js still exports ${name}, and it is the shared one`, cal[name] === dates[name]);
}

console.log('\n--- isTouchDevice: phone AND iPad are out, any screen size ---');
{
  const set = ({ coarse, w, h, throws = false }) => {
    dom.window.matchMedia = (q) => {
      if (throws) throw new Error('no matchMedia here');
      return { matches: /pointer:\s*coarse/.test(q) ? coarse : false, addEventListener(){}, removeEventListener(){} };
    };
    dom.window.innerWidth = w;
    dom.window.innerHeight = h;
  };
  set({ coarse: true, w: 390, h: 844 });
  ok('an iPhone held upright is a touch device', device.isTouchDevice() === true);
  set({ coarse: true, w: 844, h: 390 });
  ok('an iPhone turned sideways still is', device.isTouchDevice() === true);
  set({ coarse: true, w: 820, h: 1180 });
  ok('an iPad held upright is a touch device', device.isTouchDevice() === true);
  set({ coarse: true, w: 1366, h: 1024 });
  ok('the biggest iPad, turned sideways, still is (size does not matter)', device.isTouchDevice() === true);
  set({ coarse: false, w: 390, h: 844 });
  ok('a narrow desktop window (mouse) is NOT a touch device', device.isTouchDevice() === false);
  set({ coarse: false, w: 1440, h: 900 });
  ok('a normal desktop is not', device.isTouchDevice() === false);
  set({ coarse: true, w: 390, h: 844, throws: true });
  ok('a browser that throws is treated as a desktop (the app opens)', device.isTouchDevice() === false);
  ok('the old phone-size limit is gone', device.PHONE_SHORT_SIDE_MAX === undefined && device.isPhoneUI === undefined);
}

console.log('\n--- no second copy has crept back ---');
{
  const files = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.js')) files.push(full);
    }
  })(path.join(ROOT, 'js'));
  const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');
  const defining = (re) => files.filter((f) => re.test(fs.readFileSync(f, 'utf8'))).map(rel);

  for (const [name, home] of [['parseISO', 'js/dates.js'], ['toISO', 'js/dates.js'], ['daysInMonth', 'js/dates.js'], ['isTouchDevice', 'js/device.js']]) {
    const where = defining(new RegExp(`^\\s*(?:export\\s+)?function\\s+${name}\\s*\\(`, 'm'));
    ok(`${name} is defined only in ${home}`, where.length === 1 && where[0] === home, `found in: ${where.join(', ') || 'nowhere'}`);
  }
  const hardCoded = defining(/shortSide\s*<=\s*\d+/);
  ok('no file decides "phone" by screen size any more', hardCoded.length === 0, hardCoded.join(', '));
  const askingTouch = defining(/matchMedia\(["']\(pointer: coarse\)["']\)/).filter((f) => f !== 'js/device.js');
  ok('only js/device.js asks whether the pointer is coarse', askingTouch.length === 0, askingTouch.join(', '));
}

console.log(fail ? `\n${fail} check(s) FAILED` : '\nAll shared-helper checks passed');
process.exit(fail ? 1 : 0);
