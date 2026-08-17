# Clarify `test/` versus `tests/` — 16 Aug 2026

## The problem

Dash had two similarly named root folders:

- `test/`
- `tests/`

They were doing different jobs, but nothing at the folder boundary made that
obvious.

`tests/` is the real automated test/support area. GitHub's Check Dash workflow
runs its `*.test.mjs` files.

`test/` is only two static pages used to preview the item editor's New and Edit
states in isolation.

The confusing part was that `test/` also carried full copies of:

- `css/tokens.css`
- `css/app.css`
- `js/editor-details.js`

At the time of this cleanup those copies were byte-identical to the live root
files, but keeping a second copy means a future app change could update one and
silently leave the other stale.

## What changed

The folder names stay in place so this cleanup does not require a risky or
awkward directory rename through GitHub's web uploader.

Instead:

1. `test/README.md` now labels the singular folder as manual editor previews,
   explicitly not CI.
2. `tests/README.md` labels the plural folder as the authoritative automated
   test/support area.
3. The three copied files in `test/css/` and `test/js/` are replaced with tiny
   bridge files that import the real root assets.
4. `START-HERE.md` records the distinction and tells future AIs never to copy
   live app source into `test/` again.

This removes the second source of truth without making publishing harder.

## No live app or data change

The live app does not load `test/` or `tests/`.

This change does not alter:

- app JavaScript or CSS;
- saved data;
- Dropbox sync;
- the service worker;
- `CACHE_VERSION`; or
- the Check Dash workflow.

The ordinary automated test suite should remain green.
