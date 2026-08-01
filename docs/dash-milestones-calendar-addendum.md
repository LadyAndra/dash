# Dash — Milestones, Stage, Today Panel & Calendar (Architecture Addendum)

**For:** Andra (andrakhoder@gmail.com) — extends the system described in `dash-architecture-proposal.md`, as amended by `dash-current-state.md`.
**Status:** Handoff document. Self-contained given those two companion docs; the implementer should not need any prior conversation context. Reasoning is included alongside every decision, following the same rules: no build step, vanilla ES modules, theme tokens only, accessibility floor (18px+ text, AA contrast, 44px+ targets), and the file format is extended — never broken.
**Date:** August 1, 2026.

---

## 0. What this adds and why

Projects in Dash currently have at most one due date (`dates.due`) and one reminder (`dates.remind`) — the same shape as every other item. But a project isn't one deadline; it's a sequence of them. Andra wants to lay out custom milestone dates per project — e.g. "Research," "Idea," "Execution," "Final" — and have three things fall out of that:

1. **A per-project "stage" indicator** — where the project is right now, derived, never manually maintained.
2. **A Today panel** — overdue items plus anything due in the next 14 days, drawn from project milestones *and* the existing single-item due dates, in one place.
3. **A full Calendar/timeline view** — already scoped as unbuilt in the current-state doc; pulled forward and merged into this work. The real view, not a stub.

This is an addendum, not a redesign. The Item model, the per-device append-only logs, the merge rules, the query layer, and the view registry all stand exactly as built. Everything below is an *extension* of §2, §3, §4, and §6 of the original proposal.

---

## 1. Settled decisions — do not relitigate

These were decided before this document was written. They are constraints, not proposals:

- **Project type only.** Milestones exist on Project items. Every other item type keeps its single `dates.due` / `dates.remind` exactly as-is.
- **Milestones are fully custom per project.** Any label, any count, including zero. They are *not* a reusable registry like Types/Statuses — two projects can both have a "Research" milestone with no relationship between them. Do not build a milestone taxonomy.
- **Milestone dates are optional.** A milestone can be an undated placeholder ("Execution phase," added before a date is picked). Undated is a normal, supported state, not an error state.
- **Each milestone carries its own optional reminder**, independent of the others and of the project's own `dates.remind`.
- **Stage is derived, never stored.** A project's current stage is its earliest unfinished milestone (precise definition in §3). There is no stage field to edit and no stage registry.
- **Reminders surface in-app only** (the Today panel). No native push, no Apple Reminders export in this pass — same posture as §7.1/§8 of the original proposal; both remain documented future escalations.
- **Today panel window:** overdue + due within the next 14 days, from both milestone dates and existing single-item due dates.
- **Calendar view is in scope now.**

Also carried over unchanged from `dash-current-state.md`: Dropbox PKCE sync is the transport (not iCloud), and all of that doc's operational rules (service-worker `SHELL` maintenance, no-emit-on-no-op polling, render coalescing, focus rules) apply to everything built here.

---

## 2. Data model extension (extends proposal §2)

### 2.1 The `milestones` array

Project items gain one new optional field. A project with no milestones simply lacks the field — **missing array means empty array**, everywhere, always (see §9 on migration).

```json
{
  "id": "01J2X…",
  "type": "project",
  "title": "Freelance site rebuild",
  "…": "…all existing fields unchanged…",
  "milestones": [
    {
      "mid":     "01K4A…",
      "label":   "Research",
      "date":    "2026-08-15",
      "remind":  "2026-08-12",
      "done":    "2026-08-14T19:02:11Z",
      "order":   1000,
      "removed": null,
      "created": "2026-08-01T15:30:00Z"
    },
    {
      "mid":     "01K4B…",
      "label":   "Execution phase",
      "date":    null,
      "remind":  null,
      "done":    null,
      "order":   2000,
      "removed": null,
      "created": "2026-08-01T15:31:00Z"
    }
  ]
}
```

Field notes:

