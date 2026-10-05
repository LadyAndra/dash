// Round 1.2 (October 2026): the desk's right-click, the post-it hand, and the
// calmer date field.
//
//   node tests/round1-2-desk-and-dates.test.mjs      (needs jsdom)
//
// What has to be true, and why each matters:
//   - Right-clicking BARE desk offers New entry, Milestone and Post-it.
//     New entry makes one entry, files it in this project, puts it on the desk
//     as the top card, and opens it. Milestone opens the Milestones drawer with
//     the cursor in its "Add a milestone" box and writes NOTHING (no blank
//     milestones from a stray click). Post-it makes one post-it.
//   - Right-clicking a card or a post-it still gets its own menu, not this one.
//   - Post-its are written in Beth Ellen, shipped in-repo (OFL), cached offline.
//   - A phase's date field holds the drawer still while the pointer is on it
//     (the "jumping between random dates" fix), and always lets go.
import { JSDOM } from 'jsdom';
import { readFileSync, existsSync } from 'node:fs';

const dom = new JSDOM('<!doctype html><body><div id="host"></div><div id="toasts"></div></body>', {
  pretendToBeVisual: true, url: 'https://ladyandra.github.io/dash/',
});
for (const k of ['window','document','Node','Element','HTMLElement','SVGElement','MutationObserver',
                 'requestAnimationFrame','getComputedStyle','CustomEvent','Event','PointerEvent',
                 'MouseEvent','KeyboardEvent','FileReader','Blob','URL'])
  globalThis[k] = dom.window[k];
globalThis.localStorage = dom.window.localStorage;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
Object.defineProperty(dom.window, 'innerWidth', { get: () => 1440, configurable: true });
Object.defineProperty(dom.window, 'innerHeight', { get: () => 900, configurable: true });
dom.window.matchMedia = (q) => ({ matches: q.includes('pointer: fine'), addEventListener(){}, removeEventListener(){} });

const { Store, PROJECT_LINK } = await import('../js/store.js');
const { renderProjectPage } = await import('../js/views/desk.js');
const { renderMilestoneEditor } = await import('../js/views/milestone-editor.js');
const { deskData } = await import('../js/desk.js');

let fail = 0, n = 0;
const ok = (name, c, extra = "") => { n++; if (!c) fail++; console.log((c ? "PASS  " : "FAIL  ") + name + (c ? "" : "\n      " + extra)); };
const click = (node) => node.dispatchEvent(new dom.window.Event('click', { bubbles: true, cancelable: true }));
const frame = () => new Promise(r => setTimeout(r, 40));
const rightClick = (node, x = 600, y = 400) =>
  node.dispatchEvent(Object.assign(new dom.window.Event('contextmenu', { bubbles: true, cancelable: true }), { clientX: x, clientY: y }));
const menuItems = () => [...document.querySelectorAll('.desk-menu .desk-menu-item')];
const closeEverything = () => {
  document.querySelector('.desk-menu')?.remove();
  document.querySelectorAll('.modal-scrim').forEach(s => s.remove());
};

function harness() {
  const store = new Store();
  const pid = store.createItem({ title: "Studio", type: "project" });
  const a = store.createItem({ title: "Alpha" });
  store.assignToProject(a, pid);
  store.placeOnDesk(a, pid, { x: 200, y: 200 }, 1);
  const ctx = {
    store, viewLocal: {}, selection: { active: false }, onOpen(){}, sync: null,
    holdRenders: () => () => {}, rerender() {},
  };
  const host = document.getElementById('host');
  host.innerHTML = "";
  const page = renderProjectPage(store, store.get(pid), ctx, { onBack(){}, onEdit(){}, onNew(){}, onAdd(){} });
  host.appendChild(page);
  const deskEl = page.querySelector('.desk-surface');
  deskEl.setPointerCapture = () => {};
  return { store, pid, a, ctx, page, deskEl };
}

