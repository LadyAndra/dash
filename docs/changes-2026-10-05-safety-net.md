# Round A: the safety net (dash-v112)

Four quiet fixes from the October 4 code-health audit. Nothing looks different in daily use. They stop rare problems that were real but would have been hard to ever trace.

## What changed
- **One bad line can't freeze syncing anymore.** Before, a single damaged line in a synced file made Dash stop at that line on every check, so nothing after it ever arrived, from any device. Now a bad line is skipped and the good ones around it still come through.
- **Synced edits can't rewrite an item's inner workings.** A synced change can no longer overwrite an item's id, its trash flag, or its internal bookkeeping, and a damaged list heals itself instead of crashing. Edits from newer versions of Dash still pass through untouched.
- **The offline copy only keeps good files.** If the server hiccuped (a 404 or 503) during an update, Dash used to save the error over its good offline copy. Now it only saves files that arrived properly.
- **Attachments can't run as a page.** Pictures (png, jpg, gif, webp, heic), PDFs and text files (txt, md) open in a new tab as before. Anything else, SVG pictures in particular, now downloads when you click it instead of opening inside Dash. The little thumbnail still shows.

## How to try it
There is nothing to upload. Claude pushed this straight to GitHub. Within a few minutes the live Dash is at version `dash-v112`. Reload once or twice if it still shows the old one.

1. Open any entry and attach a PDF or a normal picture. Click it. It opens in a new tab like before.
2. If you have an SVG picture, attach it and click it. It downloads instead of opening. (If you don't have one, skip this.)
3. Everything else should look and behave exactly as before.

## Not changed
- Your data, the sync format, and every screen.
- The file picker still allows any picture type, so an SVG can still be attached.
- Parked features (Kanban, Columns, phone capture, the retired Calendar shelf) are untouched.
- A workflow permission tidy-up (see the audit, Round A item) goes in a separate small commit.

## Files
`js/store.js`, `js/sync.js`, `js/blobs.js`, `js/editor.js`, `sw.js`, `docs/dash-current-state.md`, `docs/README.md`, this note, and three new tests: `tests/sync-resilience.test.mjs`, `tests/sw-cache.test.mjs`, `tests/attachment-safety.test.mjs`.
