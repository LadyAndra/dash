// Headless D2 tests — the same posture as desk-d1.test.mjs, for clips and
// post-its. No DOM, no browser, no install.
//
//   node tests/desk-d2.test.mjs        (from the repo root)
//
// Three things are being defended here, and only the first is obvious:
//
//   1. The `"dk"` op merges like `"ms"` and `"vs"` do — because it is the same
//      helper, and a test is the only thing that keeps "the same helper" true.
//   2. A create op arriving late cannot wipe a project's clips. This is the
//      third appearance of one bug (milestones in M1, viewState in D1), so it
//      gets a test before it gets a chance.
//   3. The post-it's paper tint actually clears AA, measured with the app's
//      own contrast maths rather than by eye — and the CSS and the JS still
//      agree about what the number is.
globalThis.localStorage = { _d:{}, getItem(k){return this._d[k]??null;}, setItem(k,v){this._d[k]=String(v);}, removeItem(k){delete this._d[k];} };
globalThis.structuredClone = globalThis.structuredClone || (o => JSON.parse(JSON.stringify(o)));

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const { Store, PROJECT_LINK, deskKey, FORMAT_VERSION } = await import('../js/store.js');
const desk = await import('../js/desk.js');
const { contrast } = await import('../js/theme.js');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let fail = 0, n = 0;
const ok = (name, cond, extra="") => { n++; if(!cond) fail++; console.log((cond?"PASS  ":"FAIL  ")+name+(cond?"":"\n      "+extra)); };
const eq = (name, a, b) => ok(name, JSON.stringify(a)===JSON.stringify(b), `got ${JSON.stringify(a)}\n      want ${JSON.stringify(b)}`);

function seeded() {
  const s = new Store();
  const pid = s.createItem({ title: "Dash", type: "project" });
  const ids = ["one","two","three","four"].map(t => s.createItem({ title: t }));
  for (const id of ids) s.assignToProject(id, pid);
  ids.forEach((id, i) => s.placeOnDesk(id, pid, { x: 100 + i * 50, y: 200 + i * 40 }, i + 1));
  return { s, pid, ids };
}
const dataOf = (s, pid) => desk.deskData(s.all(), pid, PROJECT_LINK);

// ===================================================================
console.log("\n--- the format does NOT move ---");
ok("formatVersion is still 3 — the D1 bump already covered 'dk' (§12.7)", FORMAT_VERSION === 3);
{
  const s = new Store();
  const pid = s.createItem({ title: "P", type: "project" });
  ok("a project with no clips has no deskObjects field at all",
     s.get(pid).deskObjects === undefined, JSON.stringify(s.get(pid).deskObjects));
  const snap = JSON.stringify(s.toSnapshot().items.find(i => i.id === pid));
  ok("...so its snapshot is byte-identical to one written before clips existed",
     !snap.includes("deskObjects"));
}

// ===================================================================
console.log("\n--- a clip is nearly empty, and membership lives on the card ---");
{
  const { s, pid, ids } = seeded();
  const cid = s.addClip(pid);
  s.setDeskField(ids[0], pid, "clip", cid);
  s.setDeskField(ids[1], pid, "clip", cid);

  const clips = s.clips(pid);
  ok("one clip exists", clips.length === 1 && clips[0].cid === cid);
  eq("...and it holds nothing but its own existence",
     Object.keys(clips[0]).sort(), ["cid","created","removed"]);
  ok("created is stamped", typeof clips[0].created === "string");
  ok("the clip record has no member list", clips[0].members === undefined);
  ok("the clip record has no position", clips[0].pos === undefined);

  const d = dataOf(s, pid);
  ok("the render pass finds both members", d.clips[0].members.length === 2);
  eq("...in z order, topmost last", d.clips[0].members.map(m => m.id), [ids[0], ids[1]]);
  ok("and the other two cards are loose", d.loose.length === 2);
}

console.log("\n--- at most one clip per card, enforced by the data shape ---");
{
  const { s, pid, ids } = seeded();
  const a = s.addClip(pid), b = s.addClip(pid);
  s.setDeskField(ids[0], pid, "clip", a);
  s.setDeskField(ids[0], pid, "clip", b);          // clipped into a second one
  ok("the card is in exactly one clip — the field is a scalar", s.deskRecord(ids[0], pid).clip === b);
  const d = dataOf(s, pid);
  ok("...and only that clip claims it",
     d.clips.find(c => c.cid === a).members.length === 0 &&
     d.clips.find(c => c.cid === b).members.length === 1);
}

