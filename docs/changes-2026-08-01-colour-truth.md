# Change note — two colours that were frozen in the code

**Date:** August 1, 2026. **Cleanups #4 and #5 of the code-health review**
(`docs/review-2026-08-01-code-health.md`, §5.1 and §5.2). **Live at `dash-v29`.**

**Files changed:** `css/tokens.css`, `js/theme.js`, `js/ui/colorfield.js`,
`js/editor.js`, `css/app.css`, `sw.js`.
**Visible change:** one, deliberate — project chips in the item editor now wear
the project's own colour instead of always being green.

Two items in one note because they're the same idea in two places: **a colour that
was written into the code, when it should have come from the theme or from your
data.**

---

## #4 — "Reset to ember" was resetting to a colour Dash might not use

Settings lets you replace the accent with any colour, and offers a **Reset to
ember** button. That button asked the code "what is ember normally?" — and the code
answered with a hex typed into `theme.js`, under a comment describing a way of
working it out that was never actually written.

So the moment ember itself was ever re-valued — by editing `tokens.css`, or by
loading a theme JSON, which is the whole point of the theming system — Settings
would have offered to reset to a colour the app no longer used anywhere.

### Why the obvious fix was wrong

My own review said "just read `--ember` back with `tokenHex()`." Checking the code
first showed that would have been a bug: setting a custom accent writes `--ember` as
an **inline style on the page root**, which beats the stylesheet. So reading
`--ember` back hands you the custom accent you're trying to reset *away from*. The
original comment ("read it off a fresh element") was reaching for exactly this
problem.

### What actually changed

A new token, **`--ember-default`**, sits in `tokens.css` next to `--ember` and holds
the same value. The accent flow deliberately never writes it, so it always answers
"what is ember when nobody has picked anything?" — and because it's a token, it
flips with the theme, so resetting while in dark mode offers **dark's** ember rather
than the paper theme's.

`colorfield.js` had a third copy of the same hex as a default; it now asks
`theme.js` too.

**Keep `--ember` and `--ember-default` equal** if you ever re-value ember. There's a
comment in `tokens.css` saying so.

### Checked

Eight tests against the real `tokens.css` loaded into a real DOM:

- the default matches the stylesheet
- **with a custom accent active, the "default" still reports ember** — the case that
  would have broken under the naive fix
- reset really returns `--ember` to ember
- in dark mode the default offers dark's ember
- **re-theming ember moves the default with it** — the actual bug, which the old
  code failed

All eight pass.

---

## #5 — every project chip was green

In the item editor, the **Projects** field shows a chip per project the entry belongs
to. That chip's colour was written into the code as the green tint — so a plum
project, a blue project and a project with a custom colour you picked yourself all
appeared identically green. It was the one surface in Dash where a project didn't
carry its own colour.

It now uses `groundStyle()`, the same mechanism the project banner and the projects
list already use: the chip is filled with the project's colour, and Dash writes the
more readable of its two inks on top.

**A tint background could never have done this.** There is no tint variant of a
colour you picked yourself — asking for one hands back the colour itself, so the
label and the background would have come out the same colour and the chip would have
been unreadable. That's why the old code had to hardcode green.

One supporting CSS rule: a chip that *is* a colour block now takes its hairline from
its own ink rather than the paper border, which would otherwise have drawn a pale
outline around a saturated block.

**A project you haven't given a colour still inherits its type's green**, so
untouched projects look exactly as before.

### Checked

Eight tests:

- an uncoloured project is still green (nothing moves for existing data)
- a plum project chip is plum
- a **custom hex** is used verbatim, with legible ink chosen automatically
  (a very dark navy → 14.25:1, a very pale yellow flips to dark ink → 14.67:1)
- **all seven palette colours clear AA as a chip ground, in both themes** — worst
  case gray at 4.94:1 on paper, 5.62:1 on dark, against a 4.5 floor

---

## How to try it

1. Upload the **`js` folder**, the **`css` folder**, and **`sw.js`**.
2. **Hard-reload once** — Cmd+Shift+R.

Then:

- **Settings → Accent colour.** Pick something. The reset button should say "Reset to
  ember" and go back to the proper ember. Toggle dark mode and open Settings again —
  the default offered should be dark's warmer ember.
- **Open an entry that's in a project** (or add it to one). The project chip should
  now be in that project's colour, with readable lettering. Give a project an unusual
  colour on its own page, then look at the chip again.
- Everything else should be unchanged.

**The one thing worth your eye:** the project chip is now a filled block rather than
a pale tint, so the Projects field is a bit louder than it was. That's the intended
change, but if it reads as too much, say — the alternative is a quieter version
where only the ◆ and the text take the colour and the chip stays pale.

---

## Noted, not changed

- **`--tint-*` (seven tokens) and `tintToken()` are now completely unused.** This
  change removed their last consumer. That's cleanup #11 on the list, now
  straightforward: delete both, or keep them and write down what they're for.
- **`.on-ground` in `app.css` is no longer dead** — the project chip uses it, which is
  what it was written for. It should come **off** the "dead CSS" list in cleanup #10.
- The hex box's placeholder text still reads `#B23A14`. It's ghost text showing the
  *shape* of a hex code rather than a claim about a value, so I left it — but it is
  technically a fourth copy of that number.
- `views/shared.js` still imports `tintToken` without using it (part of cleanup #9).

---

## A note on versions

`sw.js` is now at **`dash-v29`**. If you haven't uploaded anything yet today, one
upload at v29 covers cleanups #1 through #5 together — the version number only has
to be higher than whatever your devices last saw.