// ===================================================================
console.log("\n--- right-click on bare desk ---");
{
  const h = harness();
  rightClick(h.deskEl);
  ok("right-clicking bare desk opens a menu", !!document.querySelector('.desk-menu'));
  ok("...offering New entry, Milestone and Post-it, in that order",
     menuItems().map(b => b.textContent).join(",") === "New entry,Milestone,Post-it",
     menuItems().map(b => b.textContent).join(","));
  ok("...as real buttons with words on them (not the icon-only delete slip)",
     !document.querySelector('.desk-menu-delete-only') && menuItems().every(b => b.tagName === "BUTTON"));
  closeEverything();

  const card = h.page.querySelector(`.dcard[data-id="${h.a}"]`);
  rightClick(card);
  ok("a CARD still gets its own menu, the delete scribble (Move to trash), not this one",
     menuItems().length === 1 && menuItems()[0].getAttribute('aria-label') === "Move to trash" &&
     !!document.querySelector('.desk-menu-delete-only'));
  closeEverything();
}
{
  const h = harness();
  const before = h.store.all().length;
  rightClick(h.deskEl);
  click(menuItems().find(b => b.textContent === "New entry"));
  const fresh = h.store.all().filter(it => it.id !== h.a && it.id !== h.pid);
  ok("New entry makes exactly one entry", h.store.all().length === before + 1 && fresh.length === 1);
  const id = fresh[0]?.id;
  ok("...filed in this project", !!id && h.store.get(id).links.some(l => l.target === h.pid && l.label === PROJECT_LINK));
  const p = deskData(h.store.all(), h.pid).placed.find(x => x.id === id);
  ok("...and placed on the desk, not left in Unplaced", !!p);
  ok("...as the top card", !!p && p.z > 1, p && String(p.z));
  ok("...and it opens, ready to type into", !!document.querySelector('.modal-scrim'));
  closeEverything();
}
{
  const h = harness();
  h.store.pendingOps = [];
  rightClick(h.deskEl);
  click(menuItems().find(b => b.textContent === "Milestone"));
  await frame();
  ok("Milestone writes nothing yet (no blank milestone from a stray click)", h.store.pendingOps.length === 0,
     JSON.stringify(h.store.pendingOps));
  const handle = [...h.page.querySelectorAll('.desk-handle')].find(b => b.dataset.shelf === "milestones");
  ok("...it opens the Milestones drawer", handle?.getAttribute('aria-expanded') === "true");
  const add = h.page.querySelector('.desk-drawer [data-fkey="add"]');
  ok("...with the cursor in its Add a milestone box", !!add && document.activeElement === add);
  closeEverything();
}
{
  const h = harness();
  rightClick(h.deskEl, 500, 300);
  click(menuItems().find(b => b.textContent === "Post-it"));
  ok("Post-it makes exactly one post-it", h.store.notes(h.pid).length === 1);
  closeEverything();

  // Not while picking cards for a clip: that mode owns the pointer.
  h.ctx.viewLocal.desk.clipping = { picked: [] };
  rightClick(h.deskEl);
  ok("no make-something menu while picking cards for a clip", !document.querySelector('.desk-menu'));
  h.ctx.viewLocal.desk.clipping = null;
}

// ===================================================================
console.log("\n--- the post-it hand ---");
{
  const tokens = readFileSync(new URL('../css/tokens.css', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../css/app.css', import.meta.url), 'utf8');
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  ok("the font file is in the repo", existsSync(new URL('../assets/fonts/BethEllen-Regular.woff2', import.meta.url)));
  ok("...with its Open Font License beside it", /SIL Open Font License/.test(
     readFileSync(new URL('../assets/fonts/OFL-BethEllen.txt', import.meta.url), 'utf8')));
  ok("it is loaded from Dash itself, never a font service",
     /url\("\.\.\/assets\/fonts\/BethEllen-Regular\.woff2"\)/.test(tokens) && !/fonts\.(googleapis|gstatic)/.test(tokens + app));
  ok("a token names it, falling back to the body serif",
     /--font-postit:\s*"Dash Post-it Hand", var\(--font-body\)/.test(tokens));
  ok("post-its use the token, and nothing else does",
     /\.dnote-text\s*\{[^}]*font-family:\s*var\(--font-postit\)/.test(app) &&
     (app.match(/var\(--font-postit\)/g) || []).length === 1);
  ok("the service worker caches it, so post-its keep their hand offline",
     sw.includes('"./assets/fonts/BethEllen-Regular.woff2"'));
}

// ===================================================================
console.log("\n--- a phase's date field holds the drawer still ---");
{
  const store = new Store();
  const pid = store.createItem({ title: "P", type: "project" });
  store.addMilestone(pid, { label: "Draft" });
  let holds = 0, releases = 0;
  const ctx = {
    store, viewLocal: {}, selection: { active: false }, sync: null, rerender() {},
    holdRenders: () => { holds++; let done = false; return () => { if (!done) { done = true; releases++; } }; },
  };
  const section = renderMilestoneEditor(store, store.get(pid), ctx);
  document.body.appendChild(section);
  const field = section.querySelector('.ms-date-field');
  field.dispatchEvent(new dom.window.Event('pointerenter'));
  ok("resting the pointer on a date field holds redraws", holds === 1 && releases === 0);
  field.dispatchEvent(new dom.window.Event('wheel', { bubbles: true }));
  field.dispatchEvent(new dom.window.Event('wheel', { bubbles: true }));
  ok("...scrolling keeps the SAME hold (no pile-up)", holds === 1);
  field.dispatchEvent(new dom.window.Event('pointerleave'));
  ok("moving away lets go, so the drawer catches up", releases === 1);

  field.dispatchEvent(new dom.window.Event('pointerenter'));
  await new Promise(r => setTimeout(r, 2700));
  ok("...and a hold left behind lets go on its own after a short idle", releases === 2);
  ok("there are no Set or Type buttons on a phase's date", !/\bSet\b|\bType\b/.test(
     [...section.querySelectorAll('.ms-date-field button')].map(b => b.textContent).join(" ")));
  section.remove();
}

console.log(`\n${fail ? `${fail} of ${n} desk-and-dates checks FAILED` : `all ${n} desk-and-dates checks passed`}`);
process.exit(fail ? 1 : 0);
