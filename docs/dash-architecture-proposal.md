# "Dash" — Architecture & Design Proposal

**For:** Andra (andrakhoder@gmail.com) — personal dashboard / visual inbox, used daily across iPhone, iPad, and Mac, indefinitely.
**Status:** Handoff document. Written to be fully self-contained — the implementer (human or AI) should not need any prior conversation context. Reasoning is included alongside every major decision.
**Date:** July 16, 2026.

---

## 0. Summary of the requirements this design serves

A single system holding items at wildly different scales (quick ideas → active projects → multiyear goals), organized by **editable types, editable statuses, freeform tags, and explicit item-to-item connections** — no folders. A **visual image inbox** with a napkin-sketch markup tool (Apple Pencil). **Many switchable views** over the same data (board, kanban, tree, graph, calendar, corkboard, orbit, heat, roadmap). **Live Gmail/Calendar** read access. **Voice as a first-class input** with on-device transcription where honest, and an untranscribed-audio fallback where not. **Reminders.** Data as **local files synced via iCloud Drive** — no hosted backend. Browser-based app. Eye strain is a standing design constraint: large text, high contrast, voice in/out everywhere. Styling must be cleanly separated from logic. Starts at dozens of items, must remain comfortable at thousands over years.

The user is not a developer. Every recurring action (adding a type, syncing, capturing) must be a normal in-app or one-tap action. One-time setup steps requiring technical follow-along are acceptable if walked through.

---

## 1. Two honest constraints found during research (read this first)

Two of the stated constraints collide with what browsers on Apple devices can actually do in 2026. The whole architecture is shaped by resolving them honestly rather than pretending they don't exist.

