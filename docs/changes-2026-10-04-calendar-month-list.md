# Calendar clean-up: month list, project colours and lanes (dash-v109)

## What changed
- The three round widgets at the bottom of the Calendar (month dial, fog window, year radar) are off the screen. A month list took their place.
- The list shows everything dated in the month, in order, with the day, a project-coloured dot, the name, the project, and how far off it is. It opens at today's line.
- Studio (and any project's) date marks and notes now sit in that project's own row on the timeline, in its colour, instead of under Items.
- Finished dots keep a soft ring in their project's colour.

## Files
`js/views/calendar.js`, `css/calendar.css`, `sw.js`, `docs/dash-current-state.md`, this note, and two test files (`tests/calendar.test.mjs`, `tests/calendar.render.test.mjs`).

## Not changed
Dots far in the future are still pale on purpose. Overdue dots are still red. `js/entries.js` and the saved data are untouched.
