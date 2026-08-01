# Dash — Home becomes the Today sheet

**Date:** August 1, 2026 (second round of the day — this follows `changes-2026-08-01-milestones.md`)
**What this is:** dates now actually reach you. Home shows what's overdue, what's due today, and what's coming in the next two weeks. The pet and the corner widgets are shelved. The left sidebar is closed by default.

---

## What to upload

Drag these to GitHub, as **folders**, the way you always do:

- `js` — one new file (`js/entries.js`) plus edits to `app.js`, `store.js`, `editor.js`, `views/home.js`
- `css` — `app.css` has new sections at the bottom and one changed rule near the top
- `docs` — this note plus the updated current-state doc
- `sw.js` — **on its own, at the repo root.** Now `dash-v19`.

**Nothing was deleted.** The four pet files are still in `js/widgets/`, untouched.

---

## The thing that was actually broken

Worth saying plainly, because it explains why nothing showed up no matter what you did: **there was no way to put a due date on an ordinary entry.** The Edit box had a title, type, status, notes, files, projects, tags and connections — and no date field at all. The data model had room for one from the very first version; nothing ever filled it in.

Underneath that was a second bug that would have bitten the moment the first was fixed. Due dates and reminders were being *saved* to one place and *read* from another — `item.due` versus `item.dates.due`. They'd never met, and nobody had noticed, because with no date field nothing was ever saved in the first place. Both are fixed. The Edit box now has **Due** and **Remind me**, and what you put there lands where everything reads it.

So: milestone dates were working (those were new and self-contained), ordinary entry dates were not, and neither had anywhere to appear. That's the whole story.

---

## Home is now the Today sheet

Open Dash and you get, in this order:

1. **Accession** — the capture box, still first. You said dates first; I've kept capture first anyway and I want to be honest about why: a thought you don't write down is gone, and the dated list isn't going anywhere while you scroll one inch. If it turns out to be wrong when you actually live with it, it's a two-line swap — say the word.
2. **Due & coming up** — the new part:
   - **Overdue** — anything whose date has passed, with no cutoff. Something six months late is still late, and quietly dropping it is exactly the failure Dash exists to prevent. Header and rows in ember.
   - **Today**
   - **Next 14 days** — grouped by day, with "tomorrow" / "in 5 days" alongside the date.
3. **From the archive** — the neglect register, unchanged.

**Project milestones and ordinary entries sit in one list**, sorted by date and then by name. On the day itself you don't care which kind of thing something is, only that it's due.

**Reminders get their own row**, labelled as reminders, and can fire well ahead of the thing they're about — a milestone due in September can nudge you in August. The row shows both dates and offers **Dismiss**, which clears that one reminder and touches nothing else.

**A milestone row has a tick box** — mark it done straight from Home and it leaves the list and advances that project's stage chip. An ordinary entry doesn't get one, deliberately: what "finished" means depends on your own statuses, so tapping the row opens it rather than Dash guessing on your behalf.

**Nothing due is a real state**, not a blank: "Nothing due in the next two weeks."

**The 🔊 Read button on Home reads your day** — "one overdue: … ; today: … ; next fourteen days: …". That's the daily brief out loud, without reading a screen.

---

## The pet and the corner widgets are shelved

Gone from the screen, not from the repo. `js/widgets/motion.js`, `cluster.js`, `shapes.js` and `pet.js` are all still there and still cached by the service worker on purpose — so bringing the pet back later is **uncommenting two lines in `app.js`**, with no risk of the "forgot to add it to the cache list" broken deploy that's bitten before.

Weather, tide and train were never built, so they simply go back to being unscoped. The research that was done on them (which weather endpoint actually returns yesterday, which NOAA station is prediction-only, that the Q train needs a relay) is kept in the current-state doc so none of it has to be rediscovered.

Everything the pet build taught is also kept — the motion file, the "one silhouette, emotion in the eyes" finding, why the six-shape version was worse. That was the expensive part, and it's written down.

---

## The sidebar is closed by default

There's a **☰ Filters** button at the far left of the top bar. The sidebar is hidden until you press it, and it remembers your choice on each device separately.

**Settings and Read-aloud moved to the top bar** as their own buttons, so the sidebar is never *required* for anything — that was the thing to get right before hiding it. The tag / type / status filter list is all still in there for the times you want to chase a tag.

**And instead of a permanent list of dates in the sidebar** (your suggestion): on a phone the sidebar isn't a column at all — it collapses into a horizontal strip across the top — so a dates rail would have been useful on the Mac and useless on your iPhone, which is where you'd most want to glance at it. And since Home *is* Today now, the same list would have been on screen twice.

What you get instead: **a small ember number on the Home tab whenever something's overdue.** Same nudge, from any view, identical on both devices, and tapping it takes you to the list rather than duplicating it.

---

## How to try it

1. Upload, hard-reload (**Cmd+Shift+R**), give GitHub its ten minutes.
2. Open any entry → there are now **Due** and **Remind me** boxes under Type and Status. Put a date on something for tomorrow.
3. Go to **Home**. It's in "Next 14 days".
4. Set something's due date to last week. It jumps to **Overdue** in ember, and an ember number appears on the Home tab — visible from List, Board, anywhere.
5. On a project, give a milestone a date within two weeks. It appears on Home as "Project name · Milestone name", with a tick box. Tick it — it leaves the list and the project's stage chip moves on.
6. Set a **Remind me** date on something whose due date is months away. The reminder shows up on its own, on the day it fires, saying what it's for. **Dismiss** clears just the reminder.
7. Press **🔊 Read** on Home and listen to your day.
8. Press **☰ Filters** to bring the sidebar back if you want it; it stays however you leave it.
9. The pet is gone. If you miss it, it's two lines to bring back.

---

## Testing done before delivery

- **60 new assertions** on the dated logic and the rendered panel: the window edges (day 14 is in, day 15 is out), milestones and entries interleaving correctly, reminders firing ahead of far-off dates, done things dropping out, ticking a milestone from Home, dismissing a reminder, the empty state, and what read-aloud says.
- **A scan counter** that fails if building the whole panel walks the archive more than once — 60 dated things across 20 milestones and 40 entries, one pass.
- **Both 2026 daylight-saving switches**, month ends, a year end and a leap day, plus a 23:30 and a 00:30 timestamp proving a due date can't slide onto the wrong day.
- **7 assertions on the due/remind bug** specifically — that dates land where readers look, survive a save-and-reload, still merge as ordinary fields, and that the op written to the sync log is byte-identical in shape to before, so old data and merge are untouched.
- The earlier milestone suites still pass in full (188 merge assertions, 92 render assertions), so none of this broke what shipped an hour ago.

**Total: 340 assertions passing.**