- **`mid` — a ULID, and the load-bearing decision of this whole addendum.** Every milestone has its own stable identity, generated offline like item IDs. All edits address a milestone by `mid`, never by array index. This is what makes the merge model in §4 work: two devices editing *different milestones* of the same project can never conflict, because their ops touch different `mid`s. Index-based addressing would break the moment one device inserts while another edits.
- **`label`** — freeform text, same philosophy as tags. No vocabulary, no registry.
- **`date` and `remind` are date-only strings (`YYYY-MM-DD`), not timestamps.** Deliberate divergence from `dates.due`. Milestones are day-granularity things ("Final by the 20th"), and date-only strings sidestep an entire class of timezone bugs: an ISO timestamp for "Aug 15" written on one device can render as Aug 14 or 16 on another depending on zone and DST. "Is this overdue?" becomes a plain string comparison against today's local date. No time-of-day means no false precision and no drift.
- **`done`** — `null`, or the full ISO timestamp of when it was marked done. A timestamp rather than a boolean because it's free history (and would feed any future streak/velocity feature), and clearing it back to `null` is the natural "oops, un-done" operation.
- **`order`** — a number that defines the milestone's position in the project's sequence. §3 explains why this exists and how it's assigned.
- **`removed`** — tombstone timestamp, or `null`. Milestones are never deleted from data, per the never-delete rule (proposal §13.2 rule 8). The UI filters out tombstoned milestones; a "removed milestones" affordance in the project editor can restore one by clearing the field.
- **`created`** — set once at creation, for display and tie-breaking.

### 2.2 What deliberately does *not* change

- `dates.due` / `dates.remind` on projects still exist and still work. A project can have both a due date and milestones; the Today panel and Calendar simply show both. No forced choice, no migration of one into the other.
- No registry changes. Types, statuses, tags untouched.
- No new item types. Milestones are sub-records of a project, not items — they can't be tagged, linked, or attached to. If a milestone ever needs that richness, the existing answer already in the system is: make a real item and link it to the project. Milestones stay lightweight on purpose.

---

## 3. Ordering and stage derivation (open question 1 — resolved)

### 3.1 The problem

"Current stage = earliest unfinished milestone" needs a definition of *earliest* that survives undated placeholders. Dates can't order what has no date, and dates also aren't reliably the intended sequence — Andra might date "Final" first and add dates to earlier phases later, or push one phase's date past a later phase's without meaning to reorder the pipeline.

### 3.2 The answer: explicit manual `order` is the sequence; dates are scheduling

Every milestone carries an `order` number. The project editor presents milestones in `order` sequence, with drag-to-reorder (and up/down buttons at 44px+, since drag alone is a poor sole affordance on touch). **The manual order is the semantic pipeline. Dates are when things are due, not what comes first.** If order and dates disagree, order wins for stage; the Calendar (which is about time) uses dates and ignores order entirely. Each view uses the dimension it's actually about.

**Mechanics — fractional ordering, so reorders are cheap ops:**

- First milestone gets `order: 1000`; each appended one gets `last + 1000`.
- Inserting between neighbors `a` and `b` assigns `(a.order + b.order) / 2`. Moving a milestone = one `set` op on that one milestone's `order` field — it never renumbers its neighbors, which matters for merge (§4): a reorder on one device and a label edit on another device touch different fields and merge perfectly.
- Ties (possible if two offline devices insert into the same gap): break deterministically by `mid` (ULIDs sort by creation time — the earlier-created milestone sorts first). Both devices converge on the same sequence.
- If repeated same-gap inserts ever exhaust float precision (≈50 consecutive midpoint splits — vanishingly unlikely at human scale), the editor renumbers the whole list to fresh 1000-spacing, emitting one `set` per milestone. Legal, rare, self-healing.

### 3.3 Stage, precisely

```
stageOf(project):
  ms = project.milestones (or []) minus tombstoned, sorted by order (tie: mid)
  first = first ms where done == null
  if ms is empty        → no stage (show nothing)
  if first exists       → stage = first.label
                          stage is OVERDUE if first.date != null and first.date < today
  if none unfinished    → stage = "Complete"
```

Consequences worth stating: an *undated* milestone can be the current stage — correct, since "we're in the Execution phase, no deadline set yet" is a true statement about the project. Marking a mid-sequence milestone done while an earlier one is unfinished doesn't advance the stage — also correct; the pipeline says the earlier phase is still open.

