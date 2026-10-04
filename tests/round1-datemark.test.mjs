// Round 1 (October 2026): MARK A DATE.
//
//   node tests/round1-datemark.test.mjs      (needs jsdom)
//
// What has to be true:
//   - A date mark is an ordinary Item (type "datemark"): one create op, plus
//     one link op if it belongs to a project. No new op kind, no format bump.
//   - It shows on the Calendar and Home's due panel, and NOWHERE else: not in
//     List/Board/search, not in counts, not as a project member, not on the
//     desk, and it never changes a project's stage.
//   - A past mark is history on the Calendar, never "overdue" on Home.
//   - Deleting one sends it to the same trash as everything else.
//   - The form: nothing is written until Save; Cancel leaves no trace; Home
//     and the desk banner each have the button, and the desk's pre-links its
//     own project.
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body><div id="host"></div></body>', {
  pretendToBeVisual: true, url: 'https://x.test/',
});
for (const k of ['window','document','Node','Element','HTMLElement','SVGElement','MutationObserver',
                 'requestAnimationFrame','cancelAnimationFrame','getComputedStyle','CustomEvent','Event',
                 'PointerEvent','MouseEvent','KeyboardEvent','FileReader','Blob','URL'])
  globalThis[k] = dom.window[k];
globalThis.localStorage = dom.window.localStorage;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
dom.window.matchMedia = (q) => ({ matches: q.includes('pointer: fine'), addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} });

const { Store, OP, DATEMARK_TYPE, DATEMARK_LINK, PROJECT_LINK, FORMAT_VERSION } = await import('../js/store.js');
const { query } = await import('../js/query.js');
const { calendarData, todayGroups, overdueCount, SOURCES } = await import('../js/entries.js');
const { todayISO, stageOf } = await import('../js/milestones.js');
const { deskData } = await import('../js/desk.js');
const { openEditor } = await import('../js/editor.js');
const { openDateMarkEditor } = await import('../js/views/datemark-editor.js');
const { homeView } = await import('../js/views/home.js');
const { projectView } = await import('../js/views/project.js');
const { calendarView } = await import('../js/views/calendar.js');

let fail = 0, n = 0;
const ok = (name, c, extra = "") => { n++; if (!c) fail++; console.log((c ? "PASS  " : "FAIL  ") + name + (c ? "" : "\n      " + extra)); };
const settle = () => new Promise(r => setTimeout(r, 20));

const TODAY = todayISO();
function plus(days) {
  const [y, m, d] = TODAY.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days, 12);
  return todayISO(dt);
}
const topScrim = () => [...document.querySelectorAll('.modal-scrim')].pop() || null;
const clearModals = () => document.querySelectorAll('.modal-scrim').forEach(s => s.remove());

function world() {
  const store = new Store();
  const pid = store.createItem({ title: "Freelance site", type: "project" });
  const ms = store.addMilestone(pid, { label: "Research" });
  store.setMilestoneField(pid, ms, "date", plus(9));
  const note = store.createItem({ title: "Kickoff notes" });
  store.assignToProject(note, pid);
  return { store, pid, ms, note };
}

console.log("\n--- the data shape ---");
{
  const { store, pid } = world();
  store.pendingOps = [];
  const id = store.createDateMark({ title: "Launch party", date: plus(2), projectId: pid });
  ok("a linked mark is exactly two ops: create + link",
     store.pendingOps.length === 2 && store.pendingOps[0].op === OP.CREATE && store.pendingOps[1].op === OP.ADD,
     JSON.stringify(store.pendingOps.map(o => o.op)));
  const m = store.get(id);
  ok("it is an item of type datemark", m.type === DATEMARK_TYPE && m.title === "Launch party");
  ok("its date rides in the create op, at local midday",
     store.pendingOps[0].value.dates.due === new Date(...plus(2).split("-").map((v, i) => i === 1 ? +v - 1 : +v), 12).toISOString());
  ok("its project link uses its own label, not membership",
     m.links.length === 1 && m.links[0].label === DATEMARK_LINK && m.links[0].label !== PROJECT_LINK);
  ok("no new op kind, formatVersion still 3", !Object.values(OP).includes("datemark") && FORMAT_VERSION === 3);
  ok("the registry is untouched (no datemark type added)", !store.typeDef(DATEMARK_TYPE));

  store.pendingOps = [];
  store.createDateMark({ title: "Mom's birthday", date: plus(5) });
  ok("an unlinked mark is ONE op", store.pendingOps.length === 1);
  ok("the calendar has a datemark source registered", SOURCES.some(s => s.name === "datemark" && typeof s.entriesFor === "function"));
}

