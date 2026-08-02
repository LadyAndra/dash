# Change note — the last literal colours, and two tunable widths

**Date:** August 1, 2026. **Cleanups #6 and #7 of the code-health review**
(`docs/review-2026-08-01-code-health.md`, §5.3 and §5.4). **Live at `dash-v29`.**

**Files changed:** `css/app.css`, `css/tokens.css`. No JS at all.
**Visible change:** the dark theme gets its paper grain back. Everything else should
look identical — this is worth a look in the preview before uploading.

---

## #6 — six colours that weren't tokens

`app.css` opens by saying *"if you find a raw color/size/font below, it's a bug."*
There were six raw colours. They're gone.

| What | Was | Now |
|---|---|---|
| the page's dot grain | a fixed warm brown | `--text-primary`, so it inverts |
| the dim behind dialogs | fixed near-black | `--mount` |
| the ink-swatch hairline | fixed pure black | `--mount` |
| the sketch paper's inset shading | fixed near-black ×2 | `--mount` |
| the mount's dot texture | fixed cream | `--ink-on-mount` |

All via `color-mix()` over a token, which is already the sanctioned pattern in this
codebase for "a fainter version of the current ink" — it's what the project banner's
hairlines and the overdue band already use.

### The one that actually changes something

**The page's dot grain now inverts.** It was a warm brown at 5%, which on the cream
paper is the intended "felt not seen" texture — and on the **dark theme was
effectively invisible**, because a mid-brown speck on near-black is nothing. Drawn
from `--text-primary` it becomes dark specks on cream and pale specks on the mount,
which is what the material was always supposed to do.

**The opacities were recalculated, not copied.** Near-black at 5% is about 1.6×
stronger against cream than the brown it replaces, so a straight swap would have
visibly darkened the paper. They're now 3% and 2%, which should land the paper theme
within a hair of where it was.

### Why shadows deliberately kept a *dark* token

The scrim and the sketch paper's shading use `--mount` rather than an ink token on
purpose. A shadow should stay dark in both themes; pointing it at ink would invert it
and produce a pale glow where a shadow belongs. The grain is the opposite case — it's
a material, so it should invert. Same technique, opposite token, for a reason.

## #7 — two widths that couldn't be tuned from tokens.css

- **`--index-rail-w` (248px)** — the tag/type/status rail on List and Board. Home's
  rail has been a token (`--rail-w`) since the spacing pass; this one was a literal
  buried in `app.css`, so one rail was tunable from the tokens file and the other
  wasn't. They're deliberately two different numbers, because the two rails hold
  different things.
- **`--board-col-w` (260px)** — how wide a column of cards is on the Board. That's the
  Board's density knob, and it's now next to the other density knobs.

### Where my review was wrong, and I didn't do what it said

The review claimed the literal `44px` values in `app.css` should point at
`--tap-min`. Reading them properly: they're the width of the **"№ 0001" text column**
in the neglect register, which is 44px by coincidence, not because anything is
tapped there. Pointing them at `--tap-min` would tie a number column to the
accessibility floor, so raising the touch minimum would widen a column of digits for
no reason. **Left alone deliberately.**

Also worth knowing: the `820px` phone breakpoint appears five times and **cannot**
become a token — CSS doesn't allow `var()` inside a media query. That one has to stay
repeated.

## How it was checked

I can't render CSS here, so the check was structural rather than visual:

- **Every `var(--x)` in `app.css` resolves** to something defined in `tokens.css` or
  set at runtime — all 58 of them. This is the failure that matters with this kind of
  edit: a typo'd token name doesn't error, it just renders as nothing, so an element
  silently goes transparent.
- Every `var(--x)` written from JS resolves too.
- No literal `rgba()` remains in `app.css`.

**This one wants your eyes before it goes up.** Open
`mockups/home-panels-preview.html` — it links the real `tokens.css` and `app.css`, so
it shows these changes directly. Check the paper doesn't look darker or flatter than
you remember, then flip the mount/dark toggle and check the grain is visible but
still subtle.

---

## How to try it

1. Upload the **`css` folder**. (Plus `js` and `sw.js` if #1–#5 aren't up yet — all
   of it is covered by `dash-v29`.)
2. **Hard-reload once** — Cmd+Shift+R.

- **Light theme:** should look unchanged. The paper grain is the thing to check.
- **Dark theme:** the background should now have the same faint speckled material the
  paper has, instead of being flat.
- Open a dialog (the scrim behind it), and open an entry with a sketch (the paper's
  inset shading) — both unchanged.

---

## Found while checking — an AA failure I did NOT fix

Auditing which colour tokens get a dark-theme override turned up a real one, and it's
worth deciding on rather than me quietly changing it.

**`--ember-soft` has no dark-theme value.** It's used in exactly one place:
`.btn-danger:hover` — the background of the **Delete** button when you hover it. The
text on it is `--ember`.

| Theme | Contrast | AA floor |
|---|---|---|
| paper | **4.12:1** | 4.5 |
| dark | **1.91:1** | 4.5 |

So Delete's lettering is slightly under the floor on the paper theme, and **nearly
invisible on the dark theme** while your pointer is on it. Since `--ember` is also
user-settable now, a custom accent moves this around too.

It's one line to add a dark override, but the honest fix is probably to stop using a
fixed pale tint here at all and derive the hover from the accent the same way the
project banner derives its controls — which is a slightly bigger decision about how
the danger button should look. Your call; say the word and it's quick either way.

**Also found:** `--accent-1`, `--accent-3` and `--accent-4` are used **nowhere** —
zero references in any file. They're labelled "kept for compatibility; demoted" in
`tokens.css`. Worth folding into cleanup #11 alongside the `--tint-*` family.