console.log("\n--- unclipping, and a clip that has been removed ---");
{
  const { s, pid, ids } = seeded();
  const cid = s.addClip(pid);
  s.setDeskField(ids[0], pid, "clip", cid);
  s.setDeskField(ids[1], pid, "clip", cid);
  const before = s.deskRecord(ids[0], pid).pos;

  // what the "Unclip" menu item does: clear membership, tombstone the record
  for (const id of [ids[0], ids[1]]) s.setDeskField(id, pid, "clip", null);
  s.removeClip(pid, cid);

  ok("no live clips are left", s.clips(pid).length === 0);
  ok("...but the record is tombstoned, not erased", s.deskObjects(pid).clips.length === 1);
  eq("nobody was repositioned — they sit where the last drag left them",
     s.deskRecord(ids[0], pid).pos, before);
  ok("every card is loose again", dataOf(s, pid).loose.length === 4);
}
{
  // A card still pointing at a clip this device hasn't got (or that has been
  // removed) must render as an ordinary loose card, never as a repair.
  const { s, pid, ids } = seeded();
  s.setDeskField(ids[0], pid, "clip", "01NOTACLIPATALL");
  const d = dataOf(s, pid);
  ok("a dangling clip reference just reads as a loose card", d.loose.length === 4 && d.clips.length === 0);
  ok("...and nothing was written to tidy it up", s.deskRecord(ids[0], pid).clip === "01NOTACLIPATALL");
}

// ===================================================================
console.log("\n--- post-its: free, attached, and orphaned ---");
{
  const { s, pid, ids } = seeded();
  const cid = s.addClip(pid);
  s.setDeskField(ids[0], pid, "clip", cid);
  s.setDeskField(ids[1], pid, "clip", cid);

  const free = s.addNote(pid, { pos: { x: 40, y: 60 } });
  const held = s.addNote(pid, { text: "why these two", clip: cid });

  let d = dataOf(s, pid);
  ok("a free post-it is free", d.freeNotes.length === 1 && d.freeNotes[0].nid === free);
  ok("an attached one rides its clip", d.clips[0].notes.length === 1 && d.clips[0].notes[0].nid === held);

  // attaching is ONE field (§5.6) — the same object either way
  s.setNoteField(pid, free, "clip", cid);
  d = dataOf(s, pid);
  ok("attaching the free one is one op and it moves house", d.clips[0].notes.length === 2 && d.freeNotes.length === 0);
  eq("...and its position survived being ignored", s.notes(pid).find(x => x.nid === free).pos, { x: 40, y: 60 });

  // a note whose clip empties keeps its data and becomes free again (§12.3)
  for (const id of [ids[0], ids[1]]) s.setDeskField(id, pid, "clip", null);
  s.removeClip(pid, cid);
  d = dataOf(s, pid);
  ok("when the clip goes, its notes survive as free notes", d.freeNotes.length === 2);
  ok("...with their words intact", d.freeNotes.some(x => x.text === "why these two"));

  s.removeNote(pid, held);
  ok("removing a post-it is a tombstone, not an erasure",
     s.notes(pid).length === 1 && s.deskObjects(pid).notes.length === 2);
}

// ===================================================================
console.log("\n--- the arrays are stored sorted by id (byte-stable snapshots) ---");
{
  const s = new Store();
  const pid = s.createItem({ title: "P", type: "project" });
  const ops = ["c3","c1","c2"].map((id, i) => ({
    op:"dk", itemId: pid, coll:"clip", action:"add", id, value:{},
    ts:{ wall: Date.now()+i, count:1, device:"mac" },
  }));
  const s2 = new Store(); s2.replayLog([...s.pendingOps, ...ops]);
  eq("clips come out sorted whatever order they arrived in",
     s2.deskObjects(pid).clips.map(c => c.cid), ["c1","c2","c3"]);
  const s3 = new Store(); s3.replayLog([...s.pendingOps, ops[2], ops[0], ops[1]]);
  eq("...the same, from a different order", s3.deskObjects(pid).clips.map(c => c.cid), ["c1","c2","c3"]);
}

