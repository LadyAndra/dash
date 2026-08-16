# Deploying Dash — the runbook

For uploading changes to `LadyAndra.github.io/dash/` through GitHub's website.

The goal is simple: Andra uploads complete files, GitHub checks them, and GitHub Pages publishes them.

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

5. In the commit message box, type a short plain-English note about the change.

6. Click **Commit changes**.

7. Check the repository's **Actions** tab. The automatic workflow called **Check Dash** should run.

8. If it finishes with a **green check**, continue.

9. If it finishes with a **red X**, stop. Do not try to diagnose it. Give the failed check to the AI that made the change.

10. Give GitHub Pages about a minute to publish.

---

## Then check Dash

**Mac:** open Dash while online. If the old version is still showing, press **Cmd + Shift + R** once.

**iPhone/iPad:** fully close Dash or its browser tab and reopen it while online.

Then try the small list of checks included with the change.

---

## Cache/versioning: no manual step

Dash's service worker (`sw.js`) now uses **one permanent offline cache**.

When Dash is online, it asks for the newest app files and automatically replaces the saved offline copies. When there is no internet, it falls back to the last good copies.

That means:

- ordinary code changes do **not** require editing `sw.js`;
- there is **no cache version number to bump**;
- `sw.js` only needs uploading when the service-worker code itself is intentionally changed;
- a new file will be cached automatically after Dash successfully requests it while online.

Do not reintroduce a manual cache-version step unless Andra explicitly asks for a different offline strategy.

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
