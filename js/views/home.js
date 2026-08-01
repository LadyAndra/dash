// home.js — the daily specimen sheet (Update 2). This is where Dash opens.
// A masthead (today's date + sheet number), then three plates:
//   I   Accession   — quick capture, the fastest-reachable thing on the sheet
//   II  Due & reminded today — fills in once dates exist (Update 3); empty now
//   III From the archive — the neglect register on the black "mount" panel,
//       your longest-untouched items (powered by the existing `touched` date).
//
// Home is a registered view like any other (§4.1). It ignores the query
// result and reads the store directly, since it's a dashboard, not a grouped
// list. viewState/viewLocal preserves the capture box across re-renders so a
// background sync never eats what you're typing.

import { el, catalogNo, typeChip, statusChip } from "./shared.js";
import { toast } from "../ui/toast.js";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

function dayOfYear(d) {
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d - start) / 86400000);
}

function startOfToday() { const d = new Date(); d.setHours(0,0,0,0); return d; }
function isToday(iso) {
  if (!iso) return false;
  const d = new Date(iso);
  if (isNaN(d)) return false;
  const t = startOfToday();
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
}
function isTodayOrPast(iso) {
  if (!iso) return false;
  const d = new Date(iso); if (isNaN(d)) return false;
  const end = startOfToday(); end.setHours(23,59,59,999);
  return d <= end;
}

