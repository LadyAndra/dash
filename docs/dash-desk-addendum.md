# Dash — The Desk
### A design & decisions addendum

**Date:** 10 August 2026
**Status:** Brainstorm complete; **Fable 5 architecture pass completed later the same day** (marked "confirmed 10 Aug — architecture pass" throughout; the technical result is §12–§13). Remaining product calls were put to Andra as one batch and answered 10 Aug. Next step: Opus implementation per `docs/changes-2026-08-10-desk.md`, Phase D0 (mockup) first.
**Companion docs:** `dash-architecture-proposal.md`, `dash-current-state.md`, `dash-milestones-calendar-addendum.md`

---

## 0. Where this came from

This started as a small, ordinary complaint: on a project page, it's hard to tell at a glance whether an entry is Done or On Hold. The first pass at solving it — a visual indicator, a sort order, a collapsible "done" bin — is still a perfectly good idea and is written up separately in project scoping notes from that conversation. It is **not** what this document is about, and it is **not solved** by anything below. See §10.

Partway through that conversation, thinking about a collapsible "done" drawer led to thinking about the milestone editor's existing "Removed milestones" drawer, which led to thinking about piles of paper, which led to realizing that a *project* could stop being a filtered table with a fancy hover animation on top, and start being an actual surface — something closer to a corkboard than a database view. Everything below is that idea, followed all the way out.

---

## 1. The core idea, in one paragraph

Each project gets its own **desk** — an open, freeform surface where entries exist as cards you can place, stack, overlap, and shuffle by hand, with no imposed grid and no named bins. Piles emerge from where you happen to put things, the same way piles emerge on a real desk: not because you labeled a zone "Active," but because that's where that stuff lives. Alongside the desk, a **peek** view gives you the tidy, structured escape hatch — basically List/Board, scoped to one project — for whenever you want the filed version instead of the messy one. Home stays the tidy ledger across all projects; the desk is where the actual thinking happens, one project at a time.

---

## 2. The governing principle: second nature, not skeuomorphic

Early in this conversation, the word to avoid got named explicitly: **skeuomorphic**. This distinction is load-bearing for everything downstream, so it's worth stating precisely.

- **Skeuomorphic** = imitating the *object*. Drop shadows that mimic a paper edge, a page-curl animation, a texture that looks like cardstock. Dash is explicitly *not* doing this — no rendered paper grain, no fake torn edges, no literal paperclip icon.
- **Second nature** = imitating the *logic* — how someone who thinks in physical paper actually behaves — without rendering the paper itself.

The mechanism identified for this is **tolerance, not texture**. A perfectly regular grid where every element is rotated a little, and every rotation is different, reads as handmade — not because anything is textured or aged, but because nothing lines up exactly. Dash already has one small instinct in this direction (the project spine tilts on hover). The desk is that instinct, generalized: freeform position, slight overlap, a little rotational drift, cards that don't snap to a grid — none of it "designed to look old," all of it just refusing to sit perfectly still.

**This is a design principle for whoever builds this next, not a locked spec.** Exact rotation ranges, exact wobble tolerances, exact "how crooked is too crooked" — that's a visual-design pass, ideally with mockups Andra can react to, in the usual iterative style.

---

## 3. The two floors

A clean split emerged partway through, and it resolves a lot of the ambiguity that came before it:

**Ground floor — global facts, true everywhere an entry lives, unrelated to any one project:**
- **Type** (existing)
- **Status** (existing) — one honest fact. If it's done, it's done, everywhere, full stop. Finishing something while looking at Project A's desk finishes it on Project B's desk too, if it happens to live there. This was decided deliberately, not by default.
- **Tags** (existing) — cross-project, the same as today.

