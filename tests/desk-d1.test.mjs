// Headless D1 tests — the M1 posture, repeated for the desk.
// Run: node tests/desk-d1.test.mjs   (from the repo root — no DOM, no browser)
globalThis.localStorage = { _d:{}, getItem(k){return this._d[k]??null;}, setItem(k,v){this._d[k]=String(v);}, removeItem(k){delete this._d[k];} };
globalThis.structuredClone = globalThis.structuredClone || (o => JSON.parse(JSON.stringify(o)));

const { Store, PROJECT_LINK, deskKey, FORMAT_VERSION } = await import('../js/store.js');
const desk = await import('../js/desk.js');

let fail = 0, n = 0;
const ok = (name, cond, extra="") => { n++; if(!cond) fail++; console.log((cond?"PASS  ":"FAIL  ")+name+(cond?"":"\n      "+extra)); };
const eq = (name, a, b) => ok(name, JSON.stringify(a)===JSON.stringify(b), `got ${JSON.stringify(a)}\n      want ${JSON.stringify(b)}`);

// ---- a store with one project and three entries ----
function seeded() {
  const s = new Store();
  const pid = s.createItem({ title: "Dash", type: "project" });
  const ids = ["one","two","three"].map(t => s.createItem({ title: t }));
  for (const id of ids) s.assignToProject(id, pid);
  return { s, pid, ids };
}

console.log("\n--- format + shape ---");
ok("formatVersion is 3", FORMAT_VERSION === 3);
{
  const { s, pid, ids } = seeded();
  ok("nothing is placed until it is placed", desk.deskData(s.all(), pid, PROJECT_LINK).placed.length === 0);
  eq("...and all three are unplaced", desk.deskData(s.all(), pid, PROJECT_LINK).unplaced.map(i=>i.title), ["one","two","three"]);
  s.placeOnDesk(ids[0], pid, { x: 100, y: 200 }, 1);
  const d = desk.deskData(s.all(), pid, PROJECT_LINK);
  ok("placing puts exactly one card on the desk", d.placed.length === 1 && d.unplaced.length === 2);
  eq("the record materialises where §12.1 says", s.get(ids[0]).viewState, { [deskKey(pid)]: { pos:{x:100,y:200}, z:1, clip:null, removed:null, created: s.get(ids[0]).viewState[deskKey(pid)].created } });
  ok("created is stamped", typeof s.get(ids[0]).viewState[deskKey(pid)].created === "string");
}

console.log("\n--- the same entry, two desks, at once (§3) ---");
{
  const s = new Store();
  const a = s.createItem({ title:"A", type:"project" });
  const b = s.createItem({ title:"B", type:"project" });
  const e = s.createItem({ title:"shared" });
  s.assignToProject(e, a); s.assignToProject(e, b);
  s.placeOnDesk(e, a, { x: 10, y: 10 }, 1);
  ok("placed on A", desk.deskData(s.all(), a, PROJECT_LINK).placed.length === 1);
  ok("still unplaced on B, simultaneously", desk.deskData(s.all(), b, PROJECT_LINK).unplaced.length === 1);
  s.setDeskField(e, a, "pos", { x: 999, y: 999 });
  ok("moving it on A does not touch B", desk.deskData(s.all(), b, PROJECT_LINK).placed.length === 0);
  s.placeOnDesk(e, b, { x: 5, y: 5 }, 1);
  ok("now on both desks, two independent keys", Object.keys(s.get(e).viewState).length === 2);
  eq("...and A's position is untouched by B's", s.deskRecord(e, a).pos, { x: 999, y: 999 });
  eq("...and B's by A's", s.deskRecord(e, b).pos, { x: 5, y: 5 });
  ok("wobble differs per desk", desk.rotationOf(e, a) !== desk.rotationOf(e, b));
}

console.log("\n--- un-place is a tombstone, never an erasure ---");
{
  const { s, pid, ids } = seeded();
  s.placeOnDesk(ids[0], pid, { x: 40, y: 50 }, 1);
  s.unplaceFromDesk(ids[0], pid);
  const d = desk.deskData(s.all(), pid, PROJECT_LINK);
  ok("un-placed leaves the desk", d.placed.length === 0);
  ok("...and lands back in the tray", d.unplaced.length === 3);
  ok("the position survives the tombstone", s.deskRecordRaw(ids[0], pid).pos.x === 40);
  s.restoreToDesk(ids[0], pid);
  eq("restore puts it back exactly where it was", desk.deskData(s.all(), pid, PROJECT_LINK).placed[0].pos, { x:40, y:50 });
}