function daysSince(iso) {
  if (!iso) return null;
  const d = new Date(iso); if (isNaN(d)) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

export const homeView = {
  name: "home",
  label: "Home",
  ownFilter: true,   // no group-by; Home reads the store directly

  render(_result, ctx, container) {
    const store = ctx.store;
    container.innerHTML = "";

    const sheet = el("div", { class: "sheet-page" });

    // ---------------- masthead ----------------
    const now = new Date();
    const dateLine = `${DAYS[now.getDay()]}, ${now.getDate()} ${MONTHS[now.getMonth()]}`;
    const sheetNo = `SHEET ${now.getFullYear()}·${String(dayOfYear(now)).padStart(3,"0")}`;
    const all = store.all();
    const dueToday = all.filter(i => isToday(i.dates?.due) || isToday(i.dates?.remind));

    sheet.appendChild(el("div", { class: "sheet-masthead" }, [
      el("div", { class: "sheet-masthead-top" }, [
        el("h1", { class: "sheet-h1", text: dateLine }),
        el("span", { class: "num", text: sheetNo }),
      ]),
      el("div", { class: "sheet-masthead-sub" }, [
        el("span", { class: "lbl", text: `${all.length} in collection` }),
        el("span", { class: "lbl", text: `${dueToday.length} due today` }),
      ]),
    ]));

    // ---------------- Plate I — Accession (capture) ----------------
    sheet.appendChild(plate("I", "Accession", "New entry"));
    sheet.appendChild(captureWell(ctx));

    // ---------------- Plate II — Due & reminded today ----------------
    sheet.appendChild(plate("II", "Due & reminded today", String(dueToday.length).padStart(2,"0")));
    if (dueToday.length === 0) {
      sheet.appendChild(el("div", { class: "sheet-empty" }, [
        el("p", { text: "Nothing dated for today." }),
        el("p", { class: "hint", text: "Due dates and reminders arrive in the next update — this fills in then." }),
      ]));
    } else {
      const entries = el("div", { class: "entries" });
      for (const it of dueToday) entries.appendChild(todayRow(store, it, ctx.onOpen));
      sheet.appendChild(entries);
    }

    // ---------------- Plate III — From the archive (neglect) ----------------
    sheet.appendChild(plate("III", "From the archive", "Untouched longest"));
    sheet.appendChild(neglectRegister(store, ctx.onOpen));

    container.appendChild(sheet);

    // restore capture text + focus if the user was typing before a re-render
    const box = container.querySelector(".capture textarea");
    if (box) {
      box.value = ctx.viewLocal.captureText || "";
      if (ctx.viewLocal.captureFocused) {
        try { box.focus({ preventScroll: true }); } catch { box.focus(); }
        const end = box.value.length;
        const [s, e] = ctx.viewLocal.captureSel || [end, end];
        try { box.setSelectionRange(Math.min(s, end), Math.min(e, end)); } catch {}
      }
    }
  },
};

function plate(no, title, right) {
  return el("div", { class: "plate" }, [
    el("span", { class: "plate-no", text: no }),
    el("span", { class: "plate-title", text: title }),
    right ? el("span", { class: "plate-right num", text: right }) : null,
  ]);
}

function captureWell(ctx) {
  const store = ctx.store;

  const noteSel = (e) => {
    ctx.viewLocal.captureSel = [e.target.selectionStart, e.target.selectionEnd];
  };

  // ---- sticky focus -------------------------------------------------------
  // The rule, stated plainly: the capture box keeps the cursor until you click
  // somewhere else or on a button. Nothing else gets to take it.
  //
  // Why this is needed rather than just fixing one culprit: a lot of things can
  // blow focus off a field in a live app — a re-render tearing the node out, an
  // ambient widget grabbing it, focus falling to <body> for no reason a user
  // could ever predict. Chasing them one at a time is whack-a-mole, and every
  // miss looks to you like "it went dead again". So instead of asking "who took
  // it", the box asks "did SHE hand it over?" — and if not, takes it straight
  // back on the next frame.
  //
  // A real hand-over is a blur whose relatedTarget is something you can
  // actually interact with. Focus landing on nothing is never something a
  // person did on purpose.
  const HANDOVER = 'button, a[href], input, textarea, select, [contenteditable], [tabindex], [role="button"]';

  function releaseOrKeep(e) {
    const box = e.target;
    const next = e.relatedTarget;

    if (next && next.closest && next.closest(HANDOVER)) {
      ctx.viewLocal.captureFocused = false;   // you clicked a control. It's yours.
      return;
    }
    // Switching windows or tabs isn't a hand-over either, but grabbing focus
    // back from a page that isn't frontmost is rude and can fight the browser.
    // Stay armed so the box is still live when you come back.
    ctx.viewLocal.captureFocused = true;
    if (!document.hasFocus()) return;
    // If the node is gone, the re-render's own restore pass handles it.
    if (!document.contains(box)) return;
    // preventScroll: taking focus back must never yank the page around.
    requestAnimationFrame(() => {
      if (ctx.viewLocal.captureFocused && document.contains(box) && document.activeElement !== box) {
        try { box.focus({ preventScroll: true }); } catch { box.focus(); }
        const end = box.value.length;
        const [s, en] = ctx.viewLocal.captureSel || [end, end];
        try { box.setSelectionRange(Math.min(s, end), Math.min(en, end)); } catch {}
      }
    });
  }

  const textarea = el("textarea", {
    placeholder: "Say or type anything…",
    "aria-label": "Quick capture",
    oninput: (e) => { ctx.viewLocal.captureText = e.target.value; noteSel(e); },
    // remember where the cursor is, so a re-render doesn't fling it to the end
    onkeyup: noteSel,
    onclick: noteSel,
    onselect: noteSel,
    onfocus: () => { ctx.viewLocal.captureFocused = true; },
    onblur: (e) => releaseOrKeep(e),
    onkeydown: (e) => {
      // ⌘/Ctrl + Enter files it, so capture never needs the mouse
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); fileIt(); }
    },
  });

  function fileIt() {
    const text = (ctx.viewLocal.captureText || "").trim();
    if (!text) { textarea.focus(); return; }
    // first line becomes the title; the rest (if any) becomes the body
    const nl = text.indexOf("\n");
    const title = (nl === -1 ? text : text.slice(0, nl)).trim();
    const body = nl === -1 ? "" : text.slice(nl + 1).trim();
    store.createItem({ title, body });          // defaults: Quick idea · Active
    ctx.viewLocal.captureText = "";
    ctx.viewLocal.captureFocused = true;         // keep capturing after re-render
    // store change triggers a re-render; the box comes back empty and focused
  }

  const fileBtn = el("button", { class: "btn btn-primary", text: "File it", onclick: fileIt });
  const recordBtn = el("button", { class: "btn", text: "● Record",
    onclick: () => toast("Voice capture arrives in a later phase — for now, jot it or sketch it.", "info") });
  const sketchBtn = el("button", { class: "btn", text: "✎ Sketch", onclick: () => {
    const id = store.createItem({ type: store.typeDef("sketch") ? "sketch" : undefined });
    ctx.onOpen(id);
  }});
  const editorBtn = el("button", { class: "btn", text: "Full editor", onclick: () => ctx.onNew() });

  return el("div", { class: "capture" }, [
    textarea,
    el("div", { class: "capture-row" }, [
      fileBtn, recordBtn, sketchBtn, editorBtn,
      el("span", { class: "lbl lbl-faint capture-note", text: "Files as Quick idea · Active" }),
    ]),
  ]);
}