// ===================================================================
console.log("\n--- two devices, offline, merging (the M1/D1 posture) ---");
{
  const { s, pid, ids } = seeded();
  const base = s.drainPendingAsLines().map(JSON.parse);

  // The Mac clips two cards together and writes a post-it about it.
  const cid = s.addClip(pid);
  s.setDeskField(ids[0], pid, "clip", cid);
  s.setDeskField(ids[1], pid, "clip", cid);
  const nid = s.addNote(pid, { text: "these belong together", clip: cid });
  const mac = s.drainPendingAsLines().map(JSON.parse);

  // Meanwhile the iPad, with no idea any of that happened, clips the OTHER two.
  const t = (ms, c=1) => ({ wall: Date.now() + 5000 + ms, count: c, device: "ipad" });
  const cid2 = "01IPADCLIP0000000000000000";
  const ipad = [
    { op:"dk", itemId: pid, coll:"clip", action:"add", id: cid2, value:{}, ts:t(0) },
    { op:"vs", itemId: ids[2], key: deskKey(pid), action:"set", field:"clip", value: cid2, ts:t(1,2) },
    { op:"vs", itemId: ids[3], key: deskKey(pid), action:"set", field:"clip", value: cid2, ts:t(2,3) },
    { op:"dk", itemId: pid, coll:"note", action:"add", id:"01IPADNOTE000000000000000",
      value:{ text:"and these", clip: cid2 }, ts:t(3,4) },
  ];

  const perms = [
    [...base, ...mac, ...ipad],
    [...base, ...ipad, ...mac],
    [...ipad, ...base, ...mac],
    [...mac.slice(0,2), ...ipad, ...base, ...mac.slice(2)],
    [...ipad.slice(1), ...base, ...mac, ...ipad.slice(0,1)],   // a set before its add
  ];
  const canon = (v) => Array.isArray(v) ? v.map(canon)
    : (v && typeof v === "object")
      ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])]))
      : v;
  const snaps = perms.map(ops => {
    const st = new Store();
    st.replayLog(ops);
    const snap = st.toSnapshot();
    snap.generatedAt = "";
    snap.items.sort((a, b) => (a.id < b.id ? -1 : 1));
    return JSON.stringify(canon(snap));
  });
  ok("every arrival order converges byte-identically", snaps.every(x => x === snaps[0]),
     snaps.map(x => x.length).join(" vs "));

  const s2 = new Store(); s2.replayLog(perms[4]);
  const d = dataOf(s2, pid);
  ok("both devices' clips survive — zero loss", d.clips.length === 2, JSON.stringify(d.clips.map(c=>c.cid)));
  eq("...each holding the two cards it was given",
     d.clips.map(c => c.members.length).sort(), [2, 2]);
  ok("...and both post-its came with them", d.clips.every(c => c.notes.length === 1));
  ok("nothing collided, because nothing addressed the same thing", s2.collisions().length === 0,
     JSON.stringify(s2.collisions()));
  ok("the Mac's note kept its words", s2.notes(pid).some(x => x.nid === nid && x.text === "these belong together"));
}

console.log("\n--- the same post-it, two devices: one wins, the loser is reported ---");
{
  const { s, pid } = seeded();
  const nid = s.addNote(pid, { text: "first thoughts", pos: { x: 10, y: 10 } });
  const line = s.drainPendingAsLines().map(JSON.parse);
  const s2 = new Store(); s2.replayLog(line);

  const early = { op:"dk", itemId: pid, coll:"note", action:"set", id: nid, field:"text",
                  value:"the mac's words", ts:{ wall: Date.now()-2000, count:1, device:"mac" } };
  const late  = { op:"dk", itemId: pid, coll:"note", action:"set", id: nid, field:"text",
                  value:"the ipad's words", ts:{ wall: Date.now()-1000, count:1, device:"ipad" } };
  s2.replayLog([late, early]);                      // the later one arrives FIRST

  ok("the later write wins regardless of arrival order",
     s2.notes(pid)[0].text === "the ipad's words", s2.notes(pid)[0].text);
  const notes = s2.collisions();
  ok("the overwritten wording surfaces as a merge note",
     notes.length === 1 && notes[0].coll === "note" && notes[0].dkId === nid, JSON.stringify(notes));
  ok("...and can be restored", s2.restoreCollision(notes[0].key) === true);
  ok("restoring puts the lost words back", s2.notes(pid)[0].text === "the mac's words");
  localStorage.removeItem("dash.mergeNotes");
  localStorage.removeItem("dash.mergeNotesResolved");
}

