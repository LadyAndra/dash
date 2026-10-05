# Round 1.4: one way to trash, everywhere (dash-v111)

## What changed
- No trash icon is drawn on any item anywhere now. Home's rows lost theirs, joining List and Board.
- To trash something, right-click it. The scribble icon appears where you clicked. Click the scribble and the item goes to the Trash, with the same "Moved to trash" message and Undo.
- This works on List, Board, Home (the Unfiled box and the due list), the desk's drawers, desk cards (they used to show the words "Move to trash", now they show the scribble), and the Calendar's month list.
- Calendar dots that are 8 or more days out keep their full project color. They no longer fade to pale.

## How to try it
1. Open Home. No scribbles on any row. Right-click one. Click the scribble that appears. Press Undo.
2. Do the same in List, Board, and on a card on a project's desk.
3. Open the Calendar. Look at the dots far to the right. They should be solid color.
4. Right-click a row in the Calendar's month list (an entry or a marked date). The scribble appears there too.

## Not covered on purpose
- Milestone rows. A milestone is not an item, and it has its own "Removed milestones" list in the project.
- The small dots on the Calendar's timeline. They are too small to right-click reliably. Use the month list below it.
- Select mode's "Move to trash" button and the editor's "Move to trash" button. Those are labeled buttons, not repeated icons, so I left them.

## If you want the fade back
Two numbers in `css/tokens.css` and two in `js/views/calendar.js`. Tell me and I will do it.

## Files
`js/trash-actions.js`, `js/views/shared.js`, `js/views/home.js`, `js/views/desk.js`, `js/views/calendar.js`, `css/trash.css`, `css/tokens.css`, `css/calendar.css`, `sw.js`, `docs/dash-current-state.md`, this note, and four test files.