**Where stage shows:** a small text chip in the project view header and on project cards in list/board views — label text in `--text-muted` on `--surface-raised`, switching to `--ember` when overdue. Ember is the indicator token and overdue is exactly an indicator, so this is its sanctioned use (per the tokens rule restated in the current-state doc: ember is never decoration). Stage is computed at render time from the in-memory item — derived data is never written back to the store.

---

## 4. Log & merge extension (extends proposal §3 and §6.1) (open question 2 — resolved)

### 4.1 New op kind

Existing ops are `{ itemId, field, value, ts, device }` lines in the writing device's own append-only log. Milestones add one op kind, `"ms"`, with three actions:

```json
{ "itemId": "01J2X…", "op": "ms", "action": "add",
  "mid": "01K4A…",
  "value": { "label": "Research", "date": null, "remind": null, "order": 1000 },
  "ts": "…", "device": "iphone" }

{ "itemId": "01J2X…", "op": "ms", "action": "set",
  "mid": "01K4A…", "field": "date", "value": "2026-08-15",
  "ts": "…", "device": "mac" }

{ "itemId": "01J2X…", "op": "ms", "action": "remove",
  "mid": "01K4A…",
  "ts": "…", "device": "mac" }
```

There is deliberately no separate "mark done" op — done is just `action: "set", field: "done", value: <timestamp>` (or `null` to un-done), and reorder is just a `set` on `order`. Three actions cover everything; every new op kind is future merge-code surface, so the set is kept minimal.

### 4.2 Merge rules (mirrors §6.1 exactly, one level down)

The milestones *collection* merges like a set; each milestone's *fields* merge like an item's scalar fields:

- **`add`** — idempotent by `mid`: creates the milestone if unseen, is a no-op if that `mid` already exists (the `value` snapshot only applies on first sight; later state comes from `set` ops). Two devices adding *different* milestones offline both survive — this is the add/remove-op set semantics from §6.1, which is exactly why milestones are not merged as a whole-array overwrite.
- **`set`** — **last-writer-wins per `(itemId, mid, field)`**, using the same hybrid timestamps as everything else. Editing "Research"'s date on the iPad and "Final"'s label on the iPhone: different `mid`s, no interaction. Editing the same milestone's date and label: different fields, both win. Only the same field of the same milestone contests, and the loser goes to the existing merge-notes surface like any other same-field collision.
- **`remove`** — sets the `removed` tombstone (LWW like any field; restoring = a later `set` of `removed` to `null`). A concurrent `set` on a milestone another device removed still applies to the tombstoned record — nothing is lost, and if it was the *same* field it surfaces in merge notes. Remove-vs-edit therefore resolves as "removed, but the edit is preserved underneath," which honors the never-delete rule without special cases.
- A `set` or `remove` arriving before its `add` (possible with out-of-order log ingestion): buffer or auto-create a skeleton by `mid` and let the `add` fill blanks later — either is fine; ops are idempotent to replay in any order because everything reduces to per-field LWW.

### 4.3 Format versioning and compatibility

- Bump `formatVersion` (snapshot + log header) — this is an *extension* under §13.2 rule 1: new op kind, new optional item field, nothing existing reinterpreted.
- A reader must **ignore-and-preserve** unknown op kinds rather than erroring — version skew between devices is brief (one hosted URL, PWA update) but a mid-skew sync must not corrupt or crash. Older code that doesn't know `"ms"` simply doesn't materialize milestones; the ops are still in the log and materialize after the device updates. Nothing is lost, because logs are the source of truth and append-only.
- Snapshot: `snapshot.json` stores the materialized `milestones` array on each project, exactly as §2.1. Loading = snapshot + log-tail replay, unchanged.
- iCloud "Conflicted Copy" logic, single-writer-per-file, Dropbox transport: all untouched. This addendum adds op lines; it changes nothing about how logs move.

---

## 5. The Today panel (open question 4 — resolved)

### 5.1 Placement: its own view, not a Home tenant

Confirming the working assumption, with three reasons beyond "Home is crowded":

