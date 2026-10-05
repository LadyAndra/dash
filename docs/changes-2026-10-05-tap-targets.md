# Round C-1: tap targets (dash-v115)

Every button, menu and slider a finger can hit is now at least 44px. With a mouse the floor is 28px, as before. Nothing else about how Dash works changed.

## How I checked
I opened the live Dash in a test browser pretending to be an iPad (both ways up), a phone and a desktop, and measured the real tappable area of every control on every screen. That found 32 controls too small on iPad portrait. Now it is down to the ones listed under "Left alone" below.

## What changed
- **The little messages** (Dismiss, Copy details) are now full-size buttons. They were 13px tall.
- **The small x on tags, project chips and link chips** (12 by 19px) now has a full-size button around it. Chips on touch screens are a bit taller as a result, so two chips on neighbouring lines can never overlap and remove the wrong one.
- **Attachment Remove** was a tiny dot on top of the picture. It is now a labelled strip under each picture. A stray tap on the picture opens the file and can never delete it.
- **Editor:** Done, Read aloud, Type, Status, Assign to project, and the Add tag box.
- **List and Board:** the List and Board tabs, Group by and Sort by (24px tall before), and the Select button on phones.
- **Calendar:** the previous and next month arrows were a few pixels narrow.
- **Date fields:** the clear button.
- **Settings:** the Text size slider (16px tall).
- **Sidebar index rows** (34px, seen on iPad landscape and wider).

All of these use the existing size settings (`--control-min` and `--tap-min`), never a typed-in number.

## A new safety check
`tests/tap-targets.test.mjs` fails if any of these controls goes back to a typed-in small size, and sweeps every stylesheet for any new button or menu set under 44px. I tested it by deliberately making a button small; it caught it.

## How to try it
There is nothing to upload. Claude pushed this straight to GitHub. The live Dash will be on `dash-v115` within a few minutes.

1. Reload Dash once or twice.
2. On an iPad, open an entry. Tags, Done, the selects and the Remove strip under an attachment should all be easy to hit.
3. On the Calendar, tap the month arrows.

## Left alone, on purpose
- **The dots on the Calendar's timeline** (12 to 26px). They are a picture of dates close together, so making each one 44px would pile them on top of each other. Month mode lists every date as a full-size row, and that is the easy path for a finger. Your call if you want something different.
- **The corner handle that resizes a picture on the Desk.** Mouse only (the Desk never appears on touch), and it already has a larger invisible hit area.

## Found along the way (not fixed, not a tap problem)
On an iPad held upright, the project page is about 48px wider than the screen, so its left and right edges are cut off. It looks like the Desk's edge-to-edge trick overshoots the narrower page padding used on small screens. Worth its own small fix.

## Files
`css/app.css`, `css/ui-cleanup.css`, `css/calendar.css`, `css/dateinput.css`, `js/editor.js`, `sw.js`, `tests/tap-targets.test.mjs` (new), `docs/dash-current-state.md`, this note.