console.log("\n--- different fields never contest (moving a note vs attaching it) ---");
{
  const { s, pid } = seeded();
  const cid = s.addClip(pid);
  const nid = s.addNote(pid, { text: "x", pos: { x: 1, y: 1 } });
  const base = s.drainPendingAsLines().map(JSON.parse);
  const s2 = new Store(); s2.replayLog(base);
  s2.replayLog([
    { op:"dk", itemId: pid, coll:"note", action:"set", id: nid, field:"pos",  value:{x:80,y:80},
      ts:{ wall: Date.now()+1000, count:1, device:"mac" } },
    { op:"dk", itemId: pid, coll:"note", action:"set", id: nid, field:"clip", value: cid,
      ts:{ wall: Date.now()+1001, count:1, device:"ipad" } },
  ]);
  const rec = s2.notes(pid)[0];
  ok("one device moved it and the other attached it — both facts survive",
     rec.pos.x === 80 && rec.clip === cid);
  ok("no merge note for a non-collision", s2.collisions().length === 0);
}

console.log("\n--- out of order, and add-is-idempotent ---");
{
  const { s, pid } = seeded();
  const base = s.drainPendingAsLines().map(JSON.parse);
  const nid = "01NOTE00000000000000000000";
  const add = { op:"dk", itemId: pid, coll:"note", action:"add", id: nid,
                value:{ text:"from the add", pos:{x:1,y:1} }, ts:{ wall: Date.now(), count:1, device:"mac" } };
  const set = { op:"dk", itemId: pid, coll:"note", action:"set", id: nid, field:"text",
                value:"typed later", ts:{ wall: Date.now()+500, count:1, device:"mac" } };

  const s2 = new Store(); s2.replayLog([...base, set, add]);        // backwards
  ok("the set still wins; the add only fills the blanks", s2.notes(pid)[0].text === "typed later");
  eq("...and the add is not lost either", s2.notes(pid)[0].pos, { x: 1, y: 1 });

  s2.replayLog([add, add, add]);                                    // sync re-reads the log
  ok("replaying the add is idempotent", s2.deskObjects(pid).notes.length === 1);
  ok("...and does not undo the later edit", s2.notes(pid)[0].text === "typed later");
}

console.log("\n--- remove is an LWW tombstone, so remove-vs-edit needs no special case ---");
{
  const { s, pid } = seeded();
  const nid = s.addNote(pid, { text: "hello" });
  const base = s.drainPendingAsLines().map(JSON.parse);
  const s2 = new Store(); s2.replayLog(base);
  s2.replayLog([
    { op:"dk", itemId: pid, coll:"note", action:"remove", id: nid, ts:{ wall: Date.now()-9000, count:1, device:"mac" } },
    { op:"dk", itemId: pid, coll:"note", action:"set", id: nid, field:"text", value:"goodbye",
      ts:{ wall: Date.now()-8000, count:1, device:"ipad" } },
  ]);
  ok("the removal stands", s2.notes(pid).length === 0);
  ok("...and the edit still applied to the record underneath",
     s2.deskObjects(pid).notes[0].text === "goodbye");
  s2.setNoteField(pid, nid, "removed", null);
  ok("clearing the tombstone brings it back, words and all",
     s2.notes(pid).length === 1 && s2.notes(pid)[0].text === "goodbye");
}

// ===================================================================
console.log("\n--- a late create op must not wipe a project's clips ---");
// The M1 bug (milestones) and the D1 bug (viewState), a third time. Log files
// are read independently and arrive in any order, so a project's `create` can
// land AFTER the ops for its clips. If the create's empty skeleton is allowed
// to assign over them, the clips are gone for good.
{
  const s = new Store();
  const pid = s.createItem({ title: "P", type: "project" });
  const createOp = s.pendingOps.find(o => o.op === "create" && o.itemId === pid);
  s.addClip(pid);
  const clipOps = s.pendingOps.filter(o => o.op === "dk");

  const late = new Store();
  late.replayLog([...clipOps, createOp]);            // the create arrives last
  ok("the clip survives its project's create landing late",
     late.clips(pid).length === 1, JSON.stringify(late.deskObjects(pid)));
  ok("...and the create still supplied the title", late.get(pid).title === "P");
}

