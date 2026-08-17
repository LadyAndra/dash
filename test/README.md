# test/ — manual editor previews

**This is not the automated test suite.** It contains two small browser pages
used to look at the item editor in isolation:

- `new.html` — the compact “New item” state.
- `edit.html` — the expanded “Edit item” state.

GitHub's **Check Dash** workflow does not run anything in this folder. Automated
checks live in the plural `tests/` folder and are the files ending in
`.test.mjs`.

## One source of truth

The preview pages need Dash's real styles and the `editor-details.js` helper.
Older versions of this folder carried full copies of those files, which made
`test/` look like a second app tree and created a future drift risk.

The files under `test/css/` and `test/js/` are now deliberately tiny bridges:

- `test/css/tokens.css` imports `css/tokens.css`
- `test/css/app.css` imports `css/app.css`
- `test/js/editor-details.js` imports `js/editor-details.js`

Do **not** copy live app source into this folder again. If the real editor
changes, the previews should inherit that change from the authoritative root
files automatically.

## Why keep the singular folder?

Renaming or deleting a whole directory through Dash's normal GitHub-web upload
routine adds more maintenance work than it removes. The safer cleanup is to make
the boundary explicit and remove the duplicated source inside it.

If these two preview pages stop being useful someday, remove the folder in a
dedicated cleanup rather than turning it into a second test system.