console.log("\n--- it shows on the Calendar and Home, and nowhere else ---");
{
  const { store, pid, note } = world();
  const stageBefore = JSON.stringify(stageOf(store.get(pid)));
  const listBefore = query(store, {}).total;
  const id = store.createDateMark({ title: "Launch party", date: plus(2), projectId: pid });

  const cal = calendarData(store, null, null).entries.find(e => e.itemId === id);
  ok("the Calendar gets it as a `due` entry from the datemark source",
     !!cal && cal.source === "datemark" && cal.kind === "due" && cal.start === plus(2));
  ok("...carrying its project's name as context", cal.context === "Freelance site");
  const tg = todayGroups(store);
  ok("Home's due panel has it in the next 14 days",
     tg.upcoming.some(g => g.items.some(e => e.itemId === id)));

  ok("List / Board never see it", query(store, {}).total === listBefore);
  ok("search never finds it", query(store, { filter: { text: "launch" } }).total === 0);
  ok("store.all() leaves it out", !store.all().some(i => i.id === id));
  ok("...but store.get() still returns it, so the Calendar can open it", store.get(id)?.id === id);
  ok("it is not a member of the project", deskData(store.all(), pid).members.length === 1 &&
     deskData(store.all(), pid).members[0].id === note);
  ok("the project's stage is unchanged", JSON.stringify(stageOf(store.get(pid))) === stageBefore);
  ok("it is not counted as a project", store.projects().length === 1);
}

console.log("\n--- a past mark is history, not debt ---");
{
  const { store } = world();
  const before = overdueCount(store);
  const id = store.createDateMark({ title: "Old deadline", date: plus(-6) });
  ok("it does not raise the overdue badge", overdueCount(store) === before);
  ok("it is not in Home's Overdue band", !todayGroups(store).overdue.some(e => e.itemId === id));
  const e = calendarData(store, null, null).entries.find(x => x.itemId === id);
  ok("the Calendar still has it, drawn as done (history)", !!e && e.done === true && e.overdue === false);
  const t = store.createDateMark({ title: "Today thing", date: TODAY });
  ok("a mark for TODAY is live and in Today", todayGroups(store).now.some(x => x.itemId === t));
}

console.log("\n--- trash, restore, snapshot ---");
{
  const { store, pid } = world();
  const id = store.createDateMark({ title: "Launch party", date: plus(2), projectId: pid });
  store.trash(id);
  ok("trashing a mark takes it off the Calendar", !calendarData(store, null, null).entries.some(e => e.itemId === id));
  ok("...and off Home", !todayGroups(store).upcoming.some(g => g.items.some(e => e.itemId === id)));
  ok("...and puts it in the same trash", store.trashed().some(i => i.id === id));
  const snap = JSON.parse(JSON.stringify(store.toSnapshot()));
  const again = new Store(); again.loadSnapshot(snap);
  ok("a trashed mark survives a snapshot reload", again.trashed().some(i => i.id === id));
  store.restore(id);
  const live = store.createDateMark({ title: "Studio visit", date: plus(4) });
  const snap2 = JSON.parse(JSON.stringify(store.toSnapshot()));
  const third = new Store(); third.loadSnapshot(snap2);
  ok("live marks survive a snapshot reload too (Fable's must-fix)",
     third.dateMarks().length === 2 && third.dateMarks().some(m => m.id === live));
  ok("restore puts it back on the Calendar with its project",
     calendarData(store, null, null).entries.find(e => e.itemId === id)?.context === "Freelance site");
}