console.log("\n--- an unknown collection is ignored and PRESERVED (D3 lands safely) ---");
{
  const { s, pid } = seeded();
  const base = s.drainPendingAsLines().map(JSON.parse);
  const future = { op:"dk", itemId: pid, coll:"sym", action:"add", id:"01SYM",
                   value:{ glyph:"star", pos:{x:5,y:5} }, ts:{ wall: Date.now(), count:1, device:"ipad" } };
  const s2 = new Store();
  s2.replayLog([...base, future]);                   // a D3 device got here first
  ok("a wonder symbol from a newer build does not crash this one", s2.get(pid) !== null);
  ok("...and does not materialise as anything", (s2.get(pid).deskObjects || {}).symbols === undefined);
  ok("...while the clips and notes it does understand still work", s2.clips(pid).length === 0);
}

// ===================================================================
console.log("\n--- clip geometry: derived, never stored ---");
{
  const { s, pid, ids } = seeded();
  const cid = s.addClip(pid);
  for (const id of [ids[0], ids[1], ids[2]]) s.setDeskField(id, pid, "clip", cid);
  const c = dataOf(s, pid).clips[0];

  eq("the anchor is the TOPMOST member's position", c.anchor, c.members[2].pos);
  // THE STACK IS PINNED FROM THE RIGHT (August 2026). Slots report the card's
  // RIGHT edge, because that is the edge the clip grips and the only one that
  // is the same for every member whatever each card's width turns out to be.
  eq("the closed stack steps by one offset per sheet, from the right",
     desk.stackSlot(c.anchor, 2),
     { right: c.anchor.x + desk.STACK_W + 2 * desk.STACK_DX, y: c.anchor.y + 2 * desk.STACK_DY });
  ok("every sheet in the stack is reckoned from a right edge, never a left one",
     [0, 1, 2].every(i => typeof desk.stackSlot(c.anchor, i).right === "number"
                       && desk.stackSlot(c.anchor, i).x === undefined));
  const mk = desk.markSlot(c.anchor, 3);
  ok("the mark sits on the TOP card's right corner, not the bottom one",
     mk.right === c.anchor.x + desk.STACK_W + 2 * desk.STACK_DX + desk.MARK_RX);
  ok("...and it hangs off the paper's right edge, the way a real one does",
     desk.MARK_RX > 0 && mk.right > desk.stackSlot(c.anchor, 2).right);
  ok("...and above the top of it", mk.y < desk.stackSlot(c.anchor, 2).y);

  // THE LEAN IS MIRRORED (August 16). Same hash, same range, same per-clip
  // spread — opposite direction, because the mark grips from the right now.
  const raw = desk.hashUnit("clip|" + c.cid + "|" + pid);
  ok("the clip's lean is the mirror of its hash, not the hash",
     Math.abs(desk.clipRotationOf(c.cid, pid) - (-raw * desk.CLIP_ROT_MAX_DEG)) < 1e-9);
  ok("...so it is the same size as before, the other way",
     Math.abs(desk.clipRotationOf(c.cid, pid)) <= desk.CLIP_ROT_MAX_DEG + 1e-9);
  ok("...and still identical on every device, from the same two ids",
     desk.clipRotationOf(c.cid, pid) === desk.clipRotationOf(c.cid, pid));
  ok("...and different clips still lean differently",
     desk.clipRotationOf("01AAA", pid) !== desk.clipRotationOf("01BBB", pid));

  // OPEN, THE MARK STAYS ON THE RIGHT — it is the same object in both states.
  const origin = { x: 400, y: 300 };
  const open = desk.markSlotOpen(origin, 380);
  ok("an open clip's mark is reckoned from a right edge too",
     typeof open.right === "number" && open.x === undefined);
  ok("...hanging off the first column's right edge, not its left",
     open.right === origin.x + 380 + desk.MARK_RX);
  ok("...and above the grid, clear of the first row",
     open.y < origin.y + desk.OPEN_INSET_Y);
  ok("...so opening a clip barely moves it, rather than swapping sides",
     Math.abs(open.right - desk.markSlot(origin, 1, 380).right) < 1);

  // The whole point of a derived anchor: move every member by the same delta
  // and the clip has already moved, with nothing to keep in step.
  for (const m of c.members) s.setDeskField(m.id, pid, "pos", { x: m.pos.x + 200, y: m.pos.y - 40 });
  const c2 = dataOf(s, pid).clips[0];
  eq("dragging every member moves the clip by exactly that delta",
     c2.anchor, { x: c.anchor.x + 200, y: c.anchor.y - 40 });
}

