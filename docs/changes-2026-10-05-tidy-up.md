# Round B: the tidy-up (dash-v113 and dash-v114)

Housekeeping from the October 4 code-health audit. Nothing looks or behaves differently in daily use.

## What changed
- **Old leftovers are gone.**
  - A stale "upload everything" note from Round 1.
  - A temporary debugging tool for a focus bug that was fixed back in August.
- **One place for each shared helper.**
  - The date helpers were written out twice, word for word. They now live in one small file, `js/dates.js`.
  - The "is this a phone?" check was written out three times. It now lives in one place, `js/device.js`.
  - That way a future fix lands everywhere at once.
- **The scribble trash icon file moved** from the top level of the project into the `assets` folder, where it belongs. The Trash buttons still draw it the same way.
- **Clearer wording.**
  - A note in the Dropbox code described pasting a token by hand. It now describes the Connect to Dropbox button you actually use.
  - If Dropbox ever asks you to sign in again, the message now says so plainly: Settings, then Connect to Dropbox.
- **Your email address is out of three documents** in the public project. It is still in Dash's older saved history. Removing it from there would mean rewriting the whole history, which I don't recommend.
- **Notes now say the `mockups` folder isn't in the project.** It only ever lived on your computer.

## How to try it
There is nothing to upload. Claude pushed this straight to GitHub. The live Dash will be on version `dash-v114` within a few minutes.

1. Reload Dash once or twice.
2. Right-click an entry and click the little scribble to trash it. It should look exactly as before.
3. Open the Calendar and change a date with the flip numbers. Same as before.

## Not changed
- Your data, syncing, and every screen.
- The `test` folder (the two manual editor preview pages). It is documented and still useful.
- Parked features (Kanban, Columns, phone capture, the retired Calendar shelf).

## Files
`js/dates.js` (new), `js/device.js`, `js/app.js`, `js/mobile-chrome.js`, `js/ui-cleanup.js`, `js/views/calendar.js`, `js/widgets/flipdate.js`, `js/dropbox.js`, `js/sync.js`, `js/focus-debug.js` (deleted), `assets/Delete_Scribble.svg` (moved), `css/trash.css`, `css/ui-cleanup.css`, `sw.js`, `START-HERE.md`, `docs/dash-current-state.md`, three older docs (email removed), `READ-ME-FIRST.txt` (deleted), this note, and tests: `tests/shared-helpers.test.mjs` (new), `tests/calendar.test.mjs`, `tests/round1-desktop-only.test.mjs`, `tests/desk-images.test.mjs`, `tests/release-safety.test.mjs`.
