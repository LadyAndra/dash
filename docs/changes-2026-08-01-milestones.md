# Dash — project milestones, the stage chip, and merge notes

**Date:** August 1, 2026
**What this is:** Phase M1 of `dash-milestones-calendar-addendum.md`. Projects can now carry their own list of dated phases, and every project shows which phase it's currently in. The Today panel and the Calendar view are **not** in this round — they're M2 and M3, and nothing here needs redoing for them.

---

## What to upload

Drag these to GitHub, as **folders** (not loose files), the way you always do:

- `js` — two new files at the top level, one new file in `js/views/`, plus edits to `store.js`, `sync.js`, `app.js`, `views/shared.js` and `views/project.js`
- `css` — `app.css` has a new section at the bottom
- `docs` — this note plus the updated current-state doc
- `sw.js` — **upload this one separately, on its own.** It's a loose file at the repo root.

`sw.js` is bumped to `dash-v18`. If you forget it, your devices keep serving the old code and none of this appears.

**New files:**

```
js/milestones.js               the milestone rules — ordering, dates, stage
js/merge-notes.js              the "your edit was overwritten" window
js/views/milestone-editor.js   the milestone list on a project's page
```

### One thing to do differently this time

**Update every device before you edit anything on any of them.** This round changes the data format (in an additive, nothing-breaks way), and a device still running the old code will refuse to load a data file written by the new code until it updates. It's not damage — the old device just sits there saying it can't load — but it's an easy hour of confusion to avoid. Upload, then open Dash on the Mac and hard-reload (**Cmd+Shift+R**), then open it on the iPhone and pull down to refresh, and only then start adding milestones. Going forward this is a non-issue: I've changed the loader so future format bumps show a plain-English notice instead of stopping.

---

## What it is

Open the **Project** tab, pick a project, and there's now a **Milestones** section right under the title.

You add phases in whatever words you like — "Research", "Idea", "Execution", "Final", or "wait for Dad to send the photos". There's no fixed list to pick from and no vocabulary to maintain; two projects can both have a "Research" phase with no connection between them.

Each milestone has:

- **a name** — type it, press Enter or tap away, done
- **a due date** — optional. A phase with no date yet is a completely normal thing to have, not a mistake
- **a reminder date** — also optional, and separate from the due date, so "nudge me a week before" works
- **a tick box** — mark it done, or un-mark it if you tick the wrong one
- **arrows and a drag handle** — to put the phases in the order they actually happen

**Dates are days, not moments.** "Due the 15th" means the 15th, everywhere, on every device, regardless of timezone or daylight saving. This is deliberately different from the due date on ordinary entries (which is a full timestamp), and it's why a milestone can never quietly show up as the 14th on one device and the 16th on another.

### Nothing is ever really deleted

The ✕ removes a milestone from the list, but the record stays. A **"Removed milestones"** button appears below the list with a **Put it back** on each one. If you removed something and someone else edited it on another device before the removal reached them, putting it back brings their edit with it.

### Order and dates are two different things

The order you drag things into is **the sequence the project moves through**. The dates are **when things are due**. They're allowed to disagree — you might date "Final" first and fill in the earlier phases later, or push one phase's date past a later one's without meaning to change the pipeline. When they disagree, the order wins for "what phase are we in", and dates will win on the Calendar when that lands. Each view uses the thing it's actually about.

---

## Attaching entries to a phase

Each milestone row has a line underneath it saying **"No entries yet"** or **"3 entries"**. Tap it and the list opens under that milestone, with two buttons:

- **＋ Add entry** — pick something. Entries already in this project are listed first; anything else in Dash is underneath, and picking one of those adds it to the project as well
- **＋ New entry in this phase** — creates it, attaches it, and opens it, in one go

The ✕ next to an attached entry takes it **off the phase but leaves it in the project** — those are two different things, and collapsing them would quietly lose a project assignment.

The project's existing by-type list below is untouched and still shows everything, so nothing you already rely on has moved.

**An entry can sit on more than one phase.** That isn't a loose end — it's forced by how Dash merges. If you put an entry on "Research" on the Mac and on "Execution" on the phone while both are offline, both survive, and there's no way to enforce "only one" without inventing a conflict where the model says there isn't one. Better to allow it out in the open than to have it surprise you later.

**Under the hood it's the same mechanism that puts an entry in a project** — a link. That's why this was a small change rather than a big one: no new kind of record, no new merge rules, no format bump. There's a test that literally asserts no new op kinds were introduced.

Remove a phase and its entries keep their attachment quietly in the background; put the phase back and they come back with it.

## The stage chip

Every project now shows a small chip saying which phase it's in — **the earliest phase that isn't ticked off**. You'll see it:

- next to the project title on its own page
- on every project row in the projects list
- on project cards and rows in the List and Board views

It says **Complete** when everything's ticked, and it shows nothing at all for a project with no milestones yet.

**It goes ember (that rusty orange) when the current phase's date has passed.** That's the only new use of ember anywhere in this round — your tokens file reserves it as an indicator, never decoration, and "a date you set has gone by" is exactly an indicator.

Two behaviours that look odd but are right:

- **A phase with no date can be the current stage.** "We're in the Execution phase, no deadline set yet" is a true and useful thing for a project to say.
- **Ticking a later phase doesn't advance the stage** while an earlier one is still open. The pipeline is telling you the earlier phase hasn't actually finished.

The stage is worked out fresh every time the screen draws, from what's in front of you. It isn't stored anywhere, so it can't go stale and it can't conflict between devices.

---

## Merge notes (new, and worth knowing about)

The addendum said a collision should "show up in the existing merge notes" — but there wasn't one. `store.collisions()` was a stub that always came back empty, and the real merge-notes screen was parked in Phase 4. Without it, there was no way to actually *see* the two-device test working, so I built the small version now.