// ===================================================================
console.log("\n--- the open grid is laid out from measured cards ---");
{
  const anchor = { x: 400, y: 300 };
  const wide = (n, w, h = 180) => Array.from({ length: n }, () => ({ w, h }));

  // THE BUG THIS REPLACES: a fixed 300px column pitch against cards that size
  // themselves up to CARD_MAX_W. Anything wider than the pitch overlapped its
  // neighbour and showed only part of itself.
  const g = desk.openGrid(anchor, wide(6, desk.CARD_MAX_W), { room: 4000 });
  const overlaps = [];
  for (let i = 0; i < g.at.length; i++) {
    for (let j = i + 1; j < g.at.length; j++) {
      const a = g.at[i], b = g.at[j];
      if (Math.abs(a.x - b.x) < desk.CARD_MAX_W && Math.abs(a.y - b.y) < 180) overlaps.push([i, j]);
    }
  }
  ok("no two members of an open clip can overlap, at the widest card there is",
     overlaps.length === 0, JSON.stringify(overlaps));
  ok("...because the column pitch is the widest MEASURED card plus a gap",
     g.pitchX === desk.CARD_MAX_W + desk.OPEN_GAP_X);
  ok("...and the row pitch is the tallest one plus a gap", g.pitchY === 180 + desk.OPEN_GAP_Y);

  // the column count is derived, not the constant 3 it used to be
  ok("wide cards in a narrow window drop to fewer columns",
     desk.openGrid(anchor, wide(6, 410), { room: 900 }).cols === 2);
  ok("...to one, if that is all that fits",
     desk.openGrid(anchor, wide(6, 410), { room: 500 }).cols === 1);
  ok("narrow cards with room to spare still open three across, as delivered",
     desk.openGrid(anchor, wide(6, 260), { room: 4000 }).cols === desk.OPEN_COLS_MAX);
  ok("...and never more than three, however much room there is",
     desk.openGrid(anchor, wide(20, 260), { room: 40000 }).cols === desk.OPEN_COLS_MAX);
  ok("a clip of two opens two across, not two-of-three",
     desk.openGrid(anchor, wide(2, 260), { room: 4000 }).cols === 2);
  ok("twelve members wrap into rows rather than walking off the desk",
     desk.openGrid(anchor, wide(12, 300), { room: 4000 }).rows === 4);

  // an expanded member is left out of the pitch (it is temporarily 460 wide)
  const mixed = [{ w: 300, h: 160 }, null, { w: 280, h: 150 }];
  const gm = desk.openGrid(anchor, mixed, { room: 4000 });
  ok("a member with no measurement still gets a slot", gm.at.length === 3);
  ok("...but contributes nothing to the pitch", gm.pitchX === 300 + desk.OPEN_GAP_X);

  // clamped in the layout, the same rule §14.2 fixed for stored positions
  const corner = desk.openGrid({ x: desk.DESK_W - 100, y: desk.DESK_H - 100 }, wide(6, 400), { room: 4000 });
  const last = corner.at[corner.at.length - 1];
  ok("an open grid near the edge is pulled back onto the desk",
     last.x + 400 <= desk.DESK_W && last.y <= desk.DESK_H);
  ok("...and never off the top-left instead", corner.origin.x >= 0 && corner.origin.y >= 0);
}

