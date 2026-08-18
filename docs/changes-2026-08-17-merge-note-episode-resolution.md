# Change note — merge-note episode resolution

Date: 2026-08-17

## What was happening

The earlier merge-note cleanup correctly grouped old per-keystroke collision records that had already arrived and dismissed every hidden record in the visible group.

There was still one narrow gap: if another raw collision record from that same old editing episode arrived later, it had a different raw collision key. Store therefore treated it as a newly seen record, even though the person had already pressed **That's fine** (or restored the replaced value) for that conflict episode.

That explains why the problem was intermittent: only merge notes with another sibling record arriving later could reappear.

## What changed

### `js/merge-notes.js`

Dash now remembers finalized **conflict episodes** as per-device UI state in addition to Store's existing exact-record tombstones.

An episode is identified by the same conservative facts already used to group old typing history:

- same item/sub-record and field
- same losing device
- same winning device
- exact same winning timestamp

When **That's fine**, **Put the replaced one back**, or **Clear the list** finalizes a visible episode, Dash records that episode locally.

If another old raw collision record from that exact episode arrives later, it stays hidden and does not revive the merge-note badge/card.

A genuinely later conflict has a different winning timestamp and still appears normally.

### `tests/merge-note-cleanup.test.mjs`

Adds regression coverage for the missing case:

1. finalize a grouped merge-note episode;
2. simulate another raw draft from that same historical episode arriving later;
3. confirm the badge remains zero and the card stays gone;
4. confirm a genuinely later conflict still appears;
5. confirm restore also finalizes the whole episode.

### `sw.js`

Cache version bumped from `dash-v69` to `dash-v70` so installed PWAs pick up the changed merge-note code cleanly.

## Data safety

No synced data format changed.

No operation log, snapshot, item, project, milestone, desk object, or attachment data is rewritten.

The new episode record is per-device `localStorage` UI state only, beside the existing merge-note inbox/tombstones. The append-only source data remains untouched.

## Files to upload

- `js/merge-notes.js`
- `tests/merge-note-cleanup.test.mjs`
- `docs/changes-2026-08-17-merge-note-episode-resolution.md`
- `sw.js`

Suggested commit message:

`Keep finalized merge-note episodes dismissed`

## Quick live check

After the green checks finish:

1. Open **Merge notes**.
2. On any old note you are sure is already settled, press **That's fine**.
3. Close Merge notes and use Dash normally through at least one sync cycle.
4. Reopen Merge notes. That same settled conflict should stay gone.
5. A genuinely new conflict should still be allowed to appear normally.
