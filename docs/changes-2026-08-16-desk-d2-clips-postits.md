# Dash — the Desk, Phase D2: clips and post-its

**Date:** August 16, 2026
**What this is:** Phase D2 of `dash-desk-addendum.md`. Ready to upload.

---

## What to upload

Drag these to GitHub as **folders**, the way you always do:

- `js` — one new file (`js/icons.js`) plus edits to `desk.js`, `store.js`, `views/desk.js` and `merge-notes.js`
- `css` — `app.css` has a new section at the bottom
- `docs` — this note, the updated current-state doc and the updated addendum
- `tests` — two new files. Not deployed, not served; they're there so the next session can run the checks.
- `sw.js` — **upload this one separately, on its own.** It's a loose file at the repo root.

`sw.js` is bumped to **`dash-v41`** and `js/icons.js` is in `SHELL`. If you forget it, your devices keep serving the old code and none of this appears.

**No data format change this time.** `formatVersion` stays 3, so there's no "update everything before you edit anything" step — an older device just won't show clips until you refresh it, and nothing is lost either way.

---

## What it is

Two new things on the desk.

### Clips — a stack you move as one

Press the **paperclip** in the banner. The desk goes into picking mode and a line appears telling you what to do. Click the cards you want held together — they get an outline — then press the paperclip again. Two or more become a clip; one or none just cancels and writes nothing. Escape cancels too.

Once they're clipped:

- They draw as a **tight stack**, each still at its own slight angle, with the paperclip sitting on the corner of the top card.
- **Drag anywhere on it** — a card or the clip itself — and the whole thing moves together.
- **Tap it** and the whole stack comes to the top, the way tapping one card does.
- **Double-click the paperclip** and the clip opens: the cards lay out flat in a small grid so you can read them. Double-click it again to close. While it's open you can double-click any single card to expand it as usual.
- **To take one card out**, open the clip and drag that card off somewhere else on the desk. It leaves the clip and stays where you dropped it.
- **To undo the whole thing**, right-click the paperclip and choose **Unclip**. Everybody stays exactly where they are; they're just loose again.

A card can only be in one clip. If you try to pick a card that's already clipped, it tells you.

### Post-its — a note to yourself

**Double-click an empty bit of desk** and you get a small square of paper in your project's colour with a cursor already in it. Type a sentence or two.

- It saves when you press **Enter** or click away — never while you're typing. **Shift+Enter** gives you a new line instead.
- **Drag it by the strip along its top** onto a clip and it attaches — it then sits with the clip and travels with it whenever you move the stack. Drag it back onto open desk and it's free again, wherever you dropped it.
- **To get rid of one**, delete its text and click away, or right-click it and choose *Throw this away*.

Post-its are desk furniture: project-local, no status, no tags, invisible everywhere else in Dash. If one starts wanting a date or a tag, that's Dash telling you it should be a real entry.

---

## What I'd check first

1. **Clip two cards, then drag the stack across the desk.** Everything should move together and stay in the same arrangement relative to each other.
2. **Open the clip, drag one card out, close what's left.** The card you pulled out should be where you dropped it; the rest shouldn't have shifted at all.
3. **Right-click the paperclip and Unclip.** Nothing should jump.
4. **Make a post-it, type into it, and while you're mid-word let a sync land** (edit something on the phone). Your words should still be there.
5. **Attach a post-it to a clip, then drag the clip.** The note should travel with it.
6. **Switch to dark mode with a post-it on screen**, and try it on a very pale project colour and a very dark one. The writing should stay easy to read in all four combinations.
7. **Arrange and clip on the Mac with wifi off, clip something different on the phone, then let both sync.** Both clips should be there, holding what you gave them.

The phone is unchanged — no desk, no clips, no post-its, same Peek page as before.

---

## Things for you to decide (nothing is blocking)

These are all one-line changes, and they're grouped at the top of the files on purpose so you can react to seeing them rather than imagining them.

- **How tight the stack sits.** Right now each sheet peeks out about 7px right and 6px down. Looser reads more like a pile; tighter reads more like a bound sheaf.
- **How much the paperclip leans.** Currently up to about 7°, against the cards' 2.3°. If it looks like it was printed on rather than put on, it needs more; if it looks careless, less.
- **How big the paperclip is** (52px) and **where it sits on the corner**.
- **The open grid** — three across at the moment.
- **The post-it's size** (220px wide) and **how much of your project's colour is in its paper** (18%). The tint is safe to raise a long way before the writing gets hard to read — up to about 30% still passes — so this one is genuinely a taste question.

One thing worth knowing rather than tuning: **the paperclip draws in your project's own colour.** On a very pale project it will be a very pale clip. I left it that way deliberately, because the alternative is a clip that isn't quite your project's colour, which felt like the worse lie — but if a pale project bothers you, say so and it's a one-line change.

---

## What's underneath

Clips and post-its live on the **project**, in a new `deskObjects` field carried by a new `"dk"` op. Which cards are in a clip does **not** live there — it's one more field on each card's existing desk record, the same one D1 built for position. That split is what makes "a card is in at most one clip" true by the shape of the data rather than by a rule something could forget.

**A clip stores no position and no member list.** Where it sits is worked out from its members every time the desk draws, which is why dragging one is just an ordinary card move run in a loop, and why unclipping doesn't need to move anybody — they're already where you last put them.

`"dk"` is the **third** thing to use the same merge engine milestones and desk positions already share. It's the same code, addressed one level deeper. `formatVersion` stays 3, exactly as the architecture pass said it would.

### The tests found one real bug

**Double-clicking the paperclip to open a clip silently did nothing.** When a drag starts, the browser is told to send the rest of that gesture to the desk surface — which means that when you let go, the "what did you let go on?" question comes back with *the desk*, not *the paperclip*. So the check for "was that on the clip?" always said no.

It's the same shape as a bug D1 hit with the ✧ button: a question asked at the wrong moment, answered honestly, wrong. The answer is now recorded the instant you press down, while it's still true. Worth remembering as a rule, and it's written into both docs.

And one caught before it could happen: **pushing a clip into the edge of the desk would have fanned it out.** Cards stop at the boundary individually, so the one nearest the edge would have halted while the rest kept going — and the arrangement a clip exists to hold would have been destroyed by a corner, permanently. The whole clip is now held to whatever the tightest member allows, so it hits the edge as one object.

**166 new checks**, on top of the 121 that were already there. Run them with `node tests/desk-d2.test.mjs` and `node tests/desk-d2.render.test.mjs` from the repo folder; the first needs nothing installed, the second needs `npm install jsdom`.

The post-it's paper colour isn't a judgement call — one of those tests mixes your project's colour into the paper for **every possible colour there is**, in both light and dark, and measures the result with Dash's own contrast maths. It fails if the number in the CSS and the number in the JavaScript ever drift apart, too.

---

## Deliberately not in this round

- **Wonder symbols** (D3) and **highlights** (D4). The `"dk"` op already carries symbols as one more collection — a device running D3 could write them today and this build would carry them safely without showing them.
- **Clips on the phone.** There's no desk there.
- **Naming a clip.** Clips are wordless by design, and by data shape — there is nowhere to put a word. The "why these belong together" goes on a post-it, which is what post-its are for.
- **Remembering which clip was open.** Fanning a clip out to read it is furniture, not arrangement, so it isn't synced and doesn't survive a reload — the same treatment an expanded card gets.

Use it for a bit before D3.