// ===================================================================
console.log("\n--- an attached post-it sits where it was dropped ---");
{
  const anchor = { x: 500, y: 400 };
  eq("an offset is measured from the clip's anchor",
     desk.noteOffset(anchor, { x: 560, y: 470 }), { dx: 60, dy: 70 });
  eq("...and drawing it again puts it back in exactly that spot",
     desk.noteAt(anchor, { dx: 60, dy: 70 }), { x: 560, y: 470 });
  eq("a note attached before offsets existed gets the default, once",
     desk.noteAt(anchor, null),
     { x: anchor.x + desk.NOTE_OFFSET_DEFAULT.dx, y: anchor.y + desk.NOTE_OFFSET_DEFAULT.dy });
  eq("...and so does one carrying nonsense", desk.noteAt(anchor, { dx: NaN, dy: 3 }),
     { x: anchor.x + desk.NOTE_OFFSET_DEFAULT.dx, y: anchor.y + desk.NOTE_OFFSET_DEFAULT.dy });
  // the whole point: the default no longer parks it on top of the mark
  ok("the default sits clear of the mark rather than on it",
     desk.NOTE_OFFSET_DEFAULT.dy > Math.abs(desk.MARK_DY) + desk.MARK_SIZE);
  // round-trip through a move, which is all "drag it around inside the clip" is
  const moved = desk.noteAt(anchor, desk.noteOffset(anchor, { x: 612, y: 388 }));
  eq("dropping, then redrawing, is lossless", moved, { x: 612, y: 388 });
}
{
  // A clip must hit the desk's edge AS ONE OBJECT. Clamping each member
  // separately lets the nearest one stop while the others carry on, which
  // fans the stack out against the boundary permanently — the exact thing a
  // clip exists to prevent.
  const near = [{ x: desk.DESK_W - 500, y: 100 }, { x: desk.DESK_W - 460, y: 140 }];
  const k = desk.clampDelta(near, 5000, 0, 300, 160);
  eq("...and both members keep their offset when the clip is pushed into the edge",
     near.map(p => p.x + k.dx).map((x, i) => x - (near[i].x)).every(v => v === k.dx) &&
     (near[1].x + k.dx) - (near[0].x + k.dx) === near[1].x - near[0].x, true);
  ok("the clip stops at the edge rather than fanning out",
     near[1].x + k.dx <= desk.DESK_W - desk.ORIGIN - 300,
     `rightmost lands at ${near[1].x + k.dx}`);
  const back = desk.clampDelta(near, -99999, -99999, 300, 160);
  ok("...and the same on the way back", near[0].x + back.dx === 0 && near[0].y + back.dy === 0);
  eq("an empty cluster still gives a usable delta", desk.clampDelta([], 12, 34), { dx: 12, dy: 34 });

  ok("a clip's tilt is stable across calls",
     desk.clipRotationOf("c1","p1") === desk.clipRotationOf("c1","p1"));
  ok("...stays inside its range", Math.abs(desk.clipRotationOf("c1","p1")) <= desk.CLIP_ROT_MAX_DEG);
  ok("...differs per desk, like a card's wobble",
     desk.clipRotationOf("c1","p1") !== desk.clipRotationOf("c1","p2"));
  ok("...and is salted apart from the card wobble of the same id",
     desk.clipRotationOf("x","p") !== desk.rotationOf("x","p"));
  eq("an empty clip has an anchor rather than a crash", desk.clipAnchor([]), { x: 0, y: 0 });
}

console.log("\n--- still ONE archive pass, with two more floors to gather ---");
{
  const { s, pid, ids } = seeded();
  const cid = s.addClip(pid);
  s.setDeskField(ids[0], pid, "clip", cid);
  s.addNote(pid, { text: "n", clip: cid });
  let scans = 0;
  const all = s.all.bind(s);
  s.all = () => { scans++; return all(); };
  const d = desk.deskData(s.all(), pid, PROJECT_LINK);
  ok("cards, clips and post-its all come out of one walk", scans === 1, `scanned ${scans} times`);
  ok("...and the project item was picked up on the way past", d.project && d.project.id === pid);
}

