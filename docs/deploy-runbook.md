# Deploying Dash — the runbook

For uploading changes to `LadyAndra.github.io/dash/` through GitHub's website. Same steps every time.

---

## The one rule that breaks everything

**Drag FOLDERS, not loose files.**

If you drag `pet.js` on its own, GitHub drops it in the repo root as `/pet.js` instead of `/js/widgets/pet.js`. The app then can't find it and breaks. Dragging the `js` folder keeps every path correct automatically.

The single exception is `sw.js`, which genuinely lives in the root — that one gets dragged on its own.

---

## Steps

1. Go to **github.com/LadyAndra/dash**

2. Click **Add file** → **Upload files** (top right, next to the green Code button)

3. From your Dash folder, drag these in — **all four at once is fine**:
   - the `js` folder
   - the `css` folder
   - the `docs` folder
   - `sw.js` (the loose file)

4. Wait for the file list to finish appearing. A big upload takes a few seconds.

5. In the **Commit changes** box, type a short note to your future self — "corner cluster: the pet" or similar.

6. Click **Commit changes**.

7. Wait about a minute. GitHub Pages rebuilds the site on its own; there's nothing to click.

---

## Then check it worked

**On the Mac:** open Dash and hard-refresh — **Cmd + Shift + R**. The app is set to reload itself once when new code arrives, so you may see it flash and reload. That's correct.

**On the iPhone:** swipe the Dash app fully closed (swipe up and flick it away), then reopen it. A plain close isn't enough — iOS keeps it suspended and you'll keep seeing the old version.

---

## If nothing changed after uploading

Almost always one of two things:

**You forgot `sw.js`.** It's the loose file at the root and it's easy to miss when everything else is a folder. Without it, `CACHE_VERSION` never changes and your devices keep happily serving the code they already had. Re-upload just that file.

**The phone is still holding the old app.** Swipe it fully closed and reopen. If it's stubborn, delete the icon from the Home Screen and re-add it from Safari — your data is safe, it lives in the app's storage and in Dropbox, not in the icon.

---

## If the app comes up blank or broken

This is nearly always a file that landed in the wrong place. Browse the repo on github.com and check the file tree looks like this:

```
dash/
  index.html
  sw.js
  manifest.json
  css/
  js/
    widgets/
  docs/
```

If you see a stray `.js` file sitting in the root next to `index.html`, that's the problem — delete it (click it, then the bin icon), and re-upload by dragging the folder instead.

To get back to working immediately while sorting it out: on the repo's main page, click the commit count (top right of the file list, says something like "47 commits"), find the last commit that worked, and you can restore from there. Nothing is ever lost.

---

## Uploading the same folder twice is safe

GitHub replaces files that have the same path and adds ones that are new. It never deletes anything you didn't touch. So if you're unsure whether something uploaded, just do it again — there's no way to make it worse.