**1a. Browsers on iPhone/iPad cannot read or write an iCloud Drive folder directly.** Chrome and Edge on the **Mac** support the File System Access API (`showDirectoryPicker`), so the app can be granted persistent read/write access to your Dash folder in iCloud Drive — fully automatic sync on the Mac. Safari — the only real browser engine on iOS/iPadOS — has never shipped this API and Apple has not committed to it ([caniuse](https://caniuse.com/native-filesystem-api), [WebKit status via MacRumors thread](https://forums.macrumors.com/threads/file-system-api-on-safari.2481850/)). Consequence: on iPhone/iPad, the app keeps its data in browser storage (IndexedDB) and syncing to/from the iCloud folder is a **one-tap-ish manual action** (export/import via the Files picker), not invisible. Section 6 designs around this so it's safe and low-friction, and lists the upgrade paths if it ever becomes annoying enough to fix properly.

**1b. A purely "local file" app can't do Google OAuth.** Google sign-in requires the app to be served from a real `https://` origin — a page opened as a local file has no origin Google will accept. Recommendation: host the app's **code** (not data) on free static hosting — GitHub Pages is the default choice. This is still "no backend": the host serves the same fixed HTML/JS/CSS files to every device and never sees your data; there is no server logic, no account system, no database. It also solves three other problems at once: one stable URL on all devices, "Add to Home Screen" so it feels like a real app on iPhone/iPad, and automatic updates when the app is improved. Your items, images, and audio never leave your devices and your iCloud.

Everything else you asked for is achievable roughly as specified.

---

## 2. Core data model

### 2.1 Everything is an Item

One universal record type. An idea, a project, a strategic goal, a note, an image, a voice memo, a reminder, a pinned email — all the same shape, differentiated by `type` and by what's attached. This is what makes "one system, many views" possible: every view renders Items; nothing is special-cased.

```json
{
  "id": "01J2X8Q4N7...",            // ULID: unique, time-sortable, generated offline
  "type": "quick-idea",             // key into the user-editable Types registry
  "status": "active",               // key into the user-editable Statuses registry
  "title": "Napkin sketch tool — pressure = line weight",
  "body": "freeform markdown text…",
  "tags": ["freelance-transition", "app-dash"],
  "links": [
    { "target": "01J2X7...", "label": "part of" },
    { "target": "01J2X9...", "label": "inspired by" }
  ],
  "attachments": [
    { "hash": "a3f9c2…", "ext": "png",  "role": "image" },
    { "hash": "b81d07…", "ext": "png",  "role": "sketch-overlay" },
    { "hash": "77e2aa…", "ext": "m4a",  "role": "audio", "transcript": null }
  ],
  "dates": {
    "created": "2026-07-16T14:02:11Z",
    "modified": "2026-07-16T14:20:00Z",
    "touched":  "2026-07-16T14:20:00Z",   // any open/view/edit — feeds the Heat view
    "due": null,
    "remind": null
  },
  "source": null,                    // set for Gmail/Calendar references — see §7
  "viewState": {                     // per-view layout data — see §9
    "corkboard:01J2X7...": { "x": 340, "y": 120 }
  }
}
```

Notes on the choices:

- **ULIDs** as IDs: generated offline on any device with no coordination, and sortable by creation time for free.
- **`links` are directed, optionally labeled edges.** Labels ("part of", "blocks", "inspired by") are freeform text, not a fixed vocabulary — same philosophy as tags. The graph view can render labels or ignore them.
- **`tags` are plain strings.** A tag that gains gravity over time (say `freelance-transition` becomes your central goal) doesn't need migrating — you create a proper Item for the goal and link things to it, while the tag keeps working. Tags for loose affinity, links for real relationships.
- **`touched` vs `modified`**: `modified` changes only on edit; `touched` also updates when you open/inspect an item. The Heat/neglect view is literally "color by `now − touched`" — this field is the cheap trick that makes that view nearly free.
- **Attachments are content-addressed**: the file on disk is named by the SHA-256 hash of its bytes (`assets/a3f9c2….png`). Immutable — an edited sketch is a *new* file with a new hash. This is what makes binary sync conflict-proof (§6) and deduplicates identical images automatically.

### 2.2 Types and Statuses are data, not code

A small `registry` document (stored and synced like everything else) holds the editable lists:

```json
{
  "types":    [ { "key": "quick-idea", "label": "Quick idea", "icon": "⚡", "color": "accent-2" }, … ],
  "statuses": [ { "key": "active", "label": "Active", "color": "green" }, … ]
}
```

Adding a type is an in-app form: name, pick an icon, pick a color. No code, no config files. Deleting a type that's in use prompts to reassign. Statuses work identically, and the Kanban view derives its columns from this registry — add a status, get a column.

### 2.3 Scale honesty

Thousands of items over years is *small* by data standards. 5,000 items × ~2 KB of JSON each ≈ 10 MB — comfortably loaded into memory in full at startup, kept in an in-memory index (by id, by tag, by type, by status, by date). Every view queries that index; nothing hits disk per-interaction. Full-text search over 5,000 items is a sub-millisecond in-memory scan, or MiniSearch/FlexSearch if fancier ranking is wanted. Images and audio are the actual bulk and are lazy-loaded by hash only when a view shows them, with generated thumbnails (~30 KB) for grid views so the Pinterest board never loads full-resolution originals.

The realistic ceiling for this architecture is on the order of tens of thousands of items — years away at any plausible capture rate, and §11 covers the remodel path if it's ever reached. Do not add a database now; it would be over-engineering that makes the system harder for a non-developer to own.

---

## 3. Storage format & folder layout

The iCloud Drive folder is the **canonical home of all data** and is designed to outlive any particular version of the app — the file format is the stable contract; the app can be rewritten around it.

```
iCloud Drive/
  Dash/
    data/
      log-mac.jsonl          ← append-only change log, written ONLY by the Mac
      log-iphone.jsonl       ← written ONLY by the iPhone
      log-ipad.jsonl         ← written ONLY by the iPad
      snapshot.json          ← periodic compaction of the merged state (Mac writes it)
    assets/
      a3f9c2….png            ← content-addressed originals (immutable)
      77e2aa….m4a
      thumbs/a3f9c2….jpg     ← regenerable thumbnails
    inbox/                   ← drop zone: anything placed here becomes an item (§5, §8)
    themes/
      default.json           ← theme documents (§10)
```

**Why an append-only log per device instead of one file per item:** every change (create, edit field, add tag, link) is one JSON line appended to *that device's own* log file. Since no file ever has two writers, iCloud Drive never has to merge concurrent edits to the same file — which is precisely the situation where iCloud silently creates confusing "Conflicted Copy" duplicates. This one decision is most of the sync-conflict answer (§6). The log is also a complete, human-readable history of everything you've ever done — a free audit trail and undo source. `snapshot.json` exists only so startup doesn't replay years of history: it stores the merged state plus how far into each log it has incorporated; loading = read snapshot + replay each log's tail.

Everything is plain JSON/JSONL + ordinary image/audio files. If this app vanished tomorrow, the data is readable in any text editor. That property is a design requirement for a system meant to run for years.

---

## 4. The view layer — one store, many lenses

### 4.1 Architecture

Three strictly separated layers:

1. **Store** — the in-memory item index + the persistence/sync engine. Knows nothing about rendering.
2. **Query layer** — one function shape used by *every* view: `query({ filter, groupBy, sortBy })` → items or grouped items. Filters compose over tags, type, status, dates, link-neighborhood, and free text.
3. **View registry** — each view is a module implementing a tiny interface: `render(queryResult, viewConfig, containerEl)` plus optional interaction handlers. Views are registered by name; the view switcher is just a menu over the registry. Adding a future view = adding one module; zero changes to data or other views.

The key rule: **views own layout, never data.** When a view needs persistent spatial state (corkboard positions, roadmap placement), it writes into the item's namespaced `viewState` — the item is still the single source of truth, and the same item can simultaneously sit on a corkboard, in a kanban column, and in the graph.

This is also why several "different products" collapse into trivial variations: the Pinterest board, Finder columns, tree, and kanban are all the *same query* rendered four ways — `groupBy: none/tag/parent-link/status`.

### 4.2 Feasibility assessment of the ten requested views

| View | Verdict | Why |
|---|---|---|
| Expandable list/tree | **V1 — easy** | Plain grouped render; the default/fallback view. |
| Pinterest-style board | **V1 — easy** | CSS masonry grid over thumbnails. |
| Kanban by status | **V1 — easy** | `groupBy: status` + drag between columns = one field edit. |
| Finder-style columns | **V1 — easy** | Virtual folders: column 1 = tags/types, column 2 = matching items. Nothing is "in" anything. |
| Calendar / timeline feed | **V2 — moderate** | `filter: has date, groupBy: day`. Month grid is fiddly UI but well-trodden. |
| Heat/neglect view | **V2 — easy, high value** | The board view colored by `now − touched`. Nearly free; ships early because it serves the exact "forgotten long-term goals" problem. |
| Graph / web-map | **V2 (ego) / V3 (global)** | Real work; detailed design in §5. Ego-view first. |
| Corkboard canvas | **V3 — moderate** | Drag-anywhere + pan/zoom + per-board saved positions in `viewState`. Well-understood, just careful touch/Pencil work. |
| Roadmap / journey | **V3 — moderate** | Horizontal time axis for ONE goal-item; items linked to that goal placed along it (auto by date, nudgeable via `viewState`). Simpler than it sounds *because* links already exist. |
| Orbit view | **V4 — genuinely novel** | No library does this; it's a custom animation (goals as slow planets, linked short-horizon items as fast moons — radius/speed derived from type + dates). Build last, once the data model is proven and real data makes tuning honest. One flag: it's continuous motion, which is in tension with eye comfort — it should be slow, pausable, and excluded from being the default view. |

Recommended order matches the table: prove the model with the four cheap views, add the two date-driven views + ego graph, then the spatial views, then Orbit.

---

## 5. Graph / web-map view — design & scaling

**Model → graph mapping:** nodes = items (visual size by type, color by status/type from theme tokens); edges = explicit `links`. Two optional overlay edge sets, off by default: shared-tag affinity (faint edges between items sharing a tag — informative but O(n²)-ish and noisy at scale) and Gmail/Calendar reference edges.

**Two modes, as requested:**

- **Ego view (zoomed in):** pick any item → it centers, with 1–2 hops of linked neighbors around it. This is the daily-use graph: typically 10–60 nodes, always fast, always readable. Tapping a neighbor re-centers. Build this first — it delivers most of the "how does this connect" value at a fraction of the difficulty.
- **Global view (zoomed out):** everything at once. Made survivable at thousands of nodes by: rendering to **Canvas 2D, not SVG/DOM** (SVG dies around ~1–2k nodes; canvas is comfortable to ~5k); running the force simulation (`d3-force`) to settle then **freezing and caching positions** (in `viewState`) so revisits are instant and stable rather than re-simulating; **level-of-detail** labels (only when zoomed in / node hovered); and optional clustering (collapse by type or tag into super-nodes that expand on tap).

**Scaling honesty:** at your growth curve, canvas + d3-force is years of headroom. If the global view ever chokes (~5–10k nodes), the escalation is a WebGL renderer (e.g. sigma.js) behind the same view interface — a swap, not a redesign. The ego view never has a scaling problem at all, which is another reason it's the primary graph experience.

---

## 6. iCloud sync & conflict handling

### 6.1 The merge model

Every change is an operation line in the writing device's own log: `{ itemId, field, value, ts, device }`, where `ts` is a hybrid timestamp (wall clock + per-device counter, so ordering survives clock skew). Merging all logs is deterministic on every device:

- **Scalar fields** (title, body, status, type, dates): **last-writer-wins per field.** Editing the *title* on the iPad and the *status* on the iPhone while both are offline merges perfectly — different fields don't conflict at all. Only editing the *same field* on two devices produces a winner/loser, and the losing value still exists in the logs forever — the app surfaces recent same-field collisions in a small "merge notes" list so nothing is ever silently unrecoverable.
- **Sets** (tags, links, attachments): merged as **add/remove operations**, not overwrites. Adding tag A on one device and tag B on another while offline yields both. This is where naive whole-file sync tools destroy data; operation-based sets are why this design doesn't.
- **Binary assets:** immutable and content-addressed — new edit, new file, new hash. Two devices can never fight over an asset file. Conflicts are structurally impossible here.
- **iCloud "Conflicted Copy" files:** shouldn't occur (single writer per file), but if iCloud ever produces one for a log, append-only logs make recovery trivial — union the lines, dedupe by (device, counter). The app should do this automatically when it sees a `log-mac (Conflicted Copy).jsonl` pattern.

Worst realistic case is therefore: *you edited the same sentence of the same note on two offline devices; the later edit shows, the earlier is one tap away in merge notes.* That is the right trade for a single-user system — full CRDT text merging (Yjs/Automerge) would be significant complexity for a scenario that's rare when one person owns all the devices. Revisit only if merge notes show it actually happening.

### 6.2 Per-device reality

- **Mac (use Chrome or Edge, not Safari):** File System Access API grants the app persistent access to `Dash/`. It appends to `log-mac.jsonl` as you work, watches the other logs (poll every few seconds), ingests inbox drops, writes snapshots and thumbnails. **Fully automatic.** The Mac is the workhorse/"librarian" device.
- **iPhone / iPad (Safari, installed to Home Screen):** data lives in IndexedDB (fast, offline, fine for years of items). Sync is explicit: a **Sync button** exports this device's log via the share sheet into `Dash/data/` (two taps), and pulls updates by opening the other logs via the file picker (iOS remembers the folder; multi-select works). Cheap ergonomic win: the app badge/banner shows "unsynced changes" so it never silently drifts.
- **Upgrade paths if iOS manual sync grates** (in order of preference): (1) live with it — capture on phone is append-only and small, and most *organizing* happens on Mac/iPad anyway; (2) a Shortcuts automation that copies the exported log into place, shaving taps; (3) wrap the identical web app in a minimal native shell (Capacitor) that has real file access — one-time developer effort, zero change to data or app code; (4) reassess Safari's API support, which may eventually ship. The file format stays identical under all four, which is the point of choosing it.

This asymmetry (automatic on Mac, explicit on iOS) is the **single biggest compromise in the whole design**, imposed by Apple's browser limitations, and it's better to own it explicitly than to discover it in Phase 1.

---

## 7. Gmail & Google Calendar (live, per-device)

### 7.1 Access model

Pure browser-side OAuth via **Google Identity Services** — each device holds its own short-lived access token; no server, no stored passwords, read-only scopes (`gmail.readonly`, `calendar.readonly`). Tokens live in memory/localStorage per device; re-consent is a one-tap Google popup when a token expires (usually silent after the first time).

**One-time setup you'll do once (~20 minutes, walk-through-able):** create a free Google Cloud project → enable Gmail API + Calendar API → configure the OAuth consent screen with your own address as a **test user** → create an OAuth *Web application* client ID listing the app's GitHub Pages URL as an authorized origin → paste the client ID into the app's settings screen. Staying in "testing" mode is deliberate: Google's verification gauntlet for Gmail scopes applies only to published apps; a testing-mode app used by its own developer (you) skips all of it. Known annoyance to expect: Google periodically expires testing-mode grants (historically ~every 7 days), showing the consent popup again — one tap, but recurring. This is the worst UX wart of the whole integration and worth stating up front.

### 7.2 How mail/events join the item graph (reference items)

Exactly the lightweight-local-reference model you guessed at:

- A **Today panel** shows live calendar events and recent/starred mail alongside your items — fetched fresh, cached briefly, never stored wholesale.
- **Pinning** a message or event creates a normal Item with `source: { kind: "gmail", messageId, threadId }` (or `kind: "gcal", eventId, calendarId`) plus a snapshot of the lightweight envelope: subject/title, sender, date, snippet. That item is taggable, linkable, board-able, graph-able like anything else — it's ~300 bytes and syncs through the normal log.
- **Opening** a pinned reference refetches the full body/details live (with a deep link out to Gmail/Calendar proper). Offline or token-expired, you still see the envelope snapshot with a "full content unavailable" state — the reference degrades gracefully instead of breaking.
- Calendar events with dates naturally appear in the Calendar/timeline view merged with your own dated items — one view, two sources.

Emails/events are **read-only citizens**: the Dash links to them, never edits them. Composing/replying stays in Gmail. This keeps scopes minimal and the mental model clean.

---

## 8. Voice — capture, transcription, and the Action Button

Voice is treated as an input *layer*, not a feature: every text field in the app accepts dictation, every item accepts audio attachments, and there is a dedicated frictionless capture path. Honest technical assessment per tier:

**Tier 1 — Dictation everywhere (on-device, free, already on your devices).** On modern iPhones/iPads/Macs, Apple's built-in keyboard dictation (mic key) runs on-device and works in any focused text field of any web app. The app's job is simply to have big, immediately-focusable text fields with generous targets. This — not custom code — is the realistic backbone of "anywhere I can type, I can talk," and it's the *most* private and accurate option available. The browser's own speech API (`webkitSpeechRecognition`) is deliberately **not** the primary path: on Safari it routes audio to Apple servers and is flaky ([details](https://blog.addpipe.com/a-deep-dive-into-the-web-speech-api/)); keyboard dictation is strictly better on your hardware.

**Tier 2 — Recorded voice notes (the default capture format).** In-app record button (MediaRecorder API) → audio attachment on a new or existing item, auto-tagged **`unprocessed`**. The unprocessed queue is a first-class inbox view. This always works, on every device, offline, instantly.

**Tier 3 — Automatic transcription: on-device is realistic on the Mac, not on the iPhone.** Whisper compiled to WASM/WebGPU (via transformers.js or whisper.cpp-wasm) runs genuinely on-device in Chrome/Edge on an Apple-Silicon Mac — the `base`/`small` models transcribe a 1-minute memo in seconds and quality is good for notes. The same in browser on an iPhone is **not** honest to promise: slow, memory-constrained, battery-hostile ([landscape overview](https://offlinetts.com/blog/browser-speech-recognition-whisper-comparison/)). So the design is: **capture audio anywhere; a "Transcribe inbox" action on the Mac batch-processes everything unprocessed** — which matches your stated workflow ("transcribed or reviewed later when I'm at a screen anyway") exactly. Transcripts attach alongside the audio (audio is never deleted). If accuracy ever disappoints, swapping in an API transcriber later is a one-module change behind the same "transcribe" action.

**Action Button quick-capture (iPhone 15 Pro+):**

- **Recommended: Action Button → Voice Memo control.** Set in Settings → Action Button. Press-and-hold starts recording **without unlocking** — grab, press, talk, done ([Apple's docs](https://support.apple.com/en-il/guide/iphone/iphe89d61d66/ios), [overview of quick-record options](https://www.idownloadblog.com/2026/01/07/start-voice-recording-quickly-iphone/)). This is the only truly no-unlock path; that's a lock-screen security rule, not a design choice.
- **Bridge into the Dash:** a **"Sweep voice notes" Shortcut** copies recent Voice Memos into `Dash/inbox/` in iCloud Drive (Shortcuts has Voice Memos + file actions). Run it by tap, or attach it to an automation (e.g., when you open the app / charge the phone). The Mac (or any syncing device) ingests inbox audio as unprocessed voice items automatically.
- **Alternative if you want capture to land directly in the app:** Action Button → a custom Shortcut that records and saves straight to `Dash/inbox/` — but any Shortcut presenting a recording UI **requires unlocking first**. Truth table: *no unlock = Voice Memos + sweep; direct-to-inbox = one Face ID glance.* Both can coexist; start with the no-unlock path since frictionlessness was the stated priority.

---

## 9. Images & the sketch tool

**Ingest paths:** drag-drop / file picker / paste in-app on any device; share-sheet to the installed PWA where supported; and the `Dash/inbox/` folder — anything saved there (screenshots via a Shortcut, downloads, exports from other apps) becomes an unprocessed image item on next sync. Every ingested image is hashed, stored in `assets/`, thumbnailed, and given a skeleton item (`type: image`, tag `unprocessed`) ready to be tagged, linked, or left for later — "leave it unattached" is an explicitly supported end state, and the unprocessed inbox view is where such items wait.

**The markup tool is deliberately a napkin, not Procreate:** a single `<canvas>` overlay using Pointer Events (giving Apple Pencil pressure → line weight for free), with pen / highlighter / eraser, 3–4 theme-derived ink colors, undo, and a plain text-note field beside it. No layers, no brushes, no zoom-dependent tools. Saved as a transparent PNG overlay attachment (`role: "sketch-overlay"`) — the original image is never modified, overlays are independently removable/redoable, and the immutability rule from §2.1 holds. The identical component mounts on a blank canvas for sketch-first notes, satisfying "the same sketch tool everywhere" with one codebase.

---

## 10. Theming & accessibility architecture

**Design tokens as the hard wall between look and logic.** All visual values live in CSS custom properties, defined in exactly one place and consumed everywhere; components may *only* reference semantic tokens — never raw colors, sizes, or fonts:

```css
:root {
  --surface: …; --surface-raised: …;
  --text-primary: …; --text-muted: …;
  --accent-1: …; --accent-2: …;         /* also used by type/status colors */
  --font-body: …; --text-base: 1.125rem; /* 18px floor, see below */
  --space-1…--space-6: …; --radius: …; --shadow-1: …;
}
```

A **theme is a JSON document** in `Dash/themes/` mapping token names to values, loaded at runtime by writing the custom properties — switching or live-tweaking a theme touches zero component code. When you later write your own brand guide, restyling the entire app = editing one JSON file (or using a simple in-app theme editor, planned Phase 4, with sliders/pickers per token and a live preview). Item type/status colors reference token names (`"color": "accent-2"`), so even data-driven color re-themes cleanly. This is exactly the "slightly more structure up front" you asked to pay for.

**Accessibility as defaults, not a mode** — encoded *in the tokens and layout rules* so every future view inherits them:

- Base text 18px+ with a global text-size multiplier in settings (one token); WCAG-AA contrast enforced in the default themes; generous tap targets (44px+); density is a setting, "comfortable" is the default.
- Voice **in** everywhere (§8, Tier 1) and voice **out**: a "read to me" action on any item/list via the browser's built-in SpeechSynthesis — zero-cost, on-device, and directly serves "prefer being told over visually scanning." Daily-brief material (today's events, reminders, unprocessed queue) is readable aloud as a single action.
- `prefers-reduced-motion` respected globally; animated views (Orbit especially) get pause controls and are never the default view.

---

## 11. Phased build plan

Each phase is independently useful, ends with real daily use before the next begins, and never requires migrating the file format — the format (§3) is the contract; app layers get added around it. This is the "remodel as needs change" posture made concrete: what gets remodeled is views and features, never your data.

**Phase 0 — Foundations (one guided session, mostly one-time setup).**
Create `Dash/` in iCloud Drive; put the app on GitHub Pages (free; walk-through); Add to Home Screen on iPhone/iPad; Google Cloud project + OAuth client (§7 — can also be deferred to Phase 3); set Action Button → Voice Memo.

**Phase 1 — The working core.** Data model, per-device logs, snapshot, Mac folder access, iOS export/import sync, merge engine. Capture and edit items (dictation-friendly fields). Types/statuses/tags fully editable in-app. Views: **list/tree, Pinterest board, kanban, finder-columns** (cheap because they share one query layer). Search. Theme tokens in place from day one.
*Exit test: two weeks of real daily use across devices; sync trustworthy; capture <5 seconds.*

**Phase 2 — Visual inbox + voice + time.** Image ingest incl. `inbox/` watching, thumbnails, unprocessed queue. Sketch/markup tool (images + blank notes). In-app voice recording; Voice Memos sweep Shortcut; Whisper batch transcription on the Mac. Reminders (`remind` date + Today panel; in-app surfacing first — reliable scheduled push notifications from web apps on iOS are not dependable enough to promise, an honest limitation; an "export to Apple Reminders" action covers must-not-miss alarms). Views: **calendar/timeline, heat/neglect**. Read-aloud.

**Phase 3 — Connections come alive.** **Ego graph view**; Gmail/Calendar live panel + pinned reference items; link-creation UX everywhere (from an item, from the graph, from search).
*Exit test: the graph changes how you find things; pinned emails feel native.*

**Phase 4 — Spatial & novel views + polish.** Corkboard (per-board saved layouts), **roadmap/journey** (anchored on the freelance-transition goal as its first real use), global graph with clustering, **orbit view**, in-app theme editor, merge-notes UI. By now the data model has months of proof and thousands of real items to tune the novel views against — the reason they're last.

**Later / as-needed escalations** (all designed-for, none built now): WebGL graph renderer past ~5k nodes; Capacitor shell if iOS sync friction warrants; API transcription if Whisper quality disappoints; further integrations as new item `source` kinds + panels — the reference-item pattern from §7 generalizes.

---

## 12. Decisions log (why not the alternatives)

For the implementer and for future-you:

- **Why not a hosted backend/database (Supabase etc.)?** Explicitly out of scope by requirement, and rightly so for a non-developer's forever-system: nothing to pay for, patch, or lose to a shut-down service. iCloud + plain files is the sturdiest thing a non-developer can own for a decade.
- **Why not a native app?** Browser-based was specified; it also keeps one codebase for three screen sizes. The cost is iOS file access (§6) — accepted consciously, with the Capacitor escape hatch preserved.
- **Why not Obsidian/Notion/etc.?** Fair question to have asked; the answer is the requirement set — the sketch tool, orbit/heat/roadmap views, unprocessed voice pipeline, and full theming control are exactly the parts off-the-shelf tools won't do, and they're most of the point.
- **Why logs + LWW instead of CRDTs?** Single-user, few-devices reality: field-level LWW with op-based sets covers it with radically less machinery, and merge notes make the rare loss visible. CRDTs remain adoptable later inside the same log transport if multi-writer text editing ever matters.
- **Why one Item type instead of separate Idea/Project/Image models?** Every view, the graph, search, and sync each get written once instead of N times, and *your* taxonomy stays editable data instead of my hardcoded guess. The system's flexibility requirement falls out of this single decision.
- **Why GitHub Pages hosting for a "local" app?** Google OAuth needs a real origin; devices need one stable URL; iOS needs an installable PWA. Code is public-ish and generic; data never touches it. The alternative (fully offline file) fails requirements 4 and cross-device consistency.

**Biggest open risks, ranked:** (1) iOS manual sync friction — mitigations in §6.2; (2) Google testing-mode re-consent nags — §7.1; (3) Whisper accuracy on casual speech — audio always retained, transcriber swappable; (4) scope: ten views is a lot — the phase gates exist so at any stopping point you own a complete, useful system rather than a half of everything.

---

## 13. Implementation handoff notes (added July 16, 2026 — read before writing any code)

Andra has **confirmed** the three open decisions from the first draft: (a) GitHub Pages hosting of the code, (b) semi-manual sync on iPhone/iPad with automatic sync on the Mac, (c) the phase ordering in §11. These are settled — do not relitigate them. A separate `phase-0-setup-guide.md` walks her through the one-time setup; assume its checklist is complete when you start Phase 1.

This section exists because the implementer is a different model with no context beyond these documents, and the owner **cannot read or debug code**. That second fact is a hard engineering constraint, not background color.

### 13.1 The maintainer profile constrains the stack

Andra's only publishing tool is GitHub's web interface: **Add file → Upload files → Commit**. Her only debugging tool is describing (or screenshotting) what she sees to an AI. Therefore:

- **No build step. None.** No npm, no bundler, no TypeScript compilation, no framework CLI. The repository contains exactly the files the browser runs: `index.html`, plain **ES modules** (`js/*.js`), CSS, and vendored dependencies. If she can't deploy a change by dragging files into a web page, the stack is wrong.
- **Vanilla JavaScript + ES modules** is the recommended baseline. If a rendering library is genuinely warranted, a **CDN-free vendored copy** of something buildless (e.g., Preact + htm as single files in `vendor/`) is acceptable — but every dependency must be a file checked into the repo, never fetched from a CDN at runtime (offline use, and no silent upstream changes).
- Approved/expected vendored libraries: `d3-force` (graph physics only — render on canvas yourself, §5), a Whisper-WASM runtime (loaded lazily, Mac-only path, Phase 2), optionally MiniSearch. Resist adding others; every dependency is a future maintenance hazard she can't handle alone.
- **Code must fail loudly and legibly.** A visible in-app error banner with a plain-English message and a "copy details" button beats a silent console error she will never open. Wrap sync, file access, and Google calls accordingly.
- **She will paste future change requests to an AI with this repo.** Favor boring, explicit, well-commented code over clever abstractions; comments should explain *why*, referencing sections of this document (e.g., `// single-writer log: see proposal §3/§6`).

### 13.2 Non-negotiables (the contract)

1. **The file format in §3 is the stable contract.** Logs are append-only JSONL, one writer per file, ops shaped as in §6.1; assets are content-addressed and immutable; everything human-readable. App code may be rewritten wholesale in later phases; the format may only be *extended* (new op kinds, new optional fields), never broken. Include a `formatVersion` field in the snapshot and each log header line from day one.
2. **Types/statuses/tags/links are data, edited in-app** (§2.2). If any taxonomy value ends up hardcoded such that adding one requires a code change, the requirement is violated.
3. **One Item model, one query layer, views as registered modules** (§4.1). View-specific layout goes in namespaced `viewState`, never in duplicated items.
4. **Theme tokens only** (§10). No literal colors/sizes/fonts in components. This will be audited by attempting a full restyle via one JSON file.
5. **Accessibility defaults** (§10): 18px+ base text with a user multiplier, AA contrast, 44px+ targets, dictation-friendly focusable fields, read-aloud via SpeechSynthesis, `prefers-reduced-motion` respected.
6. **PWA + offline-first**: manifest + service worker caching the app shell, so the hosted app works with no network (data is local anyway). Installable to Home Screen on iOS. Without this, hosting would quietly break the local-first promise on a plane — treat it as Phase 1 scope.
7. **Google scopes stay read-only** (`gmail.readonly`, calendar read-only). The client ID is entered in an in-app settings field (stored as synced data), not hardcoded.
8. **Never delete user data.** Audio is kept after transcription; removed items are tombstoned in the log, not erased; asset garbage-collection, if ever built, is explicit and confirmable.

### 13.3 Environment facts the implementer must not "correct"

These were verified in July 2026 and shape the design; a fresh model's training data may disagree:

- Safari (macOS and iOS) does **not** support `showDirectoryPicker`/File System Access API local-disk pickers — hence Chrome/Edge on Mac for automatic folder sync, IndexedDB + explicit export/import on iOS (§6.2). Do not build an iOS path that assumes folder handles.
- `webkitSpeechRecognition` on Safari is server-backed and unreliable; the dictation story is the OS keyboard mic, which needs nothing from the app except good text fields (§8 Tier 1).
- In-browser Whisper is Mac-realistic, iPhone-unrealistic (§8 Tier 3). The transcribe action is desktop-gated with a friendly explanation, not "progressively enhanced" onto the phone.
- Google OAuth in Testing mode re-prompts roughly weekly (§7.1). Expected behavior — surface it kindly, don't engineer around it.
- Action Button → Voice Memo works from the lock screen; Shortcuts with recording UI require unlock (§8). The sweep-Shortcut bridge is part of Phase 2 scope and should ship with written setup instructions in the same hand-holding style as the Phase 0 guide.

### 13.4 Per-phase definition of done

Build **one phase at a time**; deliver each as a complete set of files Andra uploads to the repo, plus a short plain-English "what changed and how to try it" note. A phase is done when:

- **Phase 1:** she can capture, edit, tag, link, and re-type items on all three devices; add a new type and a new status entirely in-app; switch between list/tree, board, kanban, and columns views; sync Mac↔iPhone via the documented motions with no data loss in a deliberate two-device offline-edit test; and restyle the app by swapping the theme JSON. App works offline once loaded.
- **Phase 2:** image drop + inbox-folder ingestion + thumbnails; sketch overlay tool (Pencil pressure) on images and blank notes; in-app audio recording to `unprocessed`; sweep-Shortcut instructions delivered; Mac batch transcription; reminders surfaced in a Today panel; calendar and heat views live.
- **Phase 3:** ego graph usable as a daily navigation tool; Google connect flow using her saved Client ID; live Today panel mail/events; pin-to-item references that degrade gracefully offline.
- **Phase 4:** corkboard, roadmap (first anchored on her freelance-transition goal item), global graph with clustering, orbit view (slow, pausable, never default), in-app theme editor, merge-notes UI.

Every phase ends with the same regression test: the two-device offline-edit sync test, and a full theme swap. If either breaks, the phase isn't done.

### 13.5 Suggested repository layout

```
index.html          js/store.js        js/sync.js         js/query.js
manifest.json       js/views/*.js      js/google.js       js/sketch.js
sw.js               css/tokens.css     css/app.css        vendor/*
                    docs/  ← these two proposal/setup documents, kept in-repo
```

Keep these documents in the repository itself (`docs/`), so any future AI session has the full context by reading the repo — the same "self-contained handoff" principle this document was written under.

---

*End of proposal. Decisions (a)–(c) confirmed by Andra on July 16, 2026. Next action: complete `phase-0-setup-guide.md`, then hand this document to the implementing model with the instruction: "Build Phase 1 only, per §13."*