console.log("\n--- two devices, offline, merging (the M1 posture) ---");
// replay the same ops in every order and demand byte-identical snapshots
function opsFor() {
  const { s, pid, ids } = seeded();
  const base = s.drainPendingAsLines().map(JSON.parse);
  s.placeOnDesk(ids[0], pid, { x: 10, y: 10 }, 1);
  s.placeOnDesk(ids[1], pid, { x: 20, y: 20 }, 2);
  const mac = s.drainPendingAsLines().map(JSON.parse);
  return { base, mac, pid, ids };
}
{
  const { base, mac, pid, ids } = opsFor();
  // device 2 arranges a DIFFERENT card while offline, with realistic wall clocks
  const later = (o, ms) => ({ ...o, ts: { ...o.ts, wall: o.ts.wall + ms, device: "ipad" } });
  const ipad = [
    later({ op:"vs", itemId: ids[2], key: deskKey(pid), action:"add",
            value:{ pos:{x:300,y:300}, z:3, created:new Date().toISOString() }, ts:{ wall: Date.now()+5000, count:1, device:"ipad" } }, 0),
  ];
  const perms = [
    [...base, ...mac, ...ipad],
    [...base, ...ipad, ...mac],
    [...ipad, ...base, ...mac],
    [...mac.slice(0,1), ...base, ...ipad, ...mac.slice(1)],
  ];
  // "byte-identical with key order normalised" — the M1 posture. Item order in
  // the snapshot follows Map insertion, which follows arrival order (an op for
  // an item whose create hasn't landed yet inserts it early). That is
  // pre-existing and not desk-specific, so the comparison canonicalises it.
  const canon = (v) => Array.isArray(v) ? v.map(canon)
    : (v && typeof v === "object")
      ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])]))
      : v;
  const snaps = perms.map(ops => {
    const s = new Store();
    s.replayLog(ops);
    const snap = s.toSnapshot();
    snap.generatedAt = "";                                  // the only wall-clock field
    snap.items.sort((a, b) => (a.id < b.id ? -1 : 1));
    return JSON.stringify(canon(snap));
  });
  ok("every arrival order converges byte-identically", snaps.every(x => x === snaps[0]),
     snaps.map(x=>x.length).join(" vs "));
  const s2 = new Store(); s2.replayLog(perms[2]);
  ok("both devices' arrangements survive — zero loss", desk.deskData(s2.all(), pid, PROJECT_LINK).placed.length === 3);
}

console.log("\n--- same card, same desk, two devices: one wins, the loser is reported ---");
{
  const { s, pid, ids } = seeded();
  s.placeOnDesk(ids[0], pid, { x: 10, y: 10 }, 1);
  const line = s.drainPendingAsLines().map(JSON.parse);
  const s2 = new Store(); s2.replayLog(line);
  const key = deskKey(pid);
  const early = { op:"vs", itemId: ids[0], key, action:"set", field:"pos", value:{x:111,y:111}, ts:{ wall: Date.now()-2000, count:1, device:"mac" } };
  const late  = { op:"vs", itemId: ids[0], key, action:"set", field:"pos", value:{x:222,y:222}, ts:{ wall: Date.now()-1000, count:1, device:"ipad" } };
  s2.replayLog([late, early]);                              // later one arrives FIRST
  eq("the later write wins regardless of arrival order", s2.deskRecord(ids[0], pid).pos, {x:222,y:222});
  const notes = s2.collisions();
  ok("the overwritten move surfaces as a merge note", notes.length === 1 && notes[0].vsKey === key, JSON.stringify(notes));
  ok("...and can be restored", s2.restoreCollision(notes[0].key) === true);
  eq("restoring puts the lost position back", s2.deskRecord(ids[0], pid).pos, {x:111,y:111});
}

console.log("\n--- different fields never contest (move vs clip) ---");
{
  const { s, pid, ids } = seeded();
  s.placeOnDesk(ids[0], pid, { x: 10, y: 10 }, 1);
  const base = s.drainPendingAsLines().map(JSON.parse);
  const key = deskKey(pid);
  const s2 = new Store(); s2.replayLog(base);
  s2.replayLog([
    { op:"vs", itemId: ids[0], key, action:"set", field:"pos",  value:{x:77,y:77}, ts:{ wall: Date.now()+1000, count:1, device:"mac" } },
    { op:"vs", itemId: ids[0], key, action:"set", field:"clip", value:"c1",        ts:{ wall: Date.now()+1001, count:1, device:"ipad" } },
  ]);
  const rec = s2.deskRecord(ids[0], pid);
  ok("device 1 moved it AND device 2 clipped it — both facts survive", rec.pos.x === 77 && rec.clip === "c1");
  ok("no merge note for a non-collision", s2.collisions().length === 0);
}