console.log("\n--- two devices ---");
{
  const { store: mac, pid } = world();
  const id = mac.createDateMark({ title: "Launch party", date: plus(2), projectId: pid });
  const ipad = new Store();
  ipad.replayLog(mac.drainPendingAsLines().map(JSON.parse));
  ok("the mark arrives on the other device, on its Calendar",
     calendarData(ipad, null, null).entries.some(e => e.itemId === id && e.context === "Freelance site"));
}

console.log("\n--- the form ---");
{
  const { store, pid } = world();
  const ed = openDateMarkEditor(store, {});
  const modal = ed.el;
  ok("it opens as a labelled dialog called Mark a date",
     modal.getAttribute('role') === 'dialog' && modal.querySelector('h2').textContent === "Mark a date");
  ok("three fields: title, date, project — nothing else",
     !!modal.querySelector('input[type="text"]') && !!modal.querySelector('.flipdate') && !!modal.querySelector('select') &&
     modal.querySelectorAll('input[type="text"], textarea').length === 1);
  ok("project starts as No project on Home", modal.querySelector('select').value === "");
  ok("every field has a visible label tied to it",
     !!modal.querySelector(`label[for="${modal.querySelector('input[type="text"]').id}"]`) &&
     !!modal.querySelector(`label[for="${modal.querySelector('select').id}"]`));

  store.pendingOps = [];
  modal.querySelector('.datemark-save').click();
  ok("Save with no title writes nothing and says why",
     store.pendingOps.length === 0 && /name/i.test(modal.querySelector('.datemark-error').textContent));
  modal.querySelector('input[type="text"]').value = "Portfolio review";
  modal.querySelector('select').value = pid;
  modal.querySelector('.datemark-save').click();
  const made = store.dateMarks().find(m => m.title === "Portfolio review");
  ok("Save makes the mark, today by default", !!made && calendarData(store, null, null).entries.some(e => e.itemId === made.id && e.start === TODAY));
  ok("...linked to the chosen project", store.dateMarkProject(made.id)?.id === pid);
  ok("...and closes the form", !modal.isConnected);

  const ed2 = openDateMarkEditor(store, {});
  ed2.el.querySelector('input[type="text"]').value = "Never mind";
  store.pendingOps = [];
  [...ed2.el.querySelectorAll('button')].find(b => b.textContent === "Cancel").click();
  ok("Cancel leaves no trace", store.pendingOps.length === 0 && !store.dateMarks().some(m => m.title === "Never mind"));

  // Editing an existing mark: openEditor routes it here.
  openEditor(store, made.id, {});
  const s = topScrim();
  ok("opening a mark from anywhere gets the small form, not the full editor",
     !!s.querySelector('.datemark-sheet') && !s.querySelector('.editor-sheet'));
  ok("...titled Edit date and prefilled", s.querySelector('h2').textContent === "Edit date" &&
     s.querySelector('input[type="text"]').value === "Portfolio review" && s.querySelector('select').value === pid);
  s.querySelector('select').value = "";
  s.querySelector('.datemark-save').click();
  ok("changing the project to none removes the link", !store.dateMarkProject(made.id) && store.get(made.id).links.length === 0);

  openEditor(store, made.id, {});
  const s2 = topScrim();
  const trashBtn = [...s2.querySelectorAll('button')].find(b => b.textContent === "Move to trash");
  ok("an existing mark has Move to trash", !!trashBtn);
  trashBtn.click();
  ok("...which sends it to the trash", store.trashed().some(i => i.id === made.id));
  clearModals();
}

console.log("\n--- Escape closes the form without writing ---");
{
  const { store } = world();
  const ed = openDateMarkEditor(store, {});
  ed.el.querySelector('input[type="text"]').value = "Escaped";
  store.pendingOps = [];
  document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: "Escape", bubbles: true }));
  ok("Escape closes it", !ed.el.isConnected);
  ok("...writing nothing", store.pendingOps.length === 0);
}