// ===================================================================
console.log("\n--- the post-it's paper is legible on ANY project colour ---");
// Measured with the app's own contrast(), in both themes, against every
// project colour there is — not eyeballed, and not sampled from the palette,
// because a project colour can be an arbitrary hex from the picker.
{
  const tokens = readFileSync(join(ROOT, 'css', 'tokens.css'), 'utf8');
  const appcss = readFileSync(join(ROOT, 'css', 'app.css'), 'utf8');

  // the two theme blocks, read out of the stylesheet rather than copied here,
  // so re-valuing a token turns this test red instead of quietly passing
  const block = (re) => { const m = tokens.match(re); return m ? m[0] : ""; };
  const light = block(/:root\s*\{[\s\S]*?\n\}/);
  const dark  = block(/\[data-theme="dark"\][\s\S]*?\n\}/);
  const tok = (blk, name) => (blk.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{3,6})`)) || [])[1];

  const cssTint = (appcss.match(/--desk-note-tint:\s*(\d+)%/) || [])[1];
  ok("the CSS tint and js/desk.js's NOTE_TINT_PCT agree",
     Number(cssTint) === desk.NOTE_TINT_PCT, `css ${cssTint}% vs js ${desk.NOTE_TINT_PCT}%`);

  const hex = (v) => { const h = v.replace('#',''); const f = h.length===3 ? h.split('').map(c=>c+c).join('') : h;
                       return [0,2,4].map(i => parseInt(f.slice(i,i+2),16)); };
  const toHex = (rgb) => "#" + rgb.map(v => Math.round(v).toString(16).padStart(2,"0")).join("");
  // exactly what CSS color-mix(in srgb, ground P%, paper) computes
  const mix = (ground, paper, p) => toHex(hex(ground).map((v,i) => v*p + hex(paper)[i]*(1-p)));

  const p = desk.NOTE_TINT_PCT / 100;
  for (const [name, blk] of [["light", light], ["dark", dark]]) {
    const paper = tok(blk, "--surface-raised");
    const ink   = tok(blk, "--text-primary");
    const muted = tok(blk, "--text-muted");
    ok(`${name}: the tokens were found in the stylesheet`, !!paper && !!ink && !!muted,
       `paper=${paper} ink=${ink} muted=${muted}`);
    let worstInk = Infinity, worstMuted = Infinity, worstAt = null;
    for (let r = 0; r <= 255; r += 15) for (let g = 0; g <= 255; g += 15) for (let b = 0; b <= 255; b += 15) {
      const stock = mix(toHex([r,g,b]), paper, p);
      const ci = contrast(stock, ink);
      if (ci < worstInk) { worstInk = ci; worstAt = toHex([r,g,b]); }
      worstMuted = Math.min(worstMuted, contrast(stock, muted));
    }
    ok(`${name}: --text-primary clears AA on the worst possible project colour`,
       worstInk >= 4.5, `worst ${worstInk.toFixed(2)}:1 at ${worstAt}`);
    ok(`${name}: --text-muted clears AA too, so secondary marks are safe`,
       worstMuted >= 4.5, `worst ${worstMuted.toFixed(2)}:1`);
  }
  // and the recorded reason --text-faint is banned from a post-it
  const faint = tok(light, "--text-faint");
  const paper = tok(light, "--surface-raised");
  ok("--text-faint really does fail here — which is why the CSS forbids it",
     contrast(mix("#000000", paper, p), faint) < 4.5);
}

console.log("\n--- the constants the CSS and the JS both hold ---");
{
  const appcss = readFileSync(join(ROOT, 'css', 'app.css'), 'utf8');
  const px = (name) => Number((appcss.match(new RegExp(`${name}:\\s*(\\d+)px`)) || [])[1]);
  ok("--desk-clip-mark matches MARK_SIZE", px("--desk-clip-mark") === desk.MARK_SIZE);
  ok("--desk-note-w matches NOTE_W", px("--desk-note-w") === desk.NOTE_W);
  // The stack reckons its right edge from this width, and the CSS is what
  // actually caps a card at it. If they drift, the clip stops gripping the
  // paper — so they are checked, not just commented.
  ok("--desk-card-max matches STACK_W", px("--desk-card-max") === desk.STACK_W);
}

console.log("\n--- the service worker knows about the new file ---");
{
  const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
  ok("js/icons.js is in SHELL, so a fresh device can actually load it",
     sw.includes('"./js/icons.js"'));
}

console.log(fail ? `\n${fail} of ${n} FAILED` : `\nall ${n} passed`);
process.exit(fail ? 1 : 0);
