# Change note — merge-note typing cleanup

Date: 2026-08-17

## What was happening

The ordinary item editor wrote `title` and `body` to Store on every `input` event. Because Dash keeps an append-only operation log, typing a title such as `Bowerhaus / Substack` could create a separate operation for nearly every intermediate draft.

That history is safe, but it became noisy when an older device's edit later lost a last-writer-wins comparison: Merge notes could show `B`, `Bo`, `Bow` and so on as separate conflicts even though they were one human editing session.

This affected the shared item editor, so it was not specific to projects. Tasks, notes and other entries used the same per-keystroke path for Title and Notes.

## What changed

### `js/editor.js`

Title and Notes now keep the live draft in the form while typing.

- A quiet period of 900 ms writes the current draft to Store.
- More typing resets that timer instead of adding another operation.
- Leaving the field flushes immediately.
- Closing the editor flushes both fields immediately.
- Read aloud flushes first so it reads the current draft.
- Deleting an item cancels pending text drafts instead of writing a scalar edit after the tombstone.

Type, status, dates, colour, tags, links, project assignment, attachments and other controls keep their existing write behavior.

### `js/merge-notes.js`

Existing historical collision records are not deleted or rewritten. The Merge notes UI now groups only records that can be proven to belong to the same conflict episode:

- same item/sub-record and field
- same losing device
- same winning device
- exact same winning timestamp

Within that group, Dash shows the latest losing draft. A later genuine conflict has a different winning timestamp and remains a separate card.

Dismissing or restoring the visible grouped card also resolves the hidden per-keystroke records in that same episode, so they do not appear one by one afterward.

### `sw.js`

Cache version bumped from `dash-v67` to `dash-v68` so installed PWAs pick up the changed editor and merge-notes code cleanly.

### `tests/merge-note-cleanup.test.mjs`

Adds regression coverage for:

- one Title operation per typing burst
- immediate save on blur
- immediate save on Done/close
- the same behavior for project titles
- coalescing old keystroke collision records
- keeping a later real conflict separate
- dismissing/restoring a grouped episode without exposing the hidden drafts afterward

## Data safety

No data format changed. No migration is required. Old operation logs remain untouched and continue to preserve every historical value. This change only reduces new typing noise and presents old typing noise as one meaningful merge decision.

## Files to upload

- `js/editor.js`
- `js/merge-notes.js`
- `tests/merge-note-cleanup.test.mjs`
- `docs/changes-2026-08-17-merge-note-cleanup.md`
- `sw.js`

Suggested commit message:

`Coalesce text autosaves and merge-note typing history`

## Quick live check

After the green checks finish:

1. Open any ordinary entry and change its title by several characters, then click Done immediately. Reopen it and confirm the final title is there.
2. Edit a project title the same way and confirm it also saves normally.
3. Open Merge notes. The old `Bowerhaus / Substack` per-keystroke pile should now appear as one card for that conflict episode rather than a stack of partial titles.
4. On that card, use **That's fine** if the kept value is the one you want. The hidden partial-title records should not appear afterward.
