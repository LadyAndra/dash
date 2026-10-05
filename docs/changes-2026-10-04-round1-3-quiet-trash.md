# Round 1.3: no trash icon on every row (dash-v110)

## What changed
- The little scribble trash icon is gone from every row in the List view and every card in the Board view.
- To trash something there, right-click it. A small "Move to trash" slip appears where you clicked. Click it and the entry goes to the Trash, with the same "Moved to trash" message and Undo as before.
- Opening the slip and then pressing Escape, or clicking anywhere else, closes it and trashes nothing.
- It also works from the keyboard: Tab to a row or card, then press the Menu key (or Shift+F10).
- In Select mode, right-click does nothing special, because there a click means "pick this".

## How to try it
1. Open List view. No scribble icons on any row.
2. Right-click a row. Choose "Move to trash". Press Undo in the message.
3. Switch to Board and do the same on a card.

## Not changed
- Home still shows its trash buttons (Unfiled box and the due list). Tell me if you want those gone too.
- The desk page, the Trash drawer, Select mode's bulk "Move to trash" and the editor's own button.
- Nothing about your saved data.

## Files
`js/trash-actions.js`, `js/views/shared.js`, `js/views/list.js`, `js/views/board.js`, `css/trash.css` (comment only), `sw.js`, `docs/dash-current-state.md`, this note, and `tests/round1-1-trash-everywhere.test.mjs`.
