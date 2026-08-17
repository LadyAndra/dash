# Deploying Dash — the runbook

For uploading changes to `LadyAndra.github.io/dash/` through GitHub's website.

The goal is simple: Andra uploads complete files, gives the upload a useful name, GitHub checks it, and GitHub Pages publishes it.

---

## The one rule that can still break things

**Keep files in the folders they belong in.**

If a change note says to upload a whole folder such as `js`, `css`, `docs`, or `tests`, drag the **folder**, not loose files pulled out of it. That preserves the correct paths.

Files that genuinely live at the repository root — such as `index.html`, `manifest.json`, `START-HERE.md`, and `sw.js` — are uploaded as individual files only when a change note specifically includes them.

---

## Normal publishing steps

1. Go to **github.com/LadyAndra/dash**.

2. Click **Add file → Upload files**.

3. Drag in **exactly the files or folders listed in the change note**.

4. Wait for GitHub to finish showing the uploaded files.

5. In the commit-message box, paste the exact **Commit message** from the change note. If GitHub has filled in something generic such as **“Add files via upload”**, replace it.

6. Click **Commit changes**.

7. Check the repository's **Actions** tab. The automatic workflow called **Check Dash** should run.

8. If it finishes with a **green check**, continue.

9. If it finishes with a **red X**, stop. Do not try to diagnose it. Give the failed check to the AI that made the change.

10. Give GitHub Pages about a minute to publish.

### What a good commit message looks like

The AI preparing the files supplies this. Andra should not have to invent it.

Keep it short and say what changed:

- `Simplify mobile navigation`
- `Add release safety check`
- `Fix project shelf redraw`

Avoid filenames, dates, long explanations, and generic messages such as `Add files via upload`. The point is that six months from now the repository history should read like a useful list of what changed.

---

## Then check Dash

**Mac:** open Dash while online. If the old version is still showing, press **Cmd + Shift + R** once.

**iPhone/iPad:** fully close Dash or its browser tab and reopen it while online.

Then try the small list of checks included with the change.

---

## Cache/versioning: handled in the change, checked by GitHub

Dash's service worker (`sw.js`) keeps an explicit offline **SHELL** list and a `CACHE_VERSION`.

Whenever a cached app file is added, renamed, or changed, whoever prepares the change must update `sw.js` and bump `CACHE_VERSION` in the same upload. **Andra never needs to edit either one herself.**

The automated `tests/release-safety.test.mjs` check is the backstop. It fails loudly if:

- `sw.js` names a file that does not exist;
- a required offline runtime file is missing from `SHELL`;
- a cached app file changed but `sw.js` did not; or
- `sw.js` changed without a new `CACHE_VERSION`.

So the practical rule is simple: **upload `sw.js` only when the change note tells you to.** If the bookkeeping was prepared incorrectly, **Check Dash** should turn red and explain what was missed.

Do not redesign or bypass this cache strategy as part of an unrelated change.

---

## If nothing changed after uploading

1. Make sure the automatic **Check Dash** action was green.
2. Open Dash while connected to the internet.
3. On Mac, use **Cmd + Shift + R** once.
4. On phone/tablet, fully close and reopen Dash.
5. If the old behavior is still there, stop and bring the screenshot/problem description back to chat.

Do not delete browser storage or change GitHub settings as a first troubleshooting step.

---

## If Dash comes up blank or broken

Do not start repairing files yourself.

Take a screenshot and report:

- what was changed;
- what was uploaded;
- whether **Check Dash** was green or red;
- what device/browser is showing the problem;
- and what you see.

Because files are versioned in GitHub, a previous working version can be recovered if necessary.

---

## Uploading the same folder twice

Uploading a file again to the same path replaces that file with the new copy. Files you did not upload are not automatically removed.

If a change includes file deletions or renames, the AI handing over the change must explain those separately rather than expecting Andra to infer them.