console.log("\n--- the buttons: Home and the project desk ---");
{
  const { store, pid } = world();
  const host = document.getElementById('host');
  const ctx = { store, viewLocal: {}, selection: { active: false }, onOpen: (id) => openEditor(store, id, {}),
                onNew(){}, sync: null, isCollapsed: () => false, toggleCollapse(){},
                holdRenders: () => () => {}, rerender: () => homeView.render(null, ctx, host) };
  ctx.rerender();
  const btn = [...host.querySelectorAll('button')].find(b => /Mark a date/.test(b.textContent));
  ok("Home has a Mark a date button", !!btn);
  ok("...that is NOT part of the capture well", !btn.closest('.capture'));
  btn.click();
  const s = topScrim();
  ok("it opens the form with no project", !!s?.querySelector('.datemark-sheet') && s.querySelector('select').value === "");
  s.querySelector('input[type="text"]').value = "Gallery opening";
  s.querySelector('.datemark-save').click();
  const row = [...host.querySelectorAll('.today-row')].find(r => /Gallery opening/.test(r.textContent));
  ok("the new mark is on Home's due panel straight away", !!row);
  ok("...wearing a plain Date mark, not a type or status chip",
     [...row.querySelectorAll('.mk')].some(m => m.textContent === "Date") && !/datemark/i.test(row.textContent));
  const inCollection = [...host.querySelectorAll('.stat')].find(x => /In collection/.test(x.textContent));
  ok("Home's In collection count does not include marks", inCollection.querySelector('.stat-num').textContent === String(store.all().length));

  row.click();
  ok("tapping its row opens the small form", !!topScrim()?.querySelector('.datemark-sheet'));
  clearModals();

  // The desk.
  const pctx = { store, viewLocal: { projectId: pid }, selection: { active: false }, onOpen(){}, sync: null,
                 isCollapsed: () => false, toggleCollapse(){}, holdRenders: () => () => {},
                 rerender: () => projectView.render(null, pctx, host) };
  host.innerHTML = "";
  pctx.rerender();
  const deskBtn = host.querySelector('.pb-acts .banner-mark-date');
  ok("the project desk banner has a Mark a date button", !!deskBtn && /Mark a date/.test(deskBtn.textContent));
  ok("...beside the + new entry button", deskBtn.previousElementSibling?.classList.contains('banner-new-entry'));
  deskBtn.click();
  const ds = topScrim();
  ok("on the desk the form opens pre-linked to THIS project", ds.querySelector('select').value === pid);
  ds.querySelector('input[type="text"]').value = "Client call";
  ds.querySelector('.datemark-save').click();
  const cc = store.dateMarks().find(m => m.title === "Client call");
  ok("and saves linked to it", store.dateMarkProject(cc.id)?.id === pid);
  ok("the desk's member count is unchanged", /1 entry/.test(host.querySelector('.pb-line').textContent), host.querySelector('.pb-line').textContent);
  projectView.render(null, { ...pctx, viewLocal: {} }, host);
  clearModals();
}

console.log("\n--- the Calendar draws it, and opens it ---");
{
  const { store } = world();
  const id = store.createDateMark({ title: "Launch party", date: plus(2) });
  const host = document.getElementById('host');
  host.innerHTML = "";
  const opened = [];
  const ctx = { store, viewLocal: {}, selection: { active: false }, sync: null, onOpen: (x) => opened.push(x),
                onNew(){}, isCollapsed: () => false, toggleCollapse(){}, holdRenders: () => () => {},
                rerender: () => calendarView.render(null, ctx, host) };
  ctx.rerender();
  await settle();
  const mark = host.querySelector(`[data-eid="dm:${id}"]`);
  ok("the Calendar draws a mark for it", !!mark, host.querySelectorAll('[data-eid]').length + " marks drawn");
  ok("...with its name in the mark's spoken label", /Launch party/.test(mark?.getAttribute('aria-label') || ""));
  mark?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  ok("clicking it asks to open the mark itself", opened[0] === id);
}

console.log(`\n${fail ? `${fail} of ${n} date mark checks FAILED` : `all ${n} date mark checks passed`}`);
process.exit(fail ? 1 : 0);
