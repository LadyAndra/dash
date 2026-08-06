# mockups/

**Only one file in here is live: `home-panels-preview.html`.**

It links the *real* `../css/tokens.css` and `../css/app.css` with stand-in content,
and has buttons for Home / One project / List (band + rail) / Colour pickers, a
mount-theme toggle, and live colour pickers running a copy of the real contrast
maths.

Because there is no way to run Dash locally in this setup, **this is how a layout
gets looked at before it's uploaded** — a deploy-to-check loop is slow and risks a
broken live app. It is part of the working method, not a leftover.

**Keep it current when the CSS changes.** A stale preview is worse than none.

Two things it *can't* show:

- **Touch sizing.** A Mac reports a trackpad, so the preview always renders the 28px
  (`--control-min`) controls. 44px behaviour has to be checked on the phone after
  uploading.
- **Real data.** Everything in it is stand-in content.

## `archive/`

Superseded explorations, kept because they're cheap to keep and occasionally worth
looking back at. **None of them are maintained, and none should be trusted as a
picture of how Dash currently looks.**

| File | What it was |
|---|---|
| `home-hierarchy-explorations.html` | The three Home layout concepts. **Concept B is what Home actually became** in August 2026, so this is the record of what was chosen and what was rejected. The most worth keeping. |
| `home-preview.html` | The Home sheet before it became a panel board. |
| `restyle-preview.html` | An early pass at the specimen-archive restyle. |
| `specimen-archive-mockup.html` | The original specimen-archive visual proposal, July 2026. |

## Not deployed

Nothing in `mockups/` is in the service worker's `SHELL` and nothing here is uploaded
to GitHub Pages — deployment is the `js`, `css` and `docs` folders plus `sw.js`
(see `docs/deploy-runbook.md`). These files exist for looking at locally.
