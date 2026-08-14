# Dash — the Desk, Phase D0: a mockup to react to

**Date:** August 10, 2026
**What this is:** Phase D0 of `dash-desk-addendum.md` — the mockup pass. One new file, `mockups/desk-preview.html`. **No app code changed, nothing to deploy, no cache bump.** This exists so you can look at the desk and pick numbers before any of it gets built.

---

## How to open it

Open the `mockups` folder on your Mac and double-click **`desk-preview.html`**. It opens in your browser straight off your disk. Nothing needs uploading and nothing about live Dash changes.

It links the real `tokens.css` and `app.css`, so the type, the colours, the banner and the buttons are the actual ones — only the content is made up.

**Do not upload this file's folder to GitHub as part of a deploy.** Mockups aren't in the service worker and never should be, same as `home-panels-preview.html`.

---

## What you're looking at

A project page as the desk (which is the plan: the desk *replaces* the page body — the banner is untouched).

- **The banner** at the top — exactly as built today, plus one new button: **Peek ▾**.
- **The Peek drawer** — click Peek and it slides out from directly under the banner, on its own quieter surface. Three shelves inside it: **Unplaced**, **Filed**, **Milestones**. Escape closes it.
- **The desk** — ten stand-in cards. Three loose ones down the left, a pile of four in the middle, and a clip of three down the right with a post-it explaining why they're clipped. There's also a free-floating post-it, a **?** pinned to a card, and a **!** sitting on its own.

**Things worth actually doing rather than just looking at:**

- **Drag a card.** It moves. Drag one of the three clipped cards and all three move together.
- **Drag a row out of the Unplaced shelf** onto the desk. It becomes a card. That's the whole placement gesture.
- **Click a card** — it comes to the top of whatever it was under.
- **Double-click a card** — that's one candidate for "open the entry". The other candidate is the little ⤢ in the corner; the panel switches between them.
- **Toggle mount / cream** in the grey bar. Everything should stay readable in both.
- Drag the post-its and the free **!** around too — they're independent of everything.

The overdue card in the pile wears the ember bar, exactly the way an overdue list row does. That's the only ember on the desk, on purpose.

---

## The panel on the right is the point

Every slider changes the desk live. The box at the bottom writes down whatever you've currently got set, and **Copy** puts it on the clipboard so you can paste it straight back into chat. That's all I need from this round — the pasted box plus whatever you want to say about it.

There's also a **Reset positions** button if you shove everything into a corner and want the original layout back.

---

## The five things I need you to decide

These are the ones that block Phase D1. Everything else can move later; these get baked into constants.

**1. Rotation range — how crooked?**
The slider goes from 0° (everything perfectly straight) to 4° (visibly askew). The starting guess is ±1.6°. Somewhere around 1–2° tends to read as "a person put this here" rather than "something is broken", but that's exactly the kind of thing you should trust your eye on, not my prose.

**2. Card anatomy — what a card's face shows.** Three options in the panel:

- **A — title only.** Quietest. You'd open a card to find anything out.
- **B — number, type, title, status.** The starting guess. Reads like a small list row.
- **C — B plus two lines of the body.** Most informative, biggest cards, fewest fit on the desk.

**3. Open gesture — what actually opens an entry.** Tapping always raises the card; that's settled. But opening is either **double-click**, a small **⤢ button** in the corner, or **both**. Double-click is invisible until you know it exists; the button is always there taking up a corner. Both is an option and costs nothing.

**4. Pile weight — yes or no.** Three options:

- **None** — a pile is nothing but cards near each other.
- **Edges** — a crowded card gets one to three hairline "sheets" behind it, so a dense spot looks thicker.
- **Shade** — the desk itself darkens slightly under a cluster.

None is the honest default (piles genuinely aren't a thing in the data). Edges and Shade are both purely visual. Worth seeing whether either helps or just adds noise.

**5. Drawer feel.** Two questions: does the drawer **push** the desk down or **slide over** it, and how fast (0–420ms; the guess is 180ms). Push means nothing is ever hidden; overlay means the desk doesn't jump around while you're looking at it.

## Three smaller ones, if you have an opinion

- **Looseness** — how spread out the whole arrangement is. Mostly this just shows you how the desk feels crowded vs. airy.
- **Card width** — 170–340px. The starting guess is 260px.
- **Desk ground** — the faint dot grid (the same motif the colour banner already uses) or plain. And the **settle**: the tiny tilt-and-right a card does when you drop it. Set it to 0 if you'd rather cards just land.

If you don't have a feeling about these, say so and I'll pick sensible values.

---

## What this mockup deliberately can't tell you

- **Touch.** Your Mac reports a trackpad, so this always draws the 28px controls. The 44px behaviour only shows up on the phone — and the phone never gets a desk anyway, so this matters only for the Peek shelves.
- **Real data.** Ten cards is a tidy desk. Forty entries in one project will feel different, and that's a D1 conversation once you're using it.
- **Anything about merging.** Nothing here syncs, saves, or remembers — reload and it's back to the start. That's all D1.

---

## Notes for whoever builds D1

- Everything tunable sits in one clearly-marked **CANDIDATE** block at the top of the file's `<style>`. Those values graduate to real constants (or tokens) in D1 and the block dies with the mockup.
- The mockup's script deliberately rehearses the shapes D1 has to keep, and the comments name the addendum sections: derived rotation from a hash of entry id + project id (§12.1), z = max + 1 on touch (§8.27), clip geometry derived from members at render time (§12.2), one position write per member on a clip drag (§8.23), commit on drop and never per frame (§8.34), clamping at the desk's edges (§5.1).
- Two small app.css facts surfaced: the project banner's `margin-bottom` has to go to zero on the desk page so the drawer sits edge to edge under it (§5.8), and the desk's dot ground reuses the banner's existing 19px radial-gradient rule rather than inventing a second texture.
- Nothing was added to `sw.js`'s `SHELL` and `CACHE_VERSION` stays at `dash-v30` — mockups are not deployed.
- `dash-current-state.md` is **not** updated by this round; there's no app behaviour to describe yet. D1 updates it.

---

## In one line

Open `mockups/desk-preview.html`, push the sliders around until the desk looks right to you, hit **Copy**, and paste the box back to me — that unblocks Phase D1.