// a today-panel row (due/remind) — same voice as a catalog entry
function todayRow(store, item, onOpen) {
  const overdue = isTodayOrPast(item.dates?.due) && !isToday(item.dates?.due);
  const meta = el("div", { class: "item-meta" }, [
    overdue ? el("span", { class: "mk mk-ember", text: "Overdue" }) : null,
    typeChip(store, item),
    statusChip(store, item),
  ]);
  const main = el("div", { class: "item-main" }, [
    meta,
    el("h3", { class: "item-title", text: item.title || "Untitled" }),
  ]);
  return el("div", {
    class: "item-row" + (overdue ? " flag" : ""),
    role: "button", tabindex: "0",
    onclick: () => onOpen(item.id),
    onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(item.id); } },
  }, [el("span", { class: "item-no", text: `№ ${catalogNo(store, item)}` }), main]);
}

// the neglect register — the black mount panel. Longest-untouched items,
// read-only (tap opens). Age color is a display hint here; the configurable
// per-type Heat view arrives in Update 3.
function neglectRegister(store, onOpen) {
  const items = store.all()
    .map(it => ({ it, age: daysSince(it.dates?.touched) }))
    .filter(x => x.age != null)
    .sort((a, b) => b.age - a.age)
    .slice(0, 6);

  const mount = el("div", { class: "mount" });
  mount.appendChild(el("div", { class: "mount-head" }, [
    el("span", { class: "lbl", text: "Neglect register" }),
    el("span", { class: "lbl", text: "Days since touched" }),
  ]));

  if (items.length === 0) {
    mount.appendChild(el("p", { class: "mount-empty", text: "Nothing filed yet." }));
    return mount;
  }

  for (const { it, age } of items) {
    const band = age >= 60 ? "stale" : age >= 30 ? "aging" : "";
    mount.appendChild(el("div", {
      class: "mount-row", role: "button", tabindex: "0",
      onclick: () => onOpen(it.id),
      onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(it.id); } },
    }, [
      el("span", { class: "mount-no", text: `№ ${catalogNo(store, it)}` }),
      el("span", { class: "mount-title", text: it.title || "Untitled" }),
      el("span", { class: `mount-age ${band}`, text: `${age}d` }),
    ]));
  }

  // the dot-cluster motif under the register — a nod to the monoprint
  const strip = el("div", { class: "heat-strip", "aria-hidden": "true" });
  const maxAge = items[0].age || 1;
  for (let i = 0; i < 18; i++) {
    const a = items[i % items.length].age;
    const cls = a >= 60 ? "cold" : a >= 30 ? "warm" : "";
    strip.appendChild(el("span", { class: `heat-dot ${cls}` }));
  }
  mount.appendChild(strip);
  return mount;
}