**Upstairs — local to how you're looking at things *right now, in this project*, not facts about the entry:**
- Desk position (where a card sits, if it's been placed)
- Pile membership (purely emergent — see §5.3, this isn't actually stored as "membership" at all)
- Clip membership
- Wonder symbols pinned to this project's desk
- Highlights made within this project

**The consequence worth sitting with:** since an entry can already belong to more than one project (existing architecture), an entry's desk position can never be one universal fact. The same card can have a home on Project A's desk and be sitting unplaced in Project B's tray, simultaneously. This is not a new problem — it's the same shape as milestone attachment, which is already a link, not a global field.

---

## 4. Vocabulary

Naming things now so nobody — including a future Fable/Opus session — has to guess what a word means later.

| Word | What it means here |
|---|---|
| **Desk** | The freeform per-project surface. Exists on Mac. iPad, later. Not on phone. |
| **Card** | An entry, as it appears on the desk. |
| **Pile** | Cards sitting near each other because that's where they were put. Not a stored object — see §5.3. |
| **Clip** | A small, deliberate, rigid group of cards that move together as one unit until deliberately unclipped. Wordless — no name field — but we call it "clip" in conversation and in docs so we don't lose track of it. |
| **Wonder symbol** (or just **symbol**) | A placeable glyph — a "?", "!", an arrow, etc. — with no title, no status, no body text. Calls attention or indicates an action. Two separate objects from the post-it (§5.6, confirmed 10 Aug). |
| **Post-it** | A small note *with* text — attached to a clip (carrying the "why" of the grouping) **or free-floating on open desk space** (confirmed 10 Aug — architecture pass; Andra chose to allow both). A separate object from the symbol. |
| **Highlight** | A marked span of text *within* an entry's body — not a mark on the card itself, a mark on specific words. |
| **Peek** | The structured, filed view — reuses List/Board, scoped to this project. Lives as a drawer that slides out from directly below the project's color banner — not a popover window, and not painted onto the banner's own color (confirmed 10 Aug — see §5.8). |
| **Unplaced / tray** | Not a stored container. It's just "entries in this project with no desk position yet." Computed, not stored — see §6. |

---

## 5. The objects, one at a time

### 5.1 The Desk

- One per project. Freeform, no grid, no named zones.
- **Confirmed 10 Aug — architecture pass (Andra's call): the desk *replaces* the current project page body.** Not a second face behind a toggle. The colored banner stays exactly as built (identity, stage · progress, the project's actions); everything below it becomes the desk. The panel content the desk displaces has homes: entry groups → the Filed shelf, the milestone editor → its own drawer shelf (§5.8). On the phone, where there is no desk, the page below the banner is Peek content directly (§7).
- Cards can overlap and stack. Touching a card brings it to the top of whatever it's overlapping (confirmed).
- Visual wobble/tilt is the intended "handmade" signal — see §2. Exact tuning is a visual-design task, not decided here.
- Desk position is stored per-project, per-entry (parallel to the existing milestone-link pattern — a link/attachment, not a field on the entry itself). **Confirmed 10 Aug — architecture pass:** the concrete home is the item's `viewState`, keyed `desk:<projectId>`, carried by a new per-key op kind so two desks merge independently — full mechanics in §12.2. Desk arrangement is **synced content, not per-device UI state**: the piles are the thinking, so your Mac desk and a future iPad desk must agree. (The localStorage "UI arrangement stays local" rule does not apply here — that rule is for chrome, and this is the work itself.)
- **The desk is bounded, not infinite** (confirmed 10 Aug — architecture pass). A real desk has edges — piles against an edge are half the point — and an infinite pan/zoom canvas is a whiteboard, a different object. V1 is a generously sized surface (~2× the viewport) that scrolls like a page; pan/zoom is deliberately not built. Also the gentler choice for eye strain: no zoom state to get lost in.

### 5.2 Cards

- A card is just an entry, rendered on the desk instead of in a list row.
- Independently draggable at all times, *unless* it's part of a clip (§5.4), in which case dragging one member drags the whole clip.
- No literal paper texture, shadow, or page-flip animation. See §2.

### 5.3 Piles

- **Not a data object.** This was explicitly walked back mid-conversation: piles do **not** represent status, are not named, are not stored as a category anywhere.
- A pile is purely an emergent visual fact: several cards happen to be near each other because that's where they were dropped. "We don't label piles of paper on our desks" — that line is the whole spec.
- Consequence: dragging a card into what looks like a "pile" does **not** change its status. Moving something to a corner because you're done looking at it is a completely separate act from marking it Done. Both are legitimate; neither implies the other.
- Open direction, not yet locked: piles could carry visual *weight* the way project spines already do — more cards, a thicker-looking cluster — but this was proposed as an idea, not confirmed as a requirement.

### 5.4 Clips

- A clip is the **rigid** counterpart to a pile's **fluid** looseness. Members move as one unit until deliberately unclipped.
- Wordless — no label, no name field (confirmed). We still call it "clip" internally.
- Cross-cutting and project-scoped: a clip is not tied to any pile, doesn't care about status, and multiple unrelated clips can be scattered around the same desk at once — "a little of this and a little of that off to the side."
- A clip can sit alone off to the side, or be embedded inside a larger loose pile — both are valid.
- Typical origin story: you highlight something in one entry because it struck you (§5.7), later notice the same feeling in a different entry, and *then* deliberately clip the two together. The clip is the considered, later act; the highlight is the impulsive, in-the-moment one.
- A clip can carry a **post-it** (§5.6) explaining why its members are grouped — the "why" lives on the post-it, not on the clip itself, so the clip stays wordless.
- **Storage, confirmed 10 Aug — architecture pass:** a clip is a project-side sub-record (ULID-keyed, tombstoned, the exact `milestones` pattern — §12.3), and it is *nearly empty*: existence, created, removed. Membership lives on each card's own desk record as a scalar `clip` field — the same "the relationship lives on the entry, so nothing can drift" reasoning as phase attachment. A card can be in at most one clip per desk, enforced by the data shape rather than a rule. **A clip stores no position:** where it sits is derived from its members at render time, and dragging a clip writes one ordinary position op per member — the bulk-edit rule ("a loop of existing ops, no new data") applied to a drag.

### 5.5 Wonder symbols

- A placeable glyph with **no title, no status, no body** — a "?", "!", an arrow, or similar. Signals "pay attention here" or "an action is needed here," not a fact about anything.
- Placement decides behavior, with no mode toggle: drag it onto a card and it attaches to that card; drag it onto open desk space and it sits at that point, unattached to anything. The gesture itself is the decision.
- **Confirmed 10 Aug:** a symbol pinned to a card is scoped to **this project's desk only** — it does not travel with the entry to another project the entry might also belong to. It behaves like a desk-position fact, not an entry fact.
- **Confirmed 10 Aug:** the symbol is a separate object from the post-it (§5.6) — not one mechanism with two looks, as had been floated mid-conversation.
- **Storage, confirmed 10 Aug — architecture pass:** symbols are project-side sub-records like clips (§12.3). Free-standing symbols carry a desk position; attached ones carry the target entry's id plus a small offset, so they ride the card when it moves. Symbols draw in ink, never in `--ember` — "!" is attention, not overdue, and ember stays indicator-only.
- **Starter glyph set, resolved 10 Aug — architecture pass:** ships with a small fixed set — `?`, `!`, `→`, `★`. Not a registry; adding a glyph later is a constants change, not architecture. A registry can be earned if the set ever feels tight.

### 5.6 Post-its (the clip's note)

- A small note *with* text — a sentence or two, no title, no status.
- **Confirmed 10 Aug: a separate object from the wonder symbol.** Symbols are titleless marks; post-its carry a sentence or two.
- **Confirmed 10 Aug — architecture pass (Andra's call, against the earlier clip-only lean): a post-it can exist independent of a clip.** Attached to a clip, it carries the "why" behind the grouping and rides the clip's derived position. Free-floating, it sits at its own spot on open desk space — a small note to yourself that isn't about any grouping. Same object either way; the difference is one nullable `clip` field (§12.3).
- It deliberately overlaps a little with what a quick entry already does — that's accepted. A post-it is desk furniture (project-local, no status, no tags, invisible everywhere else); an entry is a fact in the system. If a post-it starts wanting tags or a date, the answer is "make it a real entry," the same escape hatch milestones use.

### 5.7 Highlights

- Marking specific **words or phrases inside an entry's body** — not a mark on the card as a whole. This is annotation of language, a different altitude from everything else in this document, which arranges whole cards.
- Made because something stood out, full stop — in the moment, unanalyzed. Highlighting the same feeling in two different entries does **not** create an automatic connection between them. The echo is something *you* notice later, not something Dash announces.
- If a pattern emerges across several highlights, the deliberate next step is to manually clip the entries together (§5.4) — highlight now, clip later, two separate acts.
- Own, looser color palette — deliberately **not** the formal status-color registry. Meant to feel like grabbing whichever highlighter felt right that day, not picking from a defined legend.
- **Scoped to the project it was made in.** If an entry lives in two projects, a highlight made while working in Project A does not show up when that same entry is opened from Project B. (This was Claude's stated reading of "a highlighter is just within the project," offered for correction and not contested — treat as decided, but it's the one interpretive call in this document that was inferred rather than stated outright, so it's worth double-checking against behavior once there's something to click on.)
- **Consequence, resolved 10 Aug — architecture pass:** the editor opened from List, Board or Home has no project context, so no highlights render there and none can be made there. Highlights exist only when an entry is opened *from* a project (desk or Peek). Follows from the scoping rule above; flag it if it grates in practice.
- **Anchoring, confirmed 10 Aug — architecture pass:** a highlight stores the exact phrase plus a little surrounding context and is *re-found* in the body at render time — never a character offset, because bodies merge whole-field last-writer-wins and stored offsets would go stale on any edit (§12.4). If an edit removes the phrase, the highlight stays in the data (never-delete) and simply stops painting.
- **Confirmed 10 Aug — architecture pass: highlighting stays "just a mark" in this build.** No promote-to-Connection. If a pattern emerges across entries, the deliberate act is clipping them together — the two-acts model above. Nothing in the data model blocks designing promotion later; it was deferred, not rejected.

### 5.8 Peek (the structured escape hatch)

- Originally scoped as a popover window. **Refined 10 Aug:** Peek lives as a **drawer that slides out from directly below the project's colored banner**, not a window that opens elsewhere on top of the desk.
- The banner and the drawer deliberately do two different jobs and don't share a surface. The banner is identity — the one place a project gets to wear its own color and feel like itself. The drawer is utility — tidy, filed, structured, deliberately less personal. Peek content sits **edge to edge, right underneath** the color block, on its own quieter surface, rather than being painted onto the banner's color. This keeps the banner from being diluted by a dense list of rows.
- It's a drawer, not a page: it slides open and closed. You never leave the desk — the desk just shows a different face of itself for a moment, then closes back up.
- **Three shelves, stacked inside the drawer** (third shelf confirmed 10 Aug — architecture pass, Andra's call on where the milestone editor goes when the desk takes the page):
  1. **Unplaced** — entries in this project with no desk position yet (see §6). The first thing visible when the drawer opens. Desk platforms only — phone's Peek has no Unplaced shelf, since there's no desk to be unplaced from (§7).
  2. **Filed** — the structured view of everything in the project, underneath the unplaced shelf. **Resolved 10 Aug — architecture pass:** List-style first, reusing the shared row renderers the project page already uses (quiet chrome, no catalog band or rail); a Board face can be added later if wanted. The existing quick status control stays on these rows, and select mode keeps working here.
  3. **Milestones** — the existing milestone editor, moved intact into the drawer. Utility belongs in the drawer; the banner keeps stage · progress as its read-only summary. On the phone, milestones stay a section of the Peek page.
- **Confirmed 10 Aug — architecture pass: Peek is strictly flat.** It has zero notion of desk geometry — no mini-map, no "where does this sit" hints. The desk is directly above the drawer on Mac anyway; revisit only if orientation actually turns out to be a problem once there's something to click on.
- On Mac/iPad(future), this drawer lives under the desk's banner. **On iPhone, there is no desk and therefore no banner-plus-drawer structure to speak of** — phone is Peek-only, full screen, all the time (see §7).
- Still the smallest lift in the whole document: nearly all of it already exists as List/Board, just needs scoping down to one project's members and a new home in the layout.

---

## 6. Entry lifecycle & "unplaced"

- A brand-new entry — created on the phone, or created mid-session on the desktop — has **no desk position** anywhere until it's deliberately dragged onto a desk.
- There is no separate stored "tray" or "inbox." An entry's "unplaced" state is simply the absence of a desk-position link for a given project — computed by asking "what in this project has no spot yet," the same derived-not-stored approach the milestone stage chip already uses.
- Unplaced entries show up sorted normally in Peek mode (by number, tag, connection, status, etc.) — nothing special-cased about how they're found.
- Because desk position is per-project (§3), an entry can be placed on Project A's desk while remaining unplaced on Project B's — simultaneously, and correctly.
- **Visually, this now has a home:** the unplaced set is the top shelf inside the Peek drawer (§5.8) — the first thing visible when the drawer slides open, sitting right above the fully filed List/Board shelf underneath it.

---

## 7. Platform behavior

| Platform | Desk | Peek |
|---|---|---|
| **Mac** | Yes — the primary surface, "the workhorse." | Yes — the drawer under the banner (§5.8; "popover" in earlier drafts predates the confirmed drawer decision). |
| **iPad** | **Not yet.** Andra's stated view flipped mid-conversation, worth recording precisely: the first instinct was "view-only," but the settled position is that iPad *should* eventually get the **full** desk — touch and stylus are arguably a more natural fit for this than a mouse — but it's explicitly sequenced for later, after the Mac version is solid. Not a permanent limitation, just not now. |
| **iPhone** | **No, deliberately.** Phone's job stays "capture plus peek" — get the thought down before it's lost, not sit and arrange. No desk, and therefore no tray UI either, since there's nothing to be unplaced *from*. New entries from phone simply appear in Peek mode like everything else. |

---

## 8. Decisions at a glance

For quick reference — full rationale is in §5 and the sections above.

1. Status and tags are global, cross-project. Piles, clips, symbols, and highlights are project-local.
2. Piles are not stored, not named, not tied to status. Purely emergent from proximity.
3. Clips are rigid (move together); piles are fluid (each card independently movable) — same visual moment, different mechanics.
4. A clip is wordless but can carry a post-it for the "why."
5. Wonder symbols and post-its are two separate objects (confirmed 10 Aug).
6. A symbol pinned to a card is scoped to that project's desk, not to the entry globally (confirmed 10 Aug).
7. Symbol placement (card vs. open desk) is decided by drop location — no separate mode toggle.
8. Highlighting marks text, doesn't auto-connect entries, uses its own color palette, and is project-scoped.
9. Touching a card brings it to the top of the stack.
10. Desk exists on Mac now, iPad later (full desk, not view-only), never on phone.
11. Peek is the structured, scoped-to-one-project equivalent of List/Board — a face of the desk, not a destination. (An earlier draft said "popover" here; superseded by decision 13.)
12. New entries, from any device, start unplaced and land in Peek/tray until dragged onto a desk.
13. Peek is a drawer that slides out from directly below the project's color banner — not a popover window, and not painted onto the banner's own color — so the banner keeps doing identity and the drawer does utility (confirmed 10 Aug).
14. The unplaced tray is the top shelf inside that drawer; the filed view is the shelf underneath it (confirmed 10 Aug).

Added 10 Aug — architecture pass (product calls answered by Andra; pattern reuse resolved by Fable, reasoning in §5 and §12):

15. **The desk replaces the current project page body** — no toggle, no second face. Banner unchanged; entry groups → Filed shelf; milestone editor → its own third drawer shelf (Andra's call).
16. **Peek is strictly flat** — zero desk geometry, no mini-map (Andra's call).
17. **A post-it can be free-floating or clipped** — same object, one nullable `clip` field (Andra's call, loosening the earlier clip-only lean).
18. **Highlighting stays "just a mark" in this build** — no promote-to-Connection; deferred, not rejected (Andra's call).
19. **Desk arrangement is synced content, not per-device UI state.** It rides the log like milestones do; the localStorage rule is for chrome, not for the work.
20. **Desk position lives in `viewState` keyed `desk:<projectId>`,** carried by a new per-key op kind with per-field LWW — the proposal reserved `viewState` for exactly this; the pass gives it real merge semantics (§12.2).
21. **Clips, symbols, and post-its are project-side sub-records** — ULID-keyed, add/set/remove, tombstoned: the `milestones` pattern, no new merge machinery (§12.3).
22. **Clip membership is a scalar field on the card's desk record** — one clip per card per desk by data shape; the clip itself stores no position and no members; its geometry is derived from members at render time.
23. **Dragging a clip = one ordinary position op per member** — the bulk-edit rule applied to a drag; no clip-position field to invent or merge.
24. **Highlights anchor to the phrase, not to offsets** — stored text + context, re-found at render; an orphaned highlight keeps its data and stops painting (§12.4).
25. **No highlights outside a project context** — the editor opened from List/Board/Home shows none and creates none (follows from decision 8's scoping).
26. **Wobble/rotation is derived, never stored** — a hash of entry id + project id; identical on every device for free.
27. **Z-order is a small integer on the desk record** — tap/drop sets max+1; ties break by id.
28. **The desk is bounded and scrollable, not an infinite pan/zoom canvas** — a desk has edges; zoom is deferred with nothing blocking it.
29. **Platform gating reuses `pointer: fine` + viewport width** — the `--control-min` precedent; iPad arrives later by loosening the gate, not by rearchitecture.
30. **Highlighters are 4 new theme tokens** (`--hl-1`…`--hl-4`), both themes, AA-checked, outside the status registry. Ember stays indicator-only everywhere on the desk; symbols draw in ink.
31. **Symbols ship with a fixed starter set** (`?` `!` `→` `★`) — constants, not a registry.
32. **Filed shelf is List-style first** via the shared row renderers; a Board face is a later addition if wanted. Quick status control and select mode keep working there.
33. **`formatVersion` → 3**, covering all desk op kinds including the ones that ship in later phases; ignore-and-preserve handles skew, and every desk upload note says "update all devices before editing."
34. **Drags commit on drop, never per frame** — the deferred-commit rule; a sync landing mid-drag can't fight the pointer.

---

## 9. Considered and set aside

Logged so these don't get silently re-proposed without a reason to revisit them.

- **A distinct die-cut "shape" per entry type**, echoing the shape-per-category idea from a stationery reference. Set aside because type already carries identity via color and icon — a shape would be a second costume for something already dressed. The clip/highlighter/sticker framing replaced this line of thinking entirely.
- **Literal visual "string" connecting linked entries.** Explicitly not wanted right now ("I don't really need that right now"). The existing Connections field stays exactly as it is — text in the editor — for this phase. Worth revisiting once the desk exists and there's something to actually look at.
- **A single merged object for wonder symbols and post-its** ("a scrap that's sometimes blank, sometimes has a word or two"). Considered, explicitly rejected 10 Aug in favor of two separate objects.

---

## 10. Open questions — deliberately unresolved

Per explicit instruction: these are flagged, not guessed at. **Three of the original six were resolved 10 Aug in the architecture pass** (highlight promotion → decision 18; Peek geometry → decision 16; post-it independence → decision 17) and have moved to §8. What remains open:

- **The original problem this all grew out of** — that it's hard to tell at a glance whether an entry is Done or On Hold — is **still unsolved**. Piles no longer touch status at all, so they can't be the fix. This needs its own pass, separate from the desk.
- **iPad timing** — full desk is the intended destination, not view-only, but no timeline exists yet. Explicitly deferred until "the kinks and bugs" of the Mac version are worked out. The platform gate (§8.29) is written so enabling iPad is a loosening, not a rebuild.
- **Exact visual tuning of the "handmade" feel** — rotation ranges, overlap tolerance, how a pile's weight should read, whether cards drift or snap, **card anatomy** (what a card's face shows), and **tap semantics** (does a tap raise, open, or both — raise-on-tap is decided; what *opens* a card is not). This is the Phase D0 mockup pass (§13), with Andra reacting — not a decision to make in prose.
- **Whether a Board face gets added to the Filed shelf.** List-first is decided (§8.32); Board is a "if wanted, later."
- **Whether arranging the desk should count as attention** — i.e. whether a desk drag updates `touched` and therefore feeds the future Heat view. Resolved *no* for this build (arrangement ops carry their own timestamps; no extra write), but flagged for revisit once Heat exists.
- **Highlight promotion revisit** — deferred by decision 18; reopen only if hand-clipping proves insufficient in practice.

---

## 11. For whoever architects this next

*(This pass happened 10 August 2026 — §12–§13 below are its result. The patterns listed here were the brief, and the result follows them; the list is kept because it explains §12's shape.)*

A few patterns already exist in Dash that this idea should almost certainly reuse rather than reinvent:

- **Link-based attachment**, not new fields, for anything project-scoped (desk position, clip membership, symbol pinning). This is the exact shape milestone attachment already uses — a link with a target and a label, set-merge semantics, no new op kind.
- **Derived, not stored**, for anything that's really just a computed fact about the current state — piles, and the "unplaced" set, both belong in this category, the same way the milestone stage chip is computed at render time and never written back.
- **Ember stays an indicator only.** Nothing in this document should introduce a second meaning for it.
- This is very likely a genuinely large structural decision — new visual system, new interaction model, several new small object types — and fits the stated bar for a Fable 5 architecture pass rather than going straight to an Opus implementation note.

---

## 12. Architecture (Fable pass, 10 August 2026)

Same posture as the milestones addendum: this is an **extension** of the proposal's §2 (data model), §3 (logs), and §6 (merge) — nothing existing is reinterpreted. Three new op kinds, one `formatVersion` bump (2 → 3), zero migration (absence of every new field means "none," everywhere, always — the §9-of-milestones rule). All three op kinds follow the `"ms"` merge pattern exactly — `add` idempotent by id, `set` last-writer-wins per addressed field, `remove` sets a tombstone, out-of-order arrival tolerated — and should share one generic sub-record merge helper in `store.js` rather than three copies.

### 12.1 Desk placement — the `"vs"` op (viewState grows real merge semantics)

The original proposal (§2.1, §4.1) reserved a namespaced `viewState` on every item for per-view layout, with corkboard positions as its named example. It has never had a writer, so it never needed merge rules. The desk is its first writer, and whole-object LWW would be wrong (placing the same entry on two different desks from two devices must not contest), so `viewState` gets per-key, per-field ops:

```json
{ "itemId": "<entryId>", "op": "vs", "key": "desk:<projectId>",
  "action": "add", "value": { "pos": { "x": 340, "y": 120 }, "z": 7 },
  "ts": "…", "device": "mac" }

{ "itemId": "<entryId>", "op": "vs", "key": "desk:<projectId>",
  "action": "set", "field": "pos", "value": { "x": 402, "y": 96 },
  "ts": "…", "device": "mac" }
```

- **Materialized shape:** `item.viewState = { "desk:<projectId>": { pos, z, clip, removed, created } }`. Missing object = never placed.
- **Fields are conceptual facts, merged independently:** `pos` (`{x, y}` — always moves as a unit, so it's one field, not two), `z` (integer; tap/drop sets desk-max + 1; concurrent ties break by entry id), `clip` (a clip's id or `null` — §12.2), `removed` (tombstone; **un-place = set `removed`**, restore = set it back to `null`, per the never-delete rule), `created` (first placement, from `add`).
- **Merge:** LWW per `(itemId, key, field)`. Device 1 moves a card while device 2 clips it → different fields, both win. Two devices move the same card on the same desk → same field contests, loser goes to merge notes like any collision.
- **Why `"vs"` and not a link label:** §11 asked for "link-based attachment," and this *is* that shape — a per-(entry, project) fact stored on the entry — but `links` are a set of `{target, label}` with add/remove semantics: a label can't carry coordinates, and "move" would be remove+add, which set-merge would happily resolve to *two* positions after concurrent moves. Position needs per-field LWW, which is the sub-record pattern, not the set pattern.
- **Why generic `"vs"` and not a desk-specific op:** future spatial views (corkboard proper, roadmap nudges) get merge-safe layout for free by picking a new key namespace. One op kind serves them all.
- **Rotation is not a field.** Wobble is derived at render time from a hash of `entryId + projectId` — stable, identical on every device, never stored, never synced. Exact range is a D0 mockup constant.
- **Coordinates** are logical pixels in the desk's own space. The desk is bounded (~2× viewport, scrollable — §5.1); clamping on load keeps any stray position reachable.

### 12.2 Clips — project-side record, entry-side membership

Split across the two floors deliberately, mirroring how phase attachment works ("the relationship lives on the entry, so nothing can drift"):

- **The clip itself** is a nearly-empty project-side sub-record (§12.3): `{ cid, created, removed }`. Wordless by data shape, not by discipline.
- **Membership** is the `clip` field on each card's own desk record (§12.1) — a scalar, so a card is in at most one clip per desk, enforced structurally. Clipping = one `vs set clip` op per card; unclipping = setting it `null`.
- **A clip stores no position and no member list.** Its geometry (bounds, where the clip mark and any attached post-it render) is derived from its members' positions at render time. Dragging a clip commits one ordinary `pos` op per member on drop — the bulk-edit rule ("the same single-item edit run in a loop, no new data"). Clips are small (a few cards); the op count is trivial. Worst concurrent case — two devices dragging the same clip — resolves per-card LWW and is survivable, visible, and repairable by hand; a clip-owned position was considered and rejected (§12.7).
- **Degenerate clips** (one member, or zero after un-placing) are valid data; render decides how quietly to draw them. No auto-dissolve op — deriving "this clip is empty" is free, and writing data to say so would be derived-state-stored, which Dash doesn't do.

### 12.3 Symbols and post-its — the `"dk"` op (project-side desk collections)

One new op kind carries all project-side desk objects, addressed by collection:

```json
{ "itemId": "<projectId>", "op": "dk", "coll": "clip",
  "action": "add", "id": "<cid>", "value": {}, "ts": "…", "device": "mac" }

{ "itemId": "<projectId>", "op": "dk", "coll": "sym",
  "action": "set", "id": "<sid>", "field": "attach", "value": "<entryId>",
  "ts": "…", "device": "mac" }
```

- **Collections and fields:**
  - `clip` — `created`, `removed` (that's all — see §12.2).
  - `sym` (wonder symbols) — `glyph` (identifier from the starter set: `question` / `bang` / `arrow` / `star`), `pos` (`{x,y}`, used when free-standing), `attach` (an entry's id, or `null`), `offset` (`{dx,dy}` relative to the card when attached), `removed`, `created`. Drop location decides `attach` vs `pos` — the gesture is the decision, per §5.5.
  - `note` (post-its) — `text`, `pos` (used when free-floating), `clip` (a cid, or `null` — attached notes render at the clip's derived bounds and ignore `pos`), `removed`, `created`.
- **Materialized shape:** one optional `deskObjects` field on project items: `{ clips: […], symbols: […], notes: […] }`, each array **kept sorted by id** so the snapshot has one canonical byte form (the milestones precedent — two devices receiving the same ops in different order produce identical files).
- **Merge:** identical to `"ms"`, per `(itemId, coll, id, field)`.
- A symbol attached to a card that gets un-placed keeps its `attach` and simply doesn't render until the card returns (its data outlives the card's placement, same as everything else under never-delete). Same for a note whose clip empties.

### 12.4 Highlights — the `"hl"` op (entry-side, project-scoped annotation)

```json
{ "itemId": "<entryId>", "op": "hl", "project": "<projectId>",
  "action": "add", "id": "<hid>",
  "value": { "text": "the exact phrase", "prefix": "…context ", "suffix": " context…", "color": "hl-2" },
  "ts": "…", "device": "mac" }
```

- **Materialized shape:** `item.highlights = { "<projectId>": { "<hid>": { text, prefix, suffix, color, removed, created } } }`.
- **Anchoring is by content, not offset.** The body is a scalar field merged whole-value LWW; any stored character offset goes stale on the first edit from anywhere. So a highlight stores the exact phrase plus short surrounding context (~32 chars each side) and is **re-found at render time** — prefix/suffix disambiguate repeated phrases. If the phrase no longer exists in the body, the highlight is *orphaned*: kept in data, not painted. (The entry editor may list orphans quietly; whether/how is a D0 call, not data.)
- **`color` is a token name** (`hl-1`…`hl-4`), never a hex — four new highlighter tokens in `tokens.css`, defined in both themes, AA-checked as text-bearing washes, deliberately outside the status registry per §5.7. Ember is not one of them and never will be.
- **Merge:** identical pattern, per `(itemId, project, id, field)`.
- Highlights render only when the entry is opened from a project context (desk or Peek) matching the highlight's project — decision 25.

### 12.5 Derived, never stored — the inventory

Everything in this list is computed at render time and has no field, no op, and no way to go stale — the stage-chip rule applied throughout:

| Derived fact | Computed from |
|---|---|
| Piles | Nothing. Proximity on screen *is* the pile. Zero code beyond overlap rendering. |
| The unplaced set | Project members with no live `desk:<pid>` viewState record. |
| Clip geometry (bounds, mark, note anchor) | Members' `pos` at render time. |
| A clip's members | The `clip` fields on desk records — one pass, inverted. |
| Wobble/rotation | Hash of entry id + project id. |
| Z-tie resolution | Entry id comparison. |
| Pile "weight" (if D0 wants it) | Local card density — a render effect, never data. |

### 12.6 Rendering, platform, and interaction rules

- **One archive pass per desk render.** A `deskData(store, projectId)` helper — the `calendarData` precedent — returns placed cards with their records, the unplaced list, clips with derived members and bounds, symbols, and notes, all from a single walk. Peek's shelves read the same result. Nothing else may scan `store.all()`.
- **Platform gate:** desk requires `pointer: fine` *and* a wide viewport (the `--control-min` media-query precedent, plus width). Phone and today's iPad get the Peek page; enabling iPad later is loosening this gate, nothing more.
- **Drags commit on drop** — pointer-move is local state; one op batch on release; no per-frame ops, no store emit mid-drag (the deferred-commit rule, applied to the pointer). A background sync landing mid-drag must not steal the card (same class of rule as the capture box's focus ownership).
- **Reduced motion:** wobble is a static rotation, not animation, so it survives `prefers-reduced-motion`; any drift/settle animation added in D0 must respect the setting.
- **Accessibility posture, stated honestly:** desk arrangement is pointer-only in this build. The accessible, structured face of the same data is Peek — every card's content, status, and actions remain reachable there at full text size with 44px targets. This is the same split the addendum's two floors already describe, and it should be kept true: nothing may exist *only* as desk arrangement.
- **Select mode:** off on the desk surface (`supportsSelect` stays honest — cards are not list rows); alive in Peek's shelves.
- **Ember discipline:** an overdue card may show ember exactly as list rows do (indicator); nothing decorative on the desk may use it.

### 12.7 Decisions log (why not the alternatives)

- **Why not `links` labels for position?** Sets merge by add/remove; concurrent moves would converge to two positions. Position is per-field LWW work — the sub-record pattern.
- **Why not per-device localStorage for placement?** The arrangement is the thinking — content, not chrome. It must sync, survive device replacement, and eventually appear on iPad. localStorage is for nudges like rail-open and sort order.
- **Why not a clip-owned position with member offsets?** It adds a second coordinate authority (drift between clip pos and member offsets), complicates unclip (baking absolutes back), and buys only a smaller op count for an object that is typically 2–5 cards. Derived geometry keeps one source of truth.
- **Why not character offsets for highlights?** Whole-body LWW invalidates offsets on any edit from any device. Content anchoring degrades gracefully (orphan, not corruption).
- **Why not an infinite pan/zoom canvas?** A desk has edges — the metaphor is load-bearing (§5.1) — and zoom state is a place to get lost with strained eyes. Bounded-and-scrollable is also structurally upgradeable later.
- **Why one generic `"vs"` instead of a `desk` op?** Corkboard/roadmap layout was already promised a home in `viewState`; per-key ops make that promise mergeable once, for every future spatial view.
- **Why three op kinds instead of one clever one?** `vs` addresses (item, key), `dk` addresses (project, coll, id), `hl` addresses (item, project, id) — unifying them means a polymorphic address format, which is cleverness where the codebase's stated style is boring-and-explicit. The merge logic is shared in one helper anyway.
- **Why does `formatVersion` 3 cover op kinds that ship in later phases?** The version marks the desk format *family*; ignore-and-preserve makes later kinds safe regardless, and versioning per-phase would make "what version am I on" mean nothing.

---

## 13. Phased build plan

Same posture as always: each phase independently useful, real daily use before the next, format never migrated, every phase delivered as uploadable files plus a plain-English note, every phase ending with the standing regression tests (two-device offline-edit sync test — now including desk ops — and a full theme swap). Full per-phase definitions of done live in `docs/changes-2026-08-10-desk.md`.

**Phase D0 — The mockup pass (no app code).** `mockups/desk-preview.html`, linking the real `tokens.css`/`app.css` like `home-panels-preview.html` does: static desk with stand-in cards, the wobble at adjustable tolerances, overlap, a clip with a post-it, a free post-it, symbols, the drawer opening below a banner. Andra reacts in the established iterative style; D0 locks the visual constants (rotation range, card anatomy, tap semantics, pile weight or not) that §2 and §10 defer. **Nothing later starts until D0 is signed off.**

**Phase D1 — Placement core.** The `"vs"` op + shared sub-record merge helper + headless replay tests; `formatVersion` 3; the desk surface replacing the project page body (gated per §12.6); drag from drawer to desk, move, raise, un-place; the Peek drawer with Unplaced / Filed / Milestones shelves; the phone's Peek page. This is independently useful with nothing else built: a desk you can arrange, and the tidy face beside it.

**Phase D2 — Clips and post-its.** The `"dk"` op (`clip` + `note` collections); clip/unclip; clip drag; post-its attached and free.

**Phase D3 — Wonder symbols.** The `sym` collection; drop-decides-attachment; the starter glyph set.

**Phase D4 — Highlights.** The `"hl"` op; highlighter tokens; making and seeing highlights in the editor when opened from a project context; orphan behavior.

Phase order reasoning: D1 is the contract everything else reads and delivers the core experience alone. Clips before symbols because clips exercise the cross-floor mechanics (entry-side membership + project-side record) that symbols then reuse in simpler form. Highlights last because they are the most self-contained and touch the editor rather than the desk surface.

---

## 14. D0 feedback round (11 August 2026)

Andra ran the round-1 mockup and answered. This section records what she locked, what she changed, and the three decisions that **supersede or narrow** earlier ones — §8's decisions 13, 14 and 28 are no longer accurate on their own and must be read with 38, 36 and 37 below. Delivered with `docs/changes-2026-08-11-desk-d0-r2.md`; the round-2 mockup implements all of it.

### 14.0 Locked from round 1

- **Rotation range: ±2°.**
- **Pile weight: on**, the "edges" treatment — one to three hairline sheets drawn under a card as local density rises. Still a pure render effect from density (§12.5); nothing is stored.
- **Card anatomy: C** — № + type + title + a two-line body snippet + status.
- **Card width is a RANGE, not a value** — nominally 260–300px, the card sizing itself on its title and snippet. D1 implements this as `min-width` / `max-width` with `width: max-content`, not a fixed width.
- **Looseness is deliberately still open.** It depends on how cards read against the mat (§14.1), so it is judged in round 2 and not before.

### 14.1 The desk ground is a mat, not a dot grid — decision 35

The desk carries **a large, quiet, curvilinear field-line graphic**, landscape, like a desk mat. Not straight lines, not a literal texture, not an image file: it is drawn as SVG from the conformal map `W = z + a²/z` — a cylinder in a uniform field, i.e. Maxwell's Fig. XV turned 90° into landscape, which was Andra's reference. Both families of curves come from inverting that map along straight lines in `W`, so the whole thing is a few dozen paths and no asset.

Presence matches `app.css`'s body dot grain — **3% of `--text-primary`**, "felt not seen" — and it is stroked in the ink token, so it inverts with the theme exactly as the grain already does. It stays inside §2's "second nature, not skeuomorphic": organic, but nothing is pretending to be a material.

The exact presence and scale are round-2 questions; the direction is settled.

### 14.2 The desk pans — decision 36

Round 1 could strand a card outside the visible frame. That was **a bug against decision 28**, not missing scope: a bounded surface you cannot traverse isn't bounded, it's lossy. Two fixes, both in the round-2 mockup and both required in D1:

- **Dragging empty desk space pans the desk.** It is an input method for the scrolling decision 28 already promised.
- **Positions clamp in the MODEL, not only while drawing.** Round 1 clamped at render time, so a card could hold coordinates past the edge, sit pinned to the boundary, and ignore the first part of any drag back — reading exactly like "stuck". Every commit now clamps the stored value.

Implementation nuance for D1: the desk becomes **its own scroll region** rather than relying on page scroll, so that "the frame" is a definite thing to pan within and to fit the glance to. This is a refinement of §5.1's "scrolls like a page", not a reversal of it.

### 14.3 Glance — a narrow revision of decision 28

**Hold, and the whole bounded desk scales down to fit in view; release, and it returns exactly where it was** — same scroll position, same scale. While held it is **view-only**: no dragging, dropping or raising.

This is deliberately *not* the open-ended pan/zoom decision 28 rejected, and the reasoning there still holds. What makes it cheap is that it keeps no state: no persisted zoom level, no control left on screen, nothing to navigate while zoomed out. It is a momentary look up from the desk and back.

Round 2 offers two triggers — **hold `Z`** and **press-and-hold a button in the banner** — and asks Andra to keep one. (Both is also a defensible answer; the key alone is not, since the desk is pointer-first.)

### 14.4 Peek is three independent mini-drawers — supersedes decisions 13 and 14

Not one drawer with three shelves stacked inside it. **Unplaced, Filed and Milestones each get their own drawer handle, in a row along the bottom edge of the colour banner** — kitchen-drawer style. Open the one you want; it takes only the height its own contents need; the other two stay shut.

- What decision 13 established still holds: the drawers hang off the banner's bottom edge, and the drawer **body** sits on its own quieter surface rather than being painted onto the banner's colour.
- What changes is only the arrangement, plus one addition: **the handles wear the project's colour**, pulled from the same `--ground-bg` / `--ground-ink` the banner sets, so they are legible on any colour including a custom hex.
- **No data-model consequence.** Same three sets, same single `deskData(store, projectId)` walk (§12.6). This is a rendering choice.
- Decision 14's "unplaced is the top shelf" is now "unplaced is the first handle" — same intent, different furniture.

### 14.5 Double-click expands a card in place — decision 39

Resolves the "tap semantics" half of §10's open question. **Tap raises** (decision 9, unchanged). **Double-click expands the card, where it sits, into the full entry** — it grows on the desk rather than opening a modal — and double-click again collapses it. An expanded card sits square to the page (the wobble is for glancing at, not reading through) and does not drag.

The `⤢` corner affordance is still on the table as an alternative or an addition; that is the one part of this still being chosen.

### 14.6 Two round-1 bugs, recorded so D1 doesn't repeat them

- **Double-click did nothing.** `pointerdown` called `preventDefault()`, which suppresses the browser's compatibility mouse events — including `dblclick`. Fixed by not preventing default on the way down and recognising the second click directly from pointer events, which also behaves the same on trackpad, mouse and eventually stylus.
- **The drawer opened and shut with no slide, "regardless of the slider".** Not a bug in the drawer: macOS **Reduce Motion** was on, and both `tokens.css` and the mockup correctly strip every transition under `prefers-reduced-motion`. The accessibility floor is right and stays. What was missing was any way to *know* that was happening, so the round-2 mockup detects the setting, says so plainly, and offers a **preview-only** override for judging feel. The shipped app must never carry that override.

### 14.7 The visual constants (rounds 2–4)

Locked across rounds 2, 3 and 4, with the round noted where a value moved. **These are the D1 constants**; nothing in this table is still a question. Banner: **A**, per §14.17.

| | |
|---|---|
| Rotation range | **±2.3°** (r3) |
| Looseness | **0.40** (r4) |
| Card width | **260–410px**, the card sizing itself between them |
| Expanded width | **460px** |
| Card anatomy | **C** — № + type + title + two-line snippet + status |
| Pile weight | **edges** (hairline sheets) |
| Expand gesture | **double-click**, and nothing else — see 14.9 |
| Mat presence | **12%** of `--text-primary` (r4) |
| Mat scale | **6** (r3) · footprint **2000px** wide at 3:2, fixed and centred (r4, §14.12) |
| Drawer speed | **380ms**, open *and* close |
| Settle | **200ms** (r3) |
| Glance speed | **380ms** |
| Glance trigger | **both** — hold `Z` *and* press-and-hold the banner mark |

### 14.8 Further decisions from round 2

- **Decision 40 — the glance trigger in the banner is a mark, not a labelled button.** A small dingbat (`✧` in the round-3 mockup), not the words "hold to glance": it is a held gesture, and the label was longer than the thing it named. It stays a real button with a real accessible name and the full `--control-min` height; only its face is quiet. Note for whoever picks the final glyph: **`★` is taken** — it is one of the four starter wonder symbols (§5.5) — so the glance mark must not be a star that reads as one of those.
- **Decision 41 — the `⤢` corner affordance is dropped.** Double-click alone expands a card. Nothing replaces it on the card face; the Collapse button inside an *expanded* card stays, since an expanded card needs a visible way out.
- **Decision 42 — a drawer opens at its own handle's width, not the banner's.** §14.4 said "only as far as its contents need" and round 2 read that as height only. Both apply: a mini-drawer is **a column under its own handle**, never full width. Two consequences: it needs a readable minimum width (a third of a narrow banner is not a usable Filed list — the mockup uses 360px) and it must slide left rather than overhang the right edge. Because it is narrower than the page it **slides over the desk rather than pushing it down** — pushing would open a band of empty page beside it.
- **Decision 43 — the desk is sized for ~100 entries.** Round 2's 2200 × 1400 was too tight to think in. **4400 × 2900** is roughly twice the area 100 cards occupy at the locked card size and looseness — enough that everything fits *and* there is still bare desk to put things down on. This makes panning (§14.2) and the glance (§14.3) load-bearing rather than conveniences.

### 14.9 Round-2 bugs, and what they were

- **A drawer opened at full banner width.** Fixed per decision 42.
- **A drawer closed with a cut, not a slide.** The contents were unmounted in the same tick the height went to zero, so there was nothing left to animate. The fix is to keep the contents mounted for exactly as long as the close lasts, then unmount — which means the JS has to agree with the CSS about whether motion is happening at all under `prefers-reduced-motion`. D1 needs one shared "how long is motion right now" helper rather than two opinions.
- **Wonder symbols could not change state.** `!` was free-only, `?` was pinned-only — a straight bug against §5.5, which says the drop location decides and there is no mode toggle. Both directions now work off one drag: dropped on a card it pins at the offset you dropped it (`attach` + `offset`, §12.3) and rides that card; dropped on open desk it lets go and takes a `pos`. Dropping it back on its own card just moves the offset.

### 14.10 Deferred by Andra — do not act on these yet

- **The banner's height on the desk view.** It may be taking too much room now that the desk is the page. To be **discussed before anything changes** — no shrinking, collapsing or hiding until then. (Whatever is decided must keep §5.1's "the banner stays exactly as built" honest, or explicitly supersede it.)
- **The wonder symbol glyphs themselves** (§5.5's `?` `!` `→` `★`) get a design pass eventually. Flagged so it isn't lost; not now.

### 14.12 Round-3 answers, and the mat's footprint

Rotation moved to **±2.3°**, looseness to **0.60**, settle to **200ms**, mat scale to **6**. Everything else in §14.7 stands. The full current set is in the mockup's CANDIDATE block, each line marked with the round that locked it.

**Decision 44 — the mat has its own fixed footprint and is centred on the desk.** Round 3's bigger desk (decision 43) inflated the mat with it, because the graphic was sized from the desk bounds. That was wrong by the metaphor: a desk mat is a thing *on* a desk, not a covering *of* one. The mat now carries its own width (2000px in the mockup, tunable) at a 3:2 landscape ratio, sits in the middle of the surface, and does not care how big the desk gets. It still scales during a glance, because it is part of the surface — that was never the objection.

### 14.13 The mat is decorative, and that is load-bearing — decision 45

**The mat is not a container, a drop zone, or a boundary.** Cards move on to it, off it, half across it, and nothing about placement, clamping or z-order changes. It is `pointer-events: none` and that is the entire extent of its relationship with the cards. Anything later that wants mat-like shapes to *hold* things (§14.16) is a different object and must be built as one — this decision is what keeps that from being introduced by accident.

### 14.14 The banner is restructured — revises decision 15

**Only the "banner unchanged" clause of decision 15 is revised. The rest of decision 15 stands: the desk replaces the project page body, no toggle, no second face.**

The banner as built is roughly 300px tall and, now that the desk is the page, it takes the majority of the screen and pushes both the desk and the drawers down. The scale was deliberate — hierarchy in this system comes from a size jump rather than from more colour — but it overshot once the page below it became a working surface rather than a list.

**What has to survive:** identity (name and catalogue number), stage · progress · entries, what's next, the overdue mark, all four project actions, and the glance trigger. **What is up for grabs:** how much of the project's colour is spent, and how tightly the facts pack.

Round 4 puts **three candidates plus the existing one** in the mockup, all at about a third of the current height:

- **A — ledger band.** The colour still runs full width, as a band rather than a block: name, then the facts in ruled cells, then the actions.
- **B — spine.** The colour becomes an edge down the left, the same way a project already wears it on the shelf; everything else on paper. Quietest.
- **C — tab.** The colour is spent on one thing only — a tab carrying the name, the die-cut label from the reference images. Most graphic personality.
- **D — as built**, kept only so the height difference is visible.

All three new ones share one device, and it is the part worth keeping whichever wins: **a ruled specification grid** — mono label over a body-size value, hairline dividers — which is the ledger/specimen-card voice Dash already writes in, used structurally instead of decoratively.

**The accessibility floor is unchanged and was checked:** values and content stay at body size (18px+); the 11px mono voice is used only for labels, exactly as `.lbl` already is on every row, panel and banner in the app today; every control keeps `--control-min`; and every colour is a token drawn from `--ground-bg` / `--ground-ink`, so AA holds through a re-theme and for a custom hex.

One implementation note this exposed: `app.css` scopes its "controls on a colour ground" rules to `.project-banner .btn`. Whichever banner wins, **D1 should widen that selector to `.on-ground .btn`** rather than duplicate the rules — the mockup stands in for that.

### 14.17 Round-4 answers — banner A, and the drawer wears the colour

**Banner A (the ledger band) is chosen**, with two refinements that are part of the decision:

- **The project's name owns the top line, always**, whatever its length. It never shares that line with the facts and never gets crowded by them.
- **Stage, progress, entries and next collapse into one thin, quiet line** beneath it. Explicitly "more like texture than input" — present and glanceable, deliberately low weight, not something to be read. The spec-grid of two labelled rows that round 3 proposed was too much furniture for facts that get consulted rarely. Ember is the one exception and keeps full weight: it is an indicator, not texture.

**Decision 46 — the open drawer is painted in the project's colour, on top of the elevation.** This reopens decision 13's "the drawer is deliberately neutral, banner = identity, drawer = utility" on purpose: standing out from the desk cards matters more than the identity/utility split, and colour plus elevation do that together — not one instead of the other.

What that costs, and how it was answered: every component in the drawer (list rows, the quick status control, the milestone editor, the unplaced chips) was built for paper. Each is re-drawn from `--ground-ink`, the value the ground itself declares, exactly as the banner's buttons already are — so nothing names a colour and AA survives a re-theme or a custom hex.

**The one genuinely new problem is the type/status marks.** Their colour arrives inline from the registry, and a registry colour is not guaranteed to be legible *as text* on an arbitrary project colour. So on a colour ground the identity moves from the letters to the dot: the label draws in ground ink, the 5px mark keeps its registry colour. A dot carries no contrast requirement; the words do. **D1 should teach `.mk` and `.status-ctl` in `app.css` to read a `--mk-dot` variable**, so one row renderer works on both grounds instead of two.

### 14.18 Round-4 bugs

- **The drawer fought with the cards for layering.** The desk viewport was `position: relative; z-index: auto`, which does *not* create a stacking context — so every card's z-index competed directly with the banner and drawer in the page's root stacking context, and a card that had been touched recently enough painted over the open drawer. Fixed by giving the viewport `z-index: 0` and `isolation: isolate`, which contains all card z-indices inside it. The drawer has always been absolutely positioned, so it has never pushed or reflowed the desk: placements do not move when a drawer opens, and must not.
- **The glance fitted the desk's bounds, not the content.** On a 4400 × 2900 desk a handful of cards shrank to nothing in order to show a lot of empty surface. It now fits **the bounding box of what is actually placed**, plus padding, centred — and never scales *up*, so a nearly empty desk is shown at its own size rather than magnified. This holds at ten cards and at a hundred without a special case.
- **Wonder symbols, third report — rewritten rather than patched again.** The round-3 fix drew a pinned symbol *inside* its card element. That looked equivalent to the data model and wasn't: a nested symbol lives in its card's stacking context (so it cannot be lifted above other cards while dragged) and inherits the card's transform on top of its own. Symbols are now always direct children of the desk, at a **derived** position — free means "from my own `pos`", pinned means "from my host card's current position plus my `offset`" — which is literally what §12.3 says the data means. One position model, one drag path, no nesting. A card drag carries its pinned symbols along explicitly.
  **The drop rule is now a pure function** (`symbolDrop(sym, over, geom)`) with headless tests covering free→pinned, pinned→free, pinned→a different card, and the invariant that **exactly one of `attach`+`offset` / `pos` is ever set**. D1 should keep it pure and keep those tests — this is the third attempt, and the reason the first two failed is that the rule was tangled up in DOM structure.

### 14.19 Round-5 answers

- **Decision 47 — the facts line carries hierarchy by weight, not by furniture.** The one thin line under the project name is not uniform: **the stage and the next milestone's name come to full strength and weight; the counts and labels fall back to ~58%.** Nothing new is drawn — no boxes, no second colour. A tinted chip on the stage was built and compared; weight won. Ember still overrides everything on that line, because it is an indicator.
- **Decision 48 — clicking anywhere off an open drawer closes it, and that click does nothing else.** The drawer zips shut and the card underneath is *not* raised, the desk is *not* panned. A click aimed at getting the drawer out of the way must not also move the work. (Clicks outside the desk entirely — a control elsewhere on screen — close the drawer and still do their own job.)
- **Decision 49 — the banner uses hairline rules, borrowed from the drawer handles.** Weight alone (decision 47) wasn't enough to organise the facts line. The drawer handles already separate themselves with a hairline; bringing that same language up into the banner does the structural work:
  - **Vertical hairlines between the facts**, so each one sits in its own cell — the drawers' separator, one level up.
  - **Horizontal hairlines** under the project name and between the facts line and the drawer handles — the rules the tall banner used to have, restored at the new density.
  - **The stage and its fraction share one cell** — no rule between "In progress" and "03 / 05", because they are two halves of one fact, and a rule there claims they are two.
  - **The fraction is set large** (22px against the line's 11px) with `line-height: 0`, so it contributes nothing to the line box: the glyphs overflow into padding that already existed. The band's height, both hairlines and every other item stay exactly where they were — the number grows, nothing moves.
  Both rule sets are toggleable in the mockup (`vertical rules` on/off, `horizontal rules` none/title/both) and both default on. The rule colour is mixed from whichever ink the banner variant writes in, so it holds on a colour ground and on paper. Ember still opts out of the cell treatment: a border plus cell padding would just make the ember block wider, which reads as a bigger alarm than it is.

- **Wonder symbols confirmed working** by Andra in round 5, after the round-4 rewrite. Closed.
- **The coloured drawer is confirmed** (decision 46 stands as written).

**Round-5 bug: two banners drew at once.** `.pb-b`'s base rule carried `display: grid`, which has the same specificity as the `.pb { display: none }` that hides all candidates and came later in the sheet — so banner B rendered underneath whichever candidate was actually selected. Only the `[data-banner]` rules may switch a candidate on; a variant's own rule must never set `display`. Worth remembering generally: **in this codebase, "hide everything then show one" only works if the hiding rule is not out-specified or out-ordered by a sibling.**

### 14.20 First-deploy fixes (D1, 14 August 2026)

Four of these were bugs; two are decisions worth keeping.

- **Decision 50 — the desk page runs edge to edge.** The banner, the drawer handles and the surface all span the window, the way the catalog band does on List and Board, rather than sitting inset inside the page's normal padding. The desk is the page; a framed box in the middle of a page is a different object.
- **Decision 51 — the desk has no visible scrollbars.** The way around it is dragging it (the trackpad still works, it is just not advertised with a bar down the side). A bounded scroll box with native scrollbars is not the pan/glance model decision 28 was revised into — it is the default the browser gives you when you forget to build one.
- **The banner's controls recede into the ground.** `app.css` scoped its "controls on a colour ground" rules to `.project-banner .btn`, and the new banner is `.on-ground`, so every button fell back to the paper default — cream boxes on a saturated ground, the loudest thing on the page. The selector is now widened to `.on-ground .btn` exactly as §14.14 said it should be, **and the primary no longer inverts to a solid block on this banner**: it stays in the ground's family with a full-strength border and weight. Ink-on-ground is the measured pair, so contrast is unchanged.
- **More air under the title rule.** The progress fraction is set large with no line-height of its own — its glyphs overflow the line box on purpose (§14.19), and the padding is what they overflow into. There wasn't enough of it, so the number touched the rule above.

**The blocking bug, and what it teaches.** The drawers appeared not to open at all. The drawer body was being appended to the page as a sibling of the handle row, which moved it out of the only positioned ancestor it had — so its `top: 100%` resolved against the whole page and it opened a full viewport height below the fold. It *was* opening, off screen.

Worth recording because of what caught it and what didn't: the jsdom render test asserted the drawer's contents mount, and they did. **jsdom has no layout**, so nothing about position, size or overflow is testable there. The test now asserts the drawer's parent element instead of only its contents — a structural fact jsdom *can* see. The general rule for this codebase: headless tests can check structure and data, never geometry; geometry is checked by looking.

### 14.21 Second-deploy fixes (D1, 14 August 2026)

**The data one, and it was not the desk.** New entries were reverting to "Untitled" after Done. The editor was writing the title correctly on every keystroke; the loss happened afterwards, in sync. `pullDropbox()` treats a changed remote snapshot as state to `Object.assign` over the live store — including each item's `_fieldTs` bookkeeping — so any local edit made since that snapshot was written simply vanished. The hazard was already named in a comment above the call; it just wasn't guarded. A snapshot is a BASE, not the truth, and local work now goes back on top of it two ways: our own log's read offset is reset so it replays in full (replay is idempotent — that is the premise of an append-only log), and ops still pending a push are re-applied directly, carrying their original timestamps so LWW puts them back exactly. Both backends. There is now a headless test that reproduces the loss on the old path and proves the new one.

**Decision 52 — nothing may write to the store between pointerdown and pointerup.** §8.34 said drags commit on drop; the raise-on-touch was writing immediately, which emitted a store change, which re-rendered the desk, which destroyed the card element the pointer had just captured. That single violation produced *four* reported symptoms — a card needing a click before it would drag, drags not registering, drops snapping back, and general lag and flicker. The raise is now local (an inline z-index) and is committed on release, batched with the position. The rule is absolute and worth stating as one: **the pointer owns the desk until it lets go.**

**Decision 53 — an expanded card is two surfaces.** Drag and text-selection want the same pixels, so they get different ones: the card's header is the drag handle (with a grip mark), and everything below it is text you can select, copy from, and click links in. Outside the header the desk does not capture the pointer or prevent default at all, which is what makes selection work; double-click collapses only from the header, so double-click in the body still selects a word. Bare URLs in a body are rendered as real links at render time — the body stays plain text, this is a courtesy, not a format.

**Two more that were just wrong:**
- The banner's ✧ never worked, only the `Z` key. `wireDesk` looked the button up with `closest(".desk-page")` while the surface was still detached from the page, so it found nothing and attached no listener. It is passed in now.
- The view jumped to the top-left corner after editing an entry, and opened there too. Restoring a scroll position is itself a scroll event, and the listener recorded the half-restored value as the new truth; a flag now keeps a restore from overwriting what it is restoring. A desk that has never been looked at now opens **centred on the mat's eye** rather than in the corner of a 4400 × 2900 sheet.

### 14.22 Raised for later (not scope)

- **Show attached drawings and images on the card itself**, rather than only referencing them. (`sketchThumb()` in `views/shared.js` already does this for list rows and board cards, so the card renderer can borrow it.)
- **Dragging a card toward the drawer should open it**, so the card can be dropped back inside — rather than dropping onto a closed handle.
- **Rename "Unplaced"** to something more on-brand. No replacement chosen.
- **Double-click empty desk to make a post-it there.** This is D2 territory (`note` collection, §12.3) and should be designed with it.

### 14.23 Post-deploy root-cause pass, steps 1–2 (14 August 2026)

Against a root-cause review by Fable, which traced the whole post-deploy bug cluster — flicker with no trigger, drags needing a second click, drops snapping back, the view resetting to the corner — to the *environment* the desk's gesture code runs in rather than to the gesture code itself. Its ordering is being followed; this covers the first two steps.

**Step 1 — the self-sync echo (`sync.js`).** `_lastSnapText` is the "have I already applied this snapshot?" marker, and **only the pull path was setting it**. So after every edit, `flush()` wrote a fresh `snapshot.json` and the next poll (8s folder / 10s Dropbox) downloaded the file *this same device had just written*, failed to recognise it, and did the full heavy reload — `loadSnapshot`, reset the own-log offset, replay the entire log, emit, rebuild the whole page. Every edit came back around as a ghost re-render seconds later, with no remote device involved. Recording what we wrote, on both backends, is the entire fix. Two lines.

This is the single highest-value line in the desk work so far: the random rebuilds it caused are what killed drags mid-gesture, dropped scroll input, and made new entries appear in pieces.

**Step 2 — the glance's scroll restore (`views/desk.js`).** `.desk-surface` transitions its transform over 380ms. `glanceOff()` cleared the transform and wrote the saved scroll position back *in the same tick* — but the surface was still visually tiny, so the viewport's scrollable area was a few hundred pixels and the browser clamped the write to roughly zero. The scroll listener then recorded that clamped value as the new saved position, and from then on **every** rebuild "restored" to the top-left corner. That is why the reset appeared after a glance and then again after the next Done: the glance corrupted the position, and Done was merely the next rebuild to reveal it.

Two changes: the scroll guard is now an object shared with the glance, held for the whole gesture so nothing that happens while scaled is ever recorded; and the restore waits for the transform's `transitionend` (with a timeout fallback, because that event can be missed) before handing the position back. Under `prefers-reduced-motion` there is no transition, so it restores immediately — the JS and the CSS have to agree about that or the timer waits for an animation that was never going to run.

**Step 2, second attempt (v35).** The first attempt tried to put the scroll position back *after* the zoom-out transition finished. Andra tested it: the saved position was no longer being corrupted (editing and pressing Done now held its place — the guard half worked), but letting go of the glance still landed in the corner. The bisect is clean: the failure was in the untested half, the timing.

So the second attempt removes the timing rather than tuning it. **A scaled element contributes its scaled box to scrollable overflow**, so while the desk was small there was very little to scroll and *any* write was clamped — every restore was a race against that, and races are not fixable by moving them. The surface is now wrapped in a **sizer** that holds 4400 × 2900 and is never transformed, so the scrollable area is a constant. The glance is then purely a transform on the surface inside it, with the current scroll offset folded into the translate, and **the scroll position is never written at all**. Letting go removes the transform. Nothing to restore, no timing to get right, nothing left to race.

The test changed shape with it, and is stronger for it: instead of "does it restore correctly" (undecidable without a layout engine) it asserts **the gesture writes to scroll zero times**, which jsdom can answer honestly.

**Step 3 — renders are held for the life of a gesture (`app.js` + the desk).** §8.34 and decision 52 both say the desk must not write to the store between pointerdown and pointerup, and it doesn't — but that only ever governed the desk's OWN writes. A render can be triggered by anything: a sync pull, a status change, a keystroke in the editor. A render rebuilds the page, and a rebuild destroys the element the pointer captured. So the promise had to be widened from "the desk doesn't redraw itself during a drag" to **"nothing redraws during a gesture"**.

`scheduleRender()` now respects a hold, `holdRenders()` is handed to views through `ctx`, and the desk takes one on pointerdown and releases it on pointerup — and on pointercancel, on window blur, and on its own teardown, because a leaked hold would freeze the app's rendering entirely. It is a counter rather than a flag so overlapping holds can't release each other early, and any render missed while held runs once on release. The drawer-to-desk drag takes one too.

**Step 4 — the double-click memory moved into desk state.** `lastTap` lived in `wireDesk`'s closure, which dies with every rebuild — and the first click on a card that isn't already on top *causes* a rebuild, because it commits a raise. So the second click arrived at a desk with no memory of the first, and **expanding by double-click could only ever work on a card that happened to be on top already.** It now lives in `viewLocal` beside `expanded`, where a rebuild can't reach it.

**Still to do:** step 5 — reconcile the desk in place instead of rebuilding it — deliberately in its own session. It is the durable answer to full-page rebuilds, and steps 1–4 have calmed the environment enough to make it safe to attempt.

**The library question is closed for now.** Every symptom traced to the render/sync environment, not to gesture handling, and a library's listeners die with a destroyed element exactly the way hand-rolled ones do. `panzoom` is ruled out permanently — it wants to own the surface's transform, which collides with both the scroll-based pan and the glance. `interact.js` is the right shape but only earns its size if D2+ needs inertia, snapping, resize handles or multi-touch rotate. Until then the ~250 lines already written stay.

### 14.24 The typing flicker was one frame, not a rebuild (15 August 2026, v37)

Step 5 was carrying this bug, and it turned out not to own it.

The reasoning that pointed at step 5 was sound as far as it went: the editor saves on every keystroke, every save rebuilds the page, so typing rebuilt the desk once per character. What it skipped is that **a rebuild is not by itself visible**. Repainting the same pixels looks like nothing. Something had to make the rebuilt desk *differ* from the one it replaced, for one frame, before settling.

That something was the scroll restore. A new scroll container starts at (0, 0), which on a 4400 × 2900 sheet is the empty corner, and `restore()` ran inside `requestAnimationFrame` — the **next** frame, not this one. So each rebuild painted a frame of the corner and then snapped back. One corner-flash per keystroke.

The fix is a mount hook. `renderProjectPage` returns the page with `_deskMount` on it, and `views/project.js` calls it synchronously in the same task as the `appendChild`. Measuring and scrolling are valid there precisely *because* the element is in the document by then — which is why this could not simply have been hoisted earlier inside `desk.js`, where the desk is still detached and has no size. Nothing paints until the task ends, so the corner is never drawn. The rAF stays behind it as a fallback, made once-only by a `mounted` flag.

**Step 5 is not cancelled, it is reclassified.** Reconciling by card id is still the better end state: it removes the per-keystroke rebuild cost rather than hiding it, and it is the natural ground for D2's clips and post-its. It is now a **performance** change to make on its own when the desk is busy enough to want it, not a bug fix. Doing it as a bug fix would have meant a medium-sized refactor of `views/desk.js` shipping with no way to tell whether it had worked, since the flash it was aimed at would have gone either way.

**The general lesson, and it is the second time on this desk:** when a rebuild is blamed for something visible, ask what *differs* between the old paint and the new one. §14.23's glance bug had the same shape — the rebuild was real, but the thing that made it show was a scroll value being clamped. Rebuilds are the setting, not usually the cause.

### 14.25 The desk is not text (15 August 2026, v38)

The first click anywhere on the desk highlighted the banner and topbar, as though they had been swept with the mouse.

Mousedown begins a text selection; that is the browser's default. The desk carries almost no text of its own, so the selection anchored to the nearest text it could reach, which is **above** the surface, and swept backwards to get there. "First click" is what named the cause: a freshly rendered page has its selection anchor at the start of the document, so the first press drew a selection from the top of the document to the cursor. After that the anchor sat inside the desk with nothing above it, and every later click looked clean.

`user-select: none` on `.desk-viewport`, inherited by everything on the surface. `.dcard.is-expanded` already puts `user-select: text` back on itself (round 2, §14.21) and its `.dcard-drag` header already puts it back to none, so the read-and-copy body is untouched.

**It had to be CSS, and the reason is a rule already in the file.** `preventDefault()` on pointerdown would cancel the selection, and `wireDesk` deliberately does not call it — preventDefault suppresses the browser's compatibility mouse events and takes double-click-to-expand with them. Marking the surface non-selectable removes the gesture at its source instead, so nothing is traded. **Any future "stop the browser doing X on the desk" should reach for a CSS property before it reaches for preventDefault**, for exactly this reason.

Also fixed in passing: `.dcard` declared `user-select: none` unprefixed while the expanded-card rules beside it carried both spellings. Safari dropped the `-webkit-` prefix only recently, so cards were selectable on an older Safari. Both now carry both.

No test. Pure layout behaviour, and per §14.23's lesson jsdom cannot see it — a test asserting the stylesheet contains a line would pass whether or not a browser honoured it, which reads as coverage without being any.

### 14.15 Confirmed, not new

**Un-placing a card back to the tray is already D1 scope** (§13: "drag from drawer to desk, move, raise, un-place"), implemented as `vs set removed` with restore, per §12.1's never-delete rule.

### 14.16 Raised for the future — not scope, but the architecture answer is known

Both were flagged in round 3 as "don't let this get lost", with the explicit question of whether they change how anything gets structured now. **They don't** — and it is worth writing down why, so nobody redesigns the data model in anticipation of them.

- **More mats — draggable coloured shapes** (squares, rectangles, circles; flat colour, possibly the project's own) dropped on the desk as sub-groupings to stack entries on.
- **Desk widgets** — movable things on the desk that can travel with entries.

Both are **project-side desk objects**, which is exactly what the `"dk"` op already carries (§12.3). Each becomes one more collection alongside `clip`, `sym` and `note` — `{ id, pos, size, colour, removed, created }` for a shape — with no new op kind, no merge machinery, and no change to anything shipping in D1–D4. The `"dk"` op was written addressed by collection precisely so this is an addition rather than a migration.

Two things to keep straight when either is picked up:

1. **A shape that holds entries is not the mat.** The mat is decorative and inert by decision 45. If a shape is a *grouping*, membership has to live somewhere real — and the answer already exists in the clip pattern (§12.2): the relationship lives on the card's own desk record as a scalar, so nothing can drift. A shape that cards merely *sit on top of* stores nothing and is closer to the mat.
2. **Piles stay emergent** (§5.3). Shapes would be a second, deliberate way to group, sitting beside clips. That is a product decision to make properly at the time, not a consequence of building the shapes.

---

### 14.26 Phase D2 landed — clips and post-its (16 August 2026)

Built to §5.4, §5.6, §12.2 and §12.3 exactly as written; nothing in the data model was reopened. Recorded here are only the calls the brief explicitly left to the implementer, plus the one thing that turned out to be a bug rather than a choice.

**The calls that were left open, and what they were made:**

- **Stack anchor: the topmost member's position, not the centroid.** `placed` already arrives sorted by `compareZ`, so "topmost" is the last element — no new comparison and no averaging. It also behaves better under a drag: every member moves by the same delta, so the anchor moves by exactly that delta and the stack cannot creep by a rounding error per drop.
- **Clip drag hit target: the mark *and* every member card.** The brief offered "top card or the icon"; making the whole closed stack draggable is the more forgiving target and costs nothing, because per-card dragging genuinely does not exist in the closed state. The mark keeps driving the clip when it is *open* too, so an open grid can still be moved as a unit.
- **A post-it may be dropped on a clip in either state.** Closed is the natural target and is what the brief expected; refusing the open one would have been a rule to remember rather than a thing that works.
- **An attached post-it hangs off the mark**, so it rides the stack with no code of its own — the anchor it is given is derived from the same members the stack is.
- **Clip tilt range: ±7°**, against the cards' ±2.3°. A mark that agrees too closely with the paper under it reads as printed-on. One constant, `CLIP_ROT_MAX_DEG`, expected to be tuned.
- **Emptying a post-it's text throws it away.** Not asked for; added because it makes an accidental double-click on the desk cost one keystroke instead of a menu, and because a blank scrap is rubbish rather than a note. Guarded so a *rebuild's* blur can never trigger it — see below.

**The bug, and the rule it earns.** Double-clicking the paperclip mark did nothing at all. `setPointerCapture` on pointerdown routes the rest of the gesture to the captured element, so `pointerup` reports `target` as the desk surface, not the mark — and the "was this on the mark?" test on release always came back no. **After a pointer capture, `event.target` is a fact about the capture, not about the cursor.** Anything a gesture needs to know about where it *started* has to be captured on pointerdown. This is the same shape as §14.20's `pointerleave` problem: a question asked at the wrong moment, answered honestly, wrong.

**Two things worth knowing before tuning it:**

1. **The paperclip mark draws in the project's own colour** (`--ground-bg`), with a hairline of desk ink under it so it can't vanish. A very pale project colour will give a very pale clip. That is the "it re-colours per project for free" trade, and the alternative (nudging the colour toward ink) was left undone deliberately — it would mean the mark is not quite the project's colour, which is a bigger lie than a pale clip.
2. **Open/closed is not stored, on purpose and per the brief.** If a clip's open state ever needs to survive a reload, that is a `viewLocal` persistence question, not a data-model one — do not give the clip record a field.

---

## 14.26 D2 round 2 — Andra's reactions, and one data-model change (16 August 2026)

Andra used the first D2 build and answered. This section records what she locked and the **one field the data model gained**, which is the only part of §12 this round touches. Delivered with `docs/changes-2026-08-16-desk-d2-fixes.md`.

### 14.26.1 Decision 54 — a post-it attached to a clip carries its own `offset`

**This supersedes the "an attached post-it hangs off the mark" call in §14.25's D2 notes, and extends §12.3's `note` collection.** Everywhere else on this desk, *placement is the decision* — §5.5 says so for symbols in as many words. An attached post-it was the single exception: it ignored position entirely, drew at the clip's derived bounds, and sat on top of the paperclip. Andra asked for it to stay where she drops it.

The answer mirrors the symbol pattern rather than overloading `pos`, for the same reason §12.7 gives for not using `links` labels for position — one field must not mean two things:

- **`note.offset`** — `{dx, dy}` from the clip's derived anchor point. Used **only** when `clip` is set.
- **`pos`** keeps its existing meaning, used **only** when the post-it is free (`clip` is null).
- Dropping onto a clip records the drop point as `offset`; dragging an attached note *within the clip's bounds* updates `offset` exactly as an ordinary drag updates `pos`; detaching drops `offset` and picks up a real `pos` from the drop point. The attach/detach mirror symbols already use (§14.9, §14.18).
- **No `formatVersion` bump and no migration.** Absence means "none", everywhere, always (§9): a note written by the first D2 build has no `offset` and gets one default placement — below the stack, clear of the mark — until the first time it is dragged.

Two small consequences, both decided rather than inherited:

1. **"Within the clip's bounds" means the bounds**, not just the paper. A note dropped on bare desk *between* an open clip's cards stays attached; only leaving the clip's box detaches it. Refusing that would have been a rule to remember rather than a thing that works — the same reasoning §14.25's notes give for accepting a drop on an open clip.
2. **Unclipping hands each attached post-it a real `pos`** (at the spot it is already sitting) and clears its `clip`. Cards are not repositioned by an unclip and never will be — they have stored positions of their own — but a note's `offset` was only ever meaningful against the clip that just stopped existing. This is a *deliberate* write in one explicit action, and it does not weaken the "a dangling reference is read, never repaired" rule (§12.3): a note whose clip vanished some other way is still quietly treated as free, and still never written to.

### 14.26.2 Decision 55 — the clip pins the stack from the RIGHT

The clip mark moves to the right side of the stack and the members align on their **right** edges. Andra is right-handed and wants it to read as pinned from her own hand's side; this replaces the earlier "your call on which corner".

**It turned out to be more than a preference, and that is the part worth keeping.** A card sizes itself to its own title between `CARD_MIN_W` and `CARD_MAX_W` (§14.7), so aligning *left* edges left the right edges ragged by up to 150px — the clip gripped the widest sheet and nothing but air on the narrow ones. The right edge is the only edge that can be the same for every member. So `stackSlot()` and `markSlot()` return a **`right`** coordinate rather than an `x`, and the view writes CSS `right` with `left: auto`, letting the browser do the subtraction. Nothing about the *stored* position changes: a clip still owns no geometry, and dragging one is still one ordinary `pos` op per member.

### 14.26.3 Decision 56 — no button chrome on the banner's top row

Broader than the D2 feature and flagged as such: the outlined-button look comes off the **whole** top row, not just the new clip button. Words, hover wash, focus ring and every accessibility floor stay; only the resting border and fill go. `.pb-acts .btn` — a CSS-only change with no behaviour impact.

- **Clip icon at rest:** no outline, no box, the glyph alone in the quietest ink the banner already writes in (62% of `--ground-ink`, one step stronger than the facts line's 58% so a control's graphic still clears 3:1). One line, expected to be tuned by eye.
- **Clip icon active:** a solid block of the banner's ink with the glyph knocked out in the project's own colour. Read that way because a glyph filled with the banner's colour *on* the banner would be invisible; it is the one place a box is wanted, since a mode has to be unmistakable against a row that now carries none.

Unchanged and confirmed: **post-it tint stays at 18%**; **stack peek (7px/6px) and clip lean (±7°) stay**. Grid column count is no longer a constant — see below — but three across remains what a normal window shows.

### 14.26.4 Round-2 bugs, and the two rules they earn

- **A post-it lost its typed words if the pointer moved first.** "Emptying a post-it throws it away" (§14.25's D2 notes) had been implemented as "it is empty when it loses the cursor, so throw it away" — and a brand-new post-it is empty *by definition*, from the instant it is made. Anything that took the cursor away before the first keystroke tombstoned it, and on this desk the commonest is pressing on bare desk to pan, i.e. the pointer simply moving. Renders are held for the life of that gesture (§14.23 step 3), so the scrap stayed on screen looking alive while the words went into a record that was already dead. **The rule is the sentence it was always meant to be: you cannot empty something that was never filled.** The `isConnected` guard is still right and stays — it tells a rebuild's blur from a real one — it just could never tell *emptied* from *never filled*. Escape now discards a blank never-typed scrap, so an accidental double-click still costs one keystroke.
- **The open grid overlapped, because it was calculated rather than measured.** A fixed 300px column pitch against cards that reach 410px guaranteed it. Pitch and column count now come from the members' real boxes, measured from the `_deskMount` hook — the same synchronous, pre-paint hook §14.24 introduced. **General rule for this desk: anything that depends on how big something turned out to be is laid out at mount from real boxes, and the arithmetic stays in the DOM-free `js/desk.js` with the view handing it the numbers.** (§14.20 stands: jsdom still cannot see any of it, which is what `tests/visual-harness.html` is now for.)
- **An expanded card could be half-covered by a grid sibling.** Every member of a clip carries the *clip's* z, so DOM order alone decided. An expanded card now sits in its own band (`Z_EXPANDED`), contained by the viewport's stacking context so it can never reach the banner or an open drawer (§14.18).
- **Cursor and selection inside an expanded card — and both were old lessons repeating.** The grab cursor survived over selectable body text because `.dcard.is-clipped { cursor: grab }` sits *later* in the sheet at equal specificity; the clip icon's quiet ink was lost because `.on-ground .btn` sits *earlier* at higher specificity. §14.19's round-5 bug was the same shape. **In this stylesheet, a rule meant to be an exception has to out-specify what it is excepting, not merely follow it.** Separately, `user-select: text` on the expanded card reopened §14.25's door by the side entrance — drag up out of the card and the selection sweeps into the banner, because that is the nearest selectable text. `user-select: contain` is Firefox-only, so the range is clamped on `selectionchange`. **This is the one place on this desk where JS is the right answer and CSS is not**, which is the exception §14.25's "reach for CSS before preventDefault" rule was always going to have.

### 14.26.5 Still not in scope

- **A hand-written script face for post-it text.** Wanted eventually, explicitly later.
- **A custom cursor** in place of the default arrow/hand. Andra's own idea, noted for a later phase.
- **Step 5 — reconciling the desk in place** rather than rebuilding it. Still the better end state, still a performance change rather than a bug fix (§14.24).

---

*End of addendum. Next action: hand this document, alongside `dash-architecture-proposal.md`, `dash-current-state.md`, and `dash-milestones-calendar-addendum.md`, to the implementing model via `docs/changes-2026-08-10-desk.md` with the instruction: "Build Phase D0 only." Update `dash-current-state.md` as each phase lands.*