1. **Home already has three more tenants coming.** The corner cluster is 1-of-4 built; weather, tide, and train are scoped. Adding a date-driven list to the same sheet now guarantees a fight for space later.
2. **The Today panel is scheduled to grow.** Proposal §7.2 already designates it as where live Gmail/Calendar content surfaces in Phase 3. Squeezed into Home, that merge would be impossible; as its own view, mail/events become two more sections.
3. **It's a view over the store, and Dash has a place for those: the view registry.** `js/views/today.js`, registered like every other view, reachable from the view switcher. Zero new navigation concepts.

**Home still gets the signal without the panel:** a small overdue count on the topbar / view-switcher entry for Today, in `--ember` (indicator use, sanctioned), shown only when the overdue count is nonzero. One number, no layout pressure, and the itch to check it leads to the right place.

### 5.2 What it shows

One merged list from two sources (three, come Phase 3 of the original plan):

- **Project milestones:** every non-tombstoned, unfinished milestone whose `date` is on or before today+14, **plus** any whose `remind` is on or before today (a reminder can fire ahead of a far-off date — that's its whole purpose).
- **Single-item dates:** every item (any type) with `dates.due` in the same overdue-through-14-days window, plus any with `dates.remind` at or before now. This is the existing data the panel finally makes visible — reminders have had no surface until now.

Grouped into sections, in order: **Overdue** (header and date text in `--ember`), **Today**, then **Upcoming** grouped by day for the next 14. Within a section: milestones and plain items interleave, sorted by date then title.

**Row anatomy** (18px+ text, 44px+ targets, one line each):

- Milestone row: project title, milestone label, date — e.g. "Freelance site rebuild · Research · Aug 15" — with two actions: a done toggle (writes the `done` set-op) and tap-to-open the project (editor scrolled to milestones).
- Item row: type icon, title, due date; tap opens the item. No "done" action is invented for plain items — what done means depends on Andra's own statuses, so the row opens the editor rather than guessing. A dated *reminder* row offers "dismiss," which clears `dates.remind` (an ordinary field op).

**Read-aloud:** one button reads the panel top to bottom via SpeechSynthesis — "Two overdue: …; today: …; next fourteen days: …". This is the daily-brief made audible, per proposal §10, and serves the eye-strain constraint directly.

**Empty state** is a real state: "Nothing due in the next two weeks," in `--text-muted`, plus the pet's neighborhood stays calm (§8 — the pet does *not* react to this panel).

**Project-status nuance, flagged not solved:** statuses are user-defined data, so the panel cannot know that "Shipped" means finished; a finished project with a leftover undone milestone will keep appearing. The remedy in this pass is human (mark the milestones done). If it nags in practice, the clean fix is an optional "counts as finished" boolean on status registry entries — a registry extension, deliberately deferred, noted in the decisions log.

---

## 6. The Calendar view

### 6.1 Architecture: sources produce entries; the view renders entries

The one structural decision, made for the future as much as the present: **the calendar never reads items directly.** A small source registry (`js/entries.js`) sits between the store and the view. Each source implements one function:

```
entriesFor(rangeStart, rangeEnd) → [entry, …]

entry: {
  id,                       // stable key for rendering
  source,                   // "milestone" | "item-due"  (later: "gcal", "personal", …)
  itemId, mid?,             // what to open on tap
  label,                    // display text
  start: "YYYY-MM-DD",
  end:   "YYYY-MM-DD" | null,   // null = single-day; a range spans start…end
  allDay: true,
  done, overdue             // display hints
}
```

Two sources ship now: **milestones** (each dated, non-tombstoned milestone → one single-day entry; done ones render muted rather than vanishing, so past months read as history) and **item-due** (any item with `dates.due` → one entry). Both trivially produce `end: null` single-day entries today — but the *contract* carries `end`, and sources are *asked for a range*, which means:

- A future range-shaped source (travel) returns entries with `end` set; the grid learns to draw spans as a renderer change, with no model or query change.
- A future recurring source (birthdays, holidays) expands its rule into concrete entries for the requested window *inside the source* — the grid never learns what recurrence is.
- Gmail/Calendar events (proposal §7.2) become a third source when Phase 3 of the original plan lands, exactly as that section promised: a second data source merged into the same view, items unchanged.

This is the "don't bake in single-non-repeating-date assumptions" requirement made concrete, at a cost of one thin module.

### 6.2 The view itself (`js/views/calendar.js`)

- **Two modes, toggled in the view header: Month and Agenda.** Month is a standard grid — day cells showing up to ~3 entry chips then a "+n more"; tapping a day opens that day's entry list; tapping an entry opens its item. Agenda is a scrolling day-by-day list of the coming weeks — the "timeline feed" of the original §4.2, and the gentler mode for eye strain since it's large text in rows rather than dense cells. Month renders from `entriesFor(firstVisibleDay, lastVisibleDay)`; Agenda from a rolling window.
- **Navigation:** prev / next / Today buttons, all 44px+. Weeks start Monday unless trivially settable; not worth a setting until asked.
- **Last-used mode and month are per-device `localStorage`** (`dash.calendar.mode`, `dash.calendar.cursor`) — UI arrangement stays local, per the standing rule in the current-state doc. No `viewState` writes; the calendar owns no per-item layout.
- All colors/sizes via tokens; overdue chips use `--ember`; done entries `--text-muted`. No animation, so nothing owed to `prefers-reduced-motion`.

### 6.3 Undated milestones on the calendar (open question 3 — resolved)

They can't sit on a grid, and silently excluding them re-creates the exact failure Dash exists to fight — things falling out of sight. But they're also not *lost* if excluded: they remain visible in the project editor and can *be* the current stage (§3.3), so the stakes are "inconvenient," not "invisible."

**Decision: a collapsed "Unscheduled" tray at the bottom of the Calendar view** (both modes), listing undated, unfinished milestones grouped by project, each row carrying a "set date" affordance that opens a date picker and writes the ordinary `set` op. Collapsed by default with a count in the header ("Unscheduled · 4"), so it costs one line of chrome when ignored.

Reasoning: the moment Andra is looking at a calendar is precisely the moment she's thinking about time — the undated tray puts "give this a date" one tap from the surface where the date will land. The alternatives both lose: exclusion-only buries placeholders in per-project views she may not visit for weeks; a Today-panel section would put *undated* things in a panel whose contract is "dated and imminent," polluting its meaning. Undated ≠ urgent; undated = unscheduled; the tray names it correctly.

---

## 7. Future: personal dates and other calendar sources (designed-for, not built)

Andra will eventually want birthdays, holidays, and travel on this calendar — none of which are project data. The design above already leaves the door open, and this section exists so a future session doesn't rediscover it:

- **How it slots in:** a new source registered in `js/entries.js`, following the same pattern §7.2 of the original proposal established for Gmail/Calendar — additional sources merge into the view; items don't change. The likely shape is a lightweight `personal-date` item type (so the dates ride the existing log/sync/edit machinery for free), whose source module expands recurrence rules and date ranges into concrete entries per requested window.
- **Shape differences are already absorbed:** the entry contract carries `start`/`end` (ranges) and sources expand recurrence internally (annual dates), per §6.1. Nothing in the grid or agenda assumes one-shot single days.
- Recurrence rules, range editing UI, and the item-type decision are all **deliberately undesigned** here — they need real requirements, not speculation. The only obligation this pass takes on is the source/entry indirection, which is built.

---

## 8. Heat, the pet, and overdue milestones (open question 5 — resolved as "separate, with a documented hook")

**Recommendation: keep them entirely separate in this pass.**

Reasoning: the two signals mean different things. Neglect (the Heat view, the pet's droop) is *"you haven't touched this"* — it reads `dates.touched` and measures attention. Overdue is *"a date you set has passed"* — it measures commitments. A project Andra worked on all morning with a slipped milestone is the pet's counterexample: heavily touched, badly overdue. Feeding overdue into the pet would make its states less legible — and the pet build already established (current-state doc, the rejected-designs note) that legibility of states is the thing worth protecting. The pet reacts to specific actions through `store.onAction()`; "a date passed" is not an action and would be its first ambient, non-action input — exactly the kind of behavior the buzz-counter note flags as first-to-remove when the pet feels random.

Overdue already has a voice: `--ember` in the stage chip, the Today badge, and the panel's Overdue section. That's the indicator channel doing its job.

**Documented open question (revisit after weeks of real use):** *should sustained overdue-ness feed the pet?* If yes, the clean hook is a small daily check in `pet.js` reading the same derived today-list the panel computes (one coalesced pass, per the store-scan rule) — mood input, not a new transformation. Deferred, not designed.

---

## 9. Migration (open question 6 — resolved: none)

**Confirmed: no backfill, no data migration, nothing to run.**

- Missing `milestones` array **is** the empty array. Every reader (`stageOf`, Today sources, Calendar sources, the project editor) treats absence as `[]`. No op ever writes an empty array into existing projects; the field first appears on a project when its first `ms add` op materializes.
- Existing logs and snapshots remain valid byte-for-byte. The `formatVersion` bump (§4.3) marks capability, not incompatibility.
- Nothing else migrates: `dates.due`/`remind` keep their meaning on all types including projects; registries untouched; assets untouched; `viewState` untouched.
- The only "migration" is operational, not data: new JS files must be added to the service-worker `SHELL` and `CACHE_VERSION` bumped, per the standing rule in the current-state doc (§11 below repeats this per phase, because it has silently broken deploys before).

---

## 10. Phased build plan

Same posture as the original §11: each phase independently useful, real daily use before the next, format never migrated. Each phase ships as uploadable files plus a plain-English "what changed and how to try it" note, and ends with the standing regression tests: **the two-device offline-edit sync test and a full theme swap** — now with milestone edits included in the sync test.

**Phase M1 — Milestones in the model, the editor, and the chip.**
Op kind `"ms"` + merge rules in `store.js`/`sync.js`; snapshot materialization; `formatVersion` bump. Milestone editor inside the project view: add / label / date / reminder / reorder (drag + buttons) / done toggle / remove-with-restore. `stageOf` + stage chip in project view and on project cards.
*Definition of done:* create, reorder, date, and complete milestones on two devices offline — different milestones of the same project on each — and merge with zero loss; same-field collision appears in merge notes; stage chip updates live and shows ember when overdue; theme swap clean.
*Deploy note:* any new module into `SHELL`, bump `CACHE_VERSION`, hard-reload after upload.

**Phase M2 — Today panel.**
`js/entries.js` (source registry + milestone and item-due sources — built here because Today consumes it too), `js/views/today.js`, registered view + switcher entry, overdue badge, read-aloud, reminder dismiss.
*Definition of done:* a project milestone due in 3 days, an overdue milestone, a plain item with a due date, and an item with a reminder all appear in the right sections; marking the milestone done from the row removes it and advances the project's stage chip; read-aloud speaks the panel; badge shows only when something is overdue.

**Phase M3 — Calendar view.**
`js/views/calendar.js`: month grid + agenda, navigation, day drill-in, unscheduled tray with set-date, per-device mode/cursor persistence.
*Definition of done:* milestones and item dues appear on the correct days in both modes; an undated milestone sits in the tray and moves onto the grid the moment it's dated; done milestones render muted in past months; entry contract demonstrably range-ready (a hand-written test entry with `end` set renders without error, even if unspanned).

Phase order reasoning: M1 is the contract everything else reads, and is independently useful (stage alone earns its keep). M2 before M3 because the Today panel is the daily-driver and is the cheaper of the two views. The original plan's Phase 3 (Gmail/Calendar live) later lands *into* these views as additional sections/sources, per §5.1 and §6.1 — nothing here needs reworking for it.

---

## 11. Decisions log (why not the alternatives)

- **Why manual `order` instead of ordering by date?** Dates can't order undated placeholders, and dates drifting shouldn't silently reorder the pipeline. Order is the sequence; dates are scheduling; stage reads order, calendar reads dates. Each view uses the dimension it's about.
- **Why `mid`-keyed sub-records instead of an array with index-based edits?** Index addressing breaks under concurrent insert/remove across offline devices. Stable IDs make milestone merge identical in kind to item merge — per-field LWW plus set-style add/remove — reusing §6.1's reasoning instead of inventing new machinery.
- **Why fractional `order` instead of renumber-on-insert?** A reorder must be one op on one milestone so it can't collide with a concurrent edit to a neighbor. Renumbering writes to every milestone and multiplies merge surface. Renumber survives only as a rare precision-exhaustion repair.
- **Why date-only strings for milestone dates?** Day-granularity semantics, timezone-proof comparisons across devices, no false precision. `dates.due` keeps its existing timestamp shape — changing it would be migration for zero user-visible gain.
- **Why aren't milestones items?** They'd gain tags/links/attachments nobody asked for, at the cost of every list and view needing a "not really an item" filter, and project↔milestone integrity riding on links. The existing escape hatch (promote to a real linked item) covers the rare heavyweight case.
- **Why is "done" a timestamp field, not a status?** Statuses are a user-editable registry with registry semantics; milestone completion is binary-with-history. A timestamp is the smallest thing that's still future-proof (velocity, streaks).
- **Why an Unscheduled tray on the Calendar, not exclusion or a Today section?** Exclusion hides placeholders (the neglect failure mode); Today's contract is dated-and-imminent, which undated isn't. The calendar is where date-thinking happens, so that's where "needs a date" belongs — one tap from the fix.
- **Why is Today its own view, not part of Home?** Home has three more widgets scoped for its corner cluster, and proposal §7.2 already earmarks the Today panel as the landing zone for live mail/events — it needs room to grow. The ember badge keeps the urgent signal on the topbar without the tenancy.
- **Why doesn't overdue feed the pet?** Different meanings (attention vs. commitments), and the pet's hard-won legibility rests on reacting to specific actions. Kept separate; hook documented in §8 for reassessment after real use.
- **Why an entry/source layer between store and calendar?** So future annual (birthdays/holidays) and ranged (travel) dates, and §7.2's Gmail/Calendar events, are new *sources* rather than calendar rewrites. Personal dates were **considered for this pass and deliberately deferred**; the entry contract (`start`/`end`, range-queried sources) is the only provision built now.
- **Why no status-registry "finished" flag yet?** It would stop finished projects' leftover milestones from haunting the Today panel, but it adds registry semantics on speculation. Deferred until the nag is real (§5.2).
- **Why no backfill?** Absence-is-empty makes old data already valid. The cheapest migration is the one that doesn't exist.

---

## 12. Implementation handoff notes

All of proposal §13 applies unchanged — no build step, vendored-only dependencies (this addendum needs **none**), loud legible errors, boring well-commented code referencing doc sections, and Andra deploys by uploading folders via GitHub's web UI per `deploy-runbook.md`.

Specific to this work:

- **Files expected:** edits to `js/store.js`, `js/sync.js`, the project view module; new `js/entries.js`, `js/views/today.js`, `js/views/calendar.js`. Every new file goes into the `SHELL` array in `sw.js` and `CACHE_VERSION` is bumped **in the same upload** — the current-state doc records this silently breaking three deploys, and that a correct fix can look failed for ten minutes because GitHub Pages' HTTP cache (`max-age=600`) sits in front of the worker. After any upload: hard-reload (Cmd+Shift+R) before judging.
- **Rendering discipline (standing rules, restated because these views are date-scanners):** Today/Calendar recompute their lists inside the normal coalesced render pass — one `store.all()` scan per frame, never per item event. No new polling; the views re-render on store emit like every other view, and anything that would poll must not emit on a no-op.
- **Views declare capabilities:** both new views set `supportsSelect: false` (nothing to bulk-edit in a derived list) and register through the existing registry — no hardcoded view lists in `app.js`.
- **Tokens only, audited by theme swap.** The only ember uses are overdue indications (chip, badge, section headers). Dates render in the body font at base size or larger.
- **Day rollover:** "today" changes at midnight while the app may be open; recompute date-derived groupings on visibility change and on a lazy once-a-minute check rather than trusting a long-lived "today" constant.
- **Testing posture:** the merge rules in §4 get the same headless treatment the widgets got — replay hand-written multi-device log fixtures (different-milestone edits, same-field collision, remove-vs-edit, out-of-order arrival) and assert convergence to identical snapshots regardless of replay order. Date logic gets fixture tests around month boundaries, DST transitions (which date-only strings should render moot — prove it), and the 14-day window edges.

---

*End of addendum. Next action: hand this document, alongside `dash-architecture-proposal.md` and `dash-current-state.md`, to the implementing model with the instruction: "Build Phase M1 only, per §10 and §12." Update `dash-current-state.md` as each phase lands.*