console.log("\n--- out-of-order: a set arriving before its add ---");
{
  const { s, pid, ids } = seeded();
  const base = s.drainPendingAsLines().map(JSON.parse);
  const key = deskKey(pid);
  const add = { op:"vs", itemId: ids[0], key, action:"add", value:{ pos:{x:1,y:1}, z:1 }, ts:{ wall: Date.now(), count:1, device:"mac" } };
  const set = { op:"vs", itemId: ids[0], key, action:"set", field:"pos", value:{x:9,y:9}, ts:{ wall: Date.now()+500, count:1, device:"mac" } };
  const s2 = new Store(); s2.replayLog([...base, set, add]);   // backwards
  eq("the set still wins; the add only fills blanks", s2.deskRecord(ids[0], pid).pos, {x:9,y:9});
  ok("the add is not lost either", s2.deskRecord(ids[0], pid).z === 1);
}

console.log("\n--- one archive pass, enforced ---");
{
  const { s, pid } = seeded();
  let scans = 0;
  const all = s.all.bind(s);
  s.all = () => { scans++; return all(); };
  desk.deskData(s.all(), pid, PROJECT_LINK);
  ok("a desk render walks the archive exactly once", scans === 1, `scanned ${scans} times`);
}

console.log("\n--- a stale remote snapshot must not eat local work ---");
// The shape of the first-deploy data-loss bug: a poll sees a changed remote
// snapshot written BEFORE a local edit, and loadSnapshot assigns straight over
// the live item. This reproduces what sync.js now does around that call.
{
  const s = new Store();
  const id = s.createItem({ title: "" });
  const stale = JSON.parse(JSON.stringify(s.toSnapshot()));   // remote snapshot: title still ""
  for (const v of ["B","Bo","Bow","Bower","Bowerhaus"]) s.setField(id, "title", v);
  ok("typed locally", s.get(id).title === "Bowerhaus");

  // what the OLD code did
  const naive = new Store();
  naive.replayLog(s.pendingOps.slice());
  naive.loadSnapshot(JSON.parse(JSON.stringify(stale)));
  ok("...and the old path lost it (this is the bug)", naive.get(id).title === "");

  // what sync.js does now: snapshot as a base, then local work back on top
  const fixed = new Store();
  fixed.replayLog(s.pendingOps.slice());
  const pending = s.pendingOps.slice();
  fixed.loadSnapshot(JSON.parse(JSON.stringify(stale)));
  for (const op of pending) fixed._applyOp(op, false);
  ok("...and the fixed path keeps it", fixed.get(id).title === "Bowerhaus", JSON.stringify(fixed.get(id).title));
  eq("...including a desk placement made in the same window",
     (() => { const t = new Store(); t.replayLog(s.pendingOps.slice());
              const pid2 = t.createItem({ title:"P2", type:"project" });
              t.assignToProject(id, pid2);
              t.placeOnDesk(id, pid2, { x: 12, y: 34 }, 1);
              const p = t.pendingOps.slice();
              t.loadSnapshot(JSON.parse(JSON.stringify(stale)));
              for (const op of p) t._applyOp(op, false);
              return t.deskRecord(id, pid2).pos; })(), { x: 12, y: 34 });
}

console.log("\n--- geometry ---");
{
  eq("a stray position is clamped back onto the desk", desk.clampPos({x: 99999, y: -40}, 300, 150),
     {x: desk.DESK_W - desk.ORIGIN - 300, y: 0});
  ok("wobble is stable across calls", desk.rotationOf("e1","p1") === desk.rotationOf("e1","p1"));
  ok("wobble stays inside the locked range", Math.abs(desk.rotationOf("e1","p1")) <= desk.ROT_MAX_DEG);
  ok("z ties break by id, both devices agreeing", desk.compareZ({z:5,id:"a"},{z:5,id:"b"}) < 0);
  ok("nextZ is max + 1", desk.nextZ([{z:1},{z:7},{z:3}]) === 8);
  const w = desk.weights([{id:"a",pos:{x:0,y:0}},{id:"b",pos:{x:10,y:10}},{id:"c",pos:{x:9000,y:9000}}]);
  ok("weight counts near neighbours only", w.get("a") === 1 && w.get("c") === 0);
  const f = desk.glanceFrame({x:0,y:0,w:4400,h:2900}, 1200, 700);
  ok("a full desk scales down", f.k < 1);
  ok("a nearly empty desk is never magnified", desk.glanceFrame({x:0,y:0,w:200,h:100}, 1200, 700).k === 1);
}

console.log(fail ? `\n${fail} of ${n} FAILED` : `\nall ${n} passed`);
process.exit(fail ? 1 : 0);