**What it does:** if you edit the same thing on two devices while they're apart, Dash keeps the later edit — that hasn't changed and isn't negotiable. What's new is that the earlier one is written down instead of quietly disappearing. A **⚠ Merge notes** button appears in the top bar *only when there's something in it*, and opening it shows what got replaced, by which device, with a **Put the replaced one back** button.

This covers ordinary fields too, not just milestones — a title edited on both devices now leaves a note the same way.

**One honest limitation.** The note lands on the device that receives the *older* edit, which in a two-device collision is one of the two, not both. That's a real limit of how Dash decides who wins (a single clock reading can tell you which edit is later, but not whether the two people knew about each other), and working around it would mean rebuilding the merge model. The value that lost is preserved in full either way, and both are in your data files forever. Phase 4 can build a richer screen on top of exactly this plumbing.

---

## What I found while building it

**A real ordering bug, fixed.** Dash reads each device's log file separately, so an *edit* can arrive before the *creation* of the thing it edits. When that happened, the store made a blank placeholder to hold the edit — and then threw the real creation away, because it saw the item "already existed". The entry kept the blank's empty title and default type permanently. It needed to be fixed for milestones to survive out-of-order arrival, and the fix helps everything: a creation arriving late now fills in only the blanks nobody else has claimed. This has probably never bitten you (it needs a specific arrival order), but it was a genuine way to lose a title.

**The version guard was too strict.** Opening data written by a newer build used to stop with an error. The addendum requires that brief version differences between devices must not crash anything, so that's now a plain-English notice instead, and the app carries on. Nothing can be lost by being behind: the log files are the source of truth, they only ever get appended to, and anything a device doesn't recognise is skipped and left alone until it updates. **This fix only helps from now on** — a device still running the *old* code will still stop, which is why the "update everything first" note is above.

**Typing a milestone name writes nothing until you're done.** Names commit when you press Enter or tap away, not on every letter. Two reasons: it keeps the log from filling up with one entry per keystroke, and — the one that actually matters — a background sync landing mid-word can't yank the box out from under you. What you've typed is held onto and put back if the screen redraws, cursor position included. Same rule as the Home capture box.

---

## What is deliberately *not* here

- **The Today panel** (overdue + the next 14 days, reminders, read-aloud) — that's M2
- **The Calendar view** (month grid, agenda, the unscheduled tray) — that's M3
- **A count badge on the top bar for overdue things** — that belongs with the Today panel it links to
- **Anything reaching the pet.** Overdue-ness never touches it. Neglect ("you haven't looked at this") and overdue ("a date you set went by") mean different things, and mixing them would make the pet's expressions less readable — which the pet build already established is the thing worth protecting. Ticking off a milestone *does* give the pet the same little celebration finishing anything does, because that's something you actually did.

---

## How to try it

1. Upload everything, hard-reload every device (**Cmd+Shift+R** on the Mac; on the iPhone, close Dash fully and reopen). Give GitHub a few minutes — its own cache can serve you the old files for up to ten, which has made three correct fixes look broken before.
2. Project tab → pick a project → **Milestones**. Type "Research", press Enter. Add "Execution" and "Final".
3. Give "Research" a date in the past. The row goes ember and says **Overdue**, and so does the chip by the project's title.
4. Tick "Research" off. The chip moves to "Execution" immediately, and the ember goes away.
5. Drag "Final" to the top, or use the ↑ arrows. Watch the chip change to "Final".
6. Tap **"No entries yet"** under a milestone. Use **＋ Add entry** to attach a couple of things, then **✕** to take one back off — it stays in the project, just not on that phase.
7. Remove a milestone with the ✕, then open **Removed milestones** and put it back.
8. Switch to the **List** or **Board** view — every project carries its stage chip there too.
9. **The two-device test.** Turn off wifi on both. On the Mac, date one milestone and tick another. On the iPhone, rename a *different* milestone of the same project and add a new one. Turn wifi back on, tap Sync on both. Everything should be there, on both, with no merge notes at all — different milestones can't collide.
10. **Then force a collision.** Offline again, change the *same* milestone's date on both devices to different dates. Back online: the later edit wins on both, and one of the two devices grows a **⚠ Merge notes** button holding the one that lost.
11. **Theme swap.** Drop a different theme JSON in `Dash/themes/default.json` (or hit dark mode). The milestone rows, the chip and the merge-notes window should all follow it — there is not a single hardcoded colour, size or font in any of the new code.

---

## Testing done before delivery

Same posture as the pet: the failure mode here is silent (a merge that drops an edit doesn't throw an error, it just quietly has less in it), so "it seemed to work" isn't evidence.

- **181 merge and date assertions.** Hand-written two-device log fixtures — edits to different milestones, a same-field collision, remove-versus-edit, ops arriving before the thing they refer to, two devices inserting into the same gap — each replayed in **every possible order** and checked for an identical end state every time. Plus the real thing: two live copies of Dash making genuine offline edits and swapping log lines.
- **92 render assertions** driving the actual milestone editor against a real DOM: adding, reordering (and checking a move really is *one* change to *one* milestone), ticking, removing, restoring, overdue flagging, attaching and detaching entries, a 40-milestone list, and a scan asserting no hardcoded colours or sizes. One of them counts archive scans and fails if a 12-milestone project walks the archive more than once.
- **Date logic across both 2026 daylight-saving switches**, month ends, a year end and a leap day — proving the date-only strings make all of it a non-event rather than assuming it.
- A load check on every module and a `sw.js` audit confirming nothing on disk is missing from the cache list.

Two real bugs came out of it: the out-of-order creation bug described above, and a case where a milestone's position could be recorded inconsistently across devices depending on which log arrived first.
