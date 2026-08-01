# Colour pickers — projects and the accent

**Date:** 1 August 2026
**Cache version:** `dash-v22` → `dash-v23`
**New file:** `js/ui/colorfield.js` (already added to `sw.js`'s `SHELL`)

**Files to upload — nine:**

- `css/tokens.css`
- `css/app.css`
- `js/store.js`
- `js/theme.js`
- `js/settings.js`
- `js/editor.js`
- `js/ui/colorfield.js` ← **new file**
- `js/views/shared.js`
- `js/views/project.js`
- `js/views/home.js`
- `sw.js`

(That's eleven — sorry. All of them, and this supersedes the two earlier
handoffs, so uploading this set makes you current on everything.)

---

## What you got

**A real colour picker, in the Edit popup.** Open a project → Edit → there's a
Colour field right under the name. The swatch opens the **system** colour
picker — full spectrum, sliders, eyedropper, your saved colours — because
that's what `<input type="color">` does on macOS and iOS. There's a hex box
next to it for typing or pasting an exact value, and a "Use type colour"
button to go back to inheriting.

I didn't build a custom gradient canvas. It'd be several hundred lines, worse
with a finger, worse with a screen reader, and land somewhere less capable
than the picker your OS already ships.

**The swatch panel is gone from the project page**, as you asked. Colour is a
property of the project, so it lives where the name lives.

**An accent picker in Settings**, under Appearance. Same control. It replaces
ember everywhere the accent appears — about twenty places. There's a "Reset to
ember" button whenever you've changed it.

---

## The contrast readout — what you chose and what it does

You picked *exact always, warn me*. So:

**Your colour is used verbatim.** Dash never quietly darkens or mutes a pick.

**Both pickers show two live readings** as you scrub:

| | |
|---|---|
| **As small text** | your colour written on the paper ground — 11px labels, dates, the overdue heading. This is the one that bites. |
| **As a block** | Dash's ink written on your colour — the overdue band, a project banner. |

Anything under 4.5:1 turns ember and you get a plain-English line: *"Below the
AA readability floor — small labels in this colour will be hard to read. It's
still yours to use."* Then it's your call.

**One thing Dash does decide on its own,** and I want to be explicit because
it's the edge of what you asked for: it picks *which of its two inks* to write
**on** your colour. Choose bright yellow and the writing on top flips to
near-black instead of cream. That doesn't change your colour — the block is
exactly the yellow you chose — it only changes what's written over it. Without
it, a light pick would produce a block with invisible text and no way to fix
it. If you'd rather it never flipped, say so and I'll pin it.

Real numbers from the maths, so you know it's working:

```
#B23A14  (ember)   text  5.09:1  AA     block  4.90:1  AA    ink cream
#E8C547  (yellow)  text  1.43:1  LOW    block 10.87:1  AA    ink near-black
#101A2E  (navy)    text 14.76:1  AA     block 14.23:1  AA    ink cream
```

---

## Try it before you upload

**Open `mockups/home-panels-preview.html` → "Colour pickers" button.**

Both pickers are live in there, running a straight copy of the real maths. Pick
something terrible and watch what happens. The project banner underneath the
first picker updates as you drag; the accent picker restyles the overdue block,
the alert tile, the tab badge and the danger button underneath it, all at once.

Worth trying: something pale (see the text warning fire), something very dark
(see the ink stay cream), and hitting the mount/cream toggle with a custom
accent set.

---

## Under the hood, briefly

- **Colours can now be a hex or a palette name.** `colorToken()` handles both,
  so your types and statuses keep re-theming as names while a project can hold
  an exact value. Nothing existing had to change.
- **One new token, `--ember-ink`** — the ink that goes *on* an accent-coloured
  block. Needed because a custom accent might want near-black on it while the
  accent itself stays your colour. Three rules moved onto it: the overdue band,
  the tab badge, and the late flag on a project banner.
- **`--ground-ink`** does the same job for project colours, set inline by the
  block itself. That's what lets an arbitrary hex — one no stylesheet could
  have anticipated — still be legible.
- **The accent saves into the theme object you already had.** `theme.js` had a
  `dash.theme` localStorage key and a `loadSavedTheme()` on boot; the accent
  writes three tokens into it. No new storage, no new startup path — and it
  means your accent is already halfway to the full theme editor whenever you
  want that.
- **`js/views/home.js` and `js/views/shared.js` still must go up together**
  (panels live in shared now). With eleven files, easiest to just upload the
  lot.

**What to check once it's live:**

- Project → Edit → pick a colour → Done. The banner should be that colour
  immediately, and still be after a reload.
- Same on your phone — confirm the colour syncs across.
- Settings → Accent colour → pick something. Overdue rows, the Home tab badge
  and Delete buttons should all shift together.
- Reset to ember, and confirm it goes back.
- Toggle the mount theme with a custom accent set — the accent should stay
  yours, and the ink on it should still read.

## Still on the list

1. **The projects list** — colour blocks per row now that projects have real
   colours, plus progress and next date.
2. **Rolling ground + scale into List / Board / Kanban / Finder.**
