# START HERE

This is **Dash** — Andra's personal dashboard, running at `LadyAndra.github.io/dash/`.

Dash is a website that behaves like an app and works offline. There's no server, database, or company behind it — just files in this GitHub repository that a browser reads. Andra's actual dashboard data lives on her devices and syncs through Dropbox. **Personal dashboard data should never be stored in this repository.**

Andra does not write or read code. This file exists so she — or any AI helping her — can find their way around without reconstructing the project from scratch each time.

---

## The most important requirements

These outrank cleverness, convention, or "how a professional team would normally do it."

1. **Dash stays free to run.** No paid service, subscription, API, hosting tier, or other recurring cost without Andra approving it first.
2. **Dash stays maintainable by someone who doesn't code.** No terminals, package managers, servers, or developer vocabulary required to keep using or publishing it.
3. **The simplest solution that works, wins.** No framework, bundler, or extra service unless it solves a real problem the current setup can't.
4. **User data is protected above everything else.** No change should be able to silently erase, overwrite, or strand existing data.
5. **Any AI should be able to pick this up cold.** Filenames, docs, and responsibilities should stay obvious enough for a fresh session to work safely without the history of how it got this way.

---

## What to trust when sources disagree

Dash has accumulated a proposal doc, a current-state doc, feature addenda, and a long trail of dated change notes. When two disagree, trust them in this order:

1. **The code in the repository, as it actually is today**
2. **`docs/dash-current-state.md`**
3. **The relevant architecture proposal or addendum**
4. **Old dated change notes** — these describe what happened at the time, not necessarily what's still true

If an AI finds a real gap between the code and `dash-current-state.md`, closing that gap is part of the change, not a separate ask.

---

# Publishing a change

Every finished change arrives as **complete files**, plus a short plain-English note covering: what changed, exactly what to upload, a **ready-to-paste commit message**, anything unusual that has to happen first, and a few things to check afterward.

1. Open the repo on **github.com** → **Add file → Upload files**.
2. Drag in whatever the note says — usually whole folders (`js`, `css`, `docs`, `tests`), keeping folders intact rather than pulling files out of them, plus `sw.js` on its own at the root if the note includes it.
3. In GitHub's commit-message box, replace any generic text such as **“Add files via upload”** with the exact **Commit message** supplied in the handoff.
4. Click **Commit changes**.
5. Give it about a minute, then **hard-reload** on each device: **Cmd+Shift+R** on Mac, or fully close and reopen the tab/app on phone or tablet. A plain reload often isn't enough — see below for why.
6. Check the few things the note asks you to check.

Commit messages should be short plain English that says what the change *did*, usually about 3–8 words: **“Simplify mobile navigation”**, **“Add release safety check”**, **“Fix project shelf redraw”**. Do not use filenames, dates, ticket numbers, or “Add files via upload” unless that phrase genuinely describes the change. The AI preparing the files chooses the message; Andra should not have to summarize technical work herself.

If the new version still doesn't show up after a hard reload, stop there — don't start changing GitHub or browser settings. Screenshot it and bring it back to chat.

## What the GitHub checks mean

Every push to `main` runs two separate things, and they answer different questions:

- **Pages build and deployment** — did GitHub publish the site? A green check here means the files made it live.
- **Check Dash** — did Dash's automated tests pass? A green check here means every `tests/*.test.mjs` file completed successfully, including the release-safety check described below.

One can be green while the other is red. A successful Pages deploy does **not** prove the tests passed, and a red Check Dash does not by itself mean the live site failed to publish.

If **Check Dash** is red, open that run, open the step with the red ×, and copy the bottom of the log from the first `FAIL`, `Error`, or `ReferenceError` through `Process completed with exit code 1`. Bring that text back to chat rather than trying to diagnose or edit code yourself. Warnings above the real error can be noisy; the failed step is the thing to trust.

**The cache bookkeeping is now checked automatically:** `sw.js` is still intentionally maintained by hand, but `tests/release-safety.test.mjs` checks the easy-to-forget parts after every push. It fails if the offline `SHELL` names a missing file, if a required offline runtime asset is not in `SHELL`, if a commit changes a cached app file without changing `sw.js`, or if `sw.js` changes without a new `CACHE_VERSION`. This is a guardrail, not a build step: whoever hands Andra a change is still responsible for getting `sw.js` right before upload; GitHub now fails loudly if that bookkeeping was missed.

---

# The folders, in plain English

| Path | What it is |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.html`                                                        | The single page Dash runs from.                                                                                                                                   |
| `manifest.json`                                                     | Makes Dash installable as an app, with its name and icons.                                                                                                        |
| `sw.js`                                                             | The offline cache. Lists every file the app needs to work with no internet; maintained by hand, with `release-safety.test.mjs` checking the bookkeeping after each push. |
| `css/tokens.css`                                                    | Every color, size, and font Dash uses, in one place. This is how a full theme change stays possible.                                                              |
| `css/app.css`                                                       | All actual styling — pulls from `tokens.css`, never a literal color or size of its own.                                                                           |
| `js/`                                                               | The app's logic. No build step; the browser runs these files as written.                                                                                          |
|   `js/store.js`                                                     | The data model and merge logic — how edits from different devices combine safely.                                                                                 |
|   `js/sync.js`, `js/dropbox.js`, `js/dropbox-auth.js`               | Dropbox sync and its OAuth login.                                                                                                                                 |
|   `js/query.js`                                                     | The one shared query shape every view uses.                                                                                                                       |
|   `js/theme.js`                                                     | Contrast and theming logic.                                                                                                                                       |
|   `js/editor.js`, `js/entries.js`, `js/milestones.js`, `js/desk.js` | Feature-specific logic — the item editor, entry/source handling, milestones, and the Desk's geometry (kept deliberately DOM-free).                                |
|   `js/app.js`                                                       | Boots the app, builds the shared chrome, and registers which views exist.                                                                                         |
| `js/views/`                                                         | One file per screen — Home, List, Board, Project, Desk, and so on. A new screen is a new file here, registered in `app.js`, not a scattered set of special cases. |
| `js/ui/`                                                            | Small reusable interface pieces (toasts, color pickers, and similar).                                                                                             |
| `js/widgets/`                                                       | The home-screen corner widgets (weather, tide, pet). Currently switched off — see below.                                                                          |
| `docs/`                                                             | Dash's written memory: architecture, current behavior, feature specs, and a dated note for every past change.                                                     |
| `test/`                                                             | Two manual item-editor preview pages only. Not CI. Its tiny CSS/JS bridge files point back to the real root app files so no duplicate source can drift.           |
| `tests/`                                                            | The authoritative test/support area. GitHub runs every `*.test.mjs` file here after each push to `main`; `visual-harness.html` is a manual visual aid in the same support area. |
| `mockups/`                                                          | Throwaway design previews. Not part of the live app.                                                                                                              |
| `icon*.png`, `icon.svg`, `logo-mark.png`                            | Dash's app icons.                                                                                                                                                 |

### About retired features

Dash's actual policy is **unregister, don't delete.** When a feature stops being used — Kanban and Finder views, the corner-cluster widgets — its files stay in the repo and in `sw.js`'s cache list, just no longer imported or shown. This isn't sentimentality about the code; it's a deploy-safety decision for someone who can't debug: turning a feature back on becomes one uncommented import with zero risk of the "forgot to add a new file to the cache list" bug that has actually broken deploys before. Git history is not a substitute for this — it's not something Andra can reach into.

**This still isn't a reason to let dead weight pile up forever.** Cleaning up something that's genuinely obsolete (an unused import, a duplicated value, a leftover from an abandoned approach) is fine and welcome. The line is: a *feature* that might come back stays; *residue* from getting somewhere doesn't need to.

**User data is different from code either way** — never deleted outright, regardless of what happens to a feature. Removed items are tombstoned, not erased.

---

### Phone scope right now

On phone-sized coarse-pointer devices, **Project / Desk is intentionally unavailable for now**. The Project tab is hidden, and an attempt to enter the Project view returns to Home. This is a presentation/navigation decision only: project data is not deleted or changed, and Projects remain available on desktop and larger devices.

The phone is being treated as the fast capture/edit surface while Dash's future Calendar and mobile information architecture are designed. Do not build a separate phone-only date system in the meantime; ordinary entry dates and milestone dates both use the browser's native date control, with Dash responsible for hierarchy, spacing and focus styling around it.

---

# Where to look when something breaks

| What you're seeing | Likely cause | What to do |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Uploaded a change but nothing looks different          | Two caches — your browser's and Dash's own offline cache — are both still holding the old version | Hard-reload: **Cmd+Shift+R** on Mac; fully close and reopen on phone/tablet.                                           |
| Dash opens to a blank screen                           | A file `sw.js` expects is missing or misnamed, or a changed file has an error                     | Screenshot it and say "Dash opens blank after the last change," with what was uploaded.                                |
| A message about this device needing to update          | Devices are temporarily running different code versions                                           | Reload while online. If it persists, report it rather than changing settings.                                          |
| Something typed on one device isn't showing on another | Usually sync delay or a device still on old code, not real loss                                   | Don't recreate or delete anything yet — check the other device, then describe what's missing and where it was entered. |
| One feature misbehaves but everything else is fine     | Usually isolated to that feature                                                                  | Screenshot it: what you did, what happened, what you expected.                                                         |
| Anything else looks wrong                              | Unknown, and that's fine                                                                          | Bring the screenshot or description to chat — you don't need to diagnose it first.                                     |

---

# What an AI needs to know before editing Dash

Before making a real change: read this file, read `docs/dash-current-state.md`, and read whichever architecture proposal or addendum the change actually touches. Then look at the real current files before proposing anything — don't assume an old change note still describes today's behavior.

- **No build step, ever.** Vanilla JS, ES modules, no bundler, no framework, nothing fetched from a CDN at runtime.
- **Theme tokens only** for anything visual — never a literal color, size, or font in a component.
- **Derived data is never stored.** Anything computable at render time stays computed, never written back as a field.
- **Views are registered modules**, declared in `app.js` — not hardcoded checks scattered through the app.
- **Accessibility floor stays intact:** 18px+ base text, AA contrast, 44px+ tap targets, `prefers-reduced-motion` respected.
- **Never delete user data.** Tombstone, don't erase.
- **Every new or renamed runtime file goes into `sw.js`'s file list, with the cache version bumped, in the same upload.** `release-safety.test.mjs` is a backstop for this rule, not a reason to leave it for CI to discover after publishing.
- **Never commit a secret.** Passwords, Dropbox tokens, API keys — none of it belongs in this repository, ever, regardless of how the feature is framed. If something needs a secret to work, that's a sign to redesign, not to hide it in a file.
- **Deliverables are complete files, never diffs or snippets**, with a short plain-English note — Andra doesn't read code.
- **`test/` is manual preview material; `tests/` is the test suite.** Never copy live app source into `test/`; its bridge files must keep pointing to the authoritative root `css/` and `js/`.
- **Don't relitigate settled decisions** in the architecture proposal or an addendum without Andra raising it first.

---

# Data changes need extra care

If a change touches the *structure* of saved data (not just how it's displayed):

- preserve existing data — old data should still load under the new code whenever at all possible;
- avoid one-way conversions;
- check sync actually still works between two devices;
- spell out, in plain English, any order devices need to be updated in;
- and don't let Andra start using the new version until that's clear.

No format change should ever be hidden inside what looks like an ordinary feature update.

---

# Before handing a change to Andra

- [ ] Dash still opens normally
- [ ] The changed feature works
- [ ] Related existing features still work
- [ ] Existing user data is preserved
- [ ] Dropbox sync wasn't unintentionally affected
- [ ] Relevant tests pass
- [ ] Any new/renamed runtime file is in `sw.js`, the cache version is bumped, and the release-safety check would accept the bookkeeping
- [ ] No paid service or recurring cost was introduced
- [ ] No secrets were added to the repo
- [ ] `docs/dash-current-state.md` was updated if real behavior changed
- [ ] This file was updated if the maintenance process itself changed
- [ ] The handoff includes a short, meaningful, ready-to-paste commit message

Then deliver complete replacement files with a short note:

**What changed** — one or two plain-English sentences. **Upload these** — the exact files or folders. **Commit message** — one short plain-English line to paste into GitHub. **Try these** — a short numbered list of things to check. **Anything unusual** — only if there's genuinely something to flag.

---

# The docs worth knowing about

| File | What's in it |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/dash-architecture-proposal.md`        | The original design and the non-negotiable rules — why Dash is built the way it is.                                                                      |
| `docs/dash-current-state.md`                | Broad current-state record of what is actually built now; keep it aligned with the code whenever real behavior changes.                                 |
| `docs/deploy-runbook.md`                    | The short GitHub-web publishing routine: what to upload, what commit message to use, what the checks mean, and what to do after publishing.              |
| `docs/dash-desk-addendum.md`                | The spec and decision history for the Desk. §14.27 records the completed in-place reconciliation work.                                                    |
| `docs/desk-handoff-2026-08-14.md`           | Historical Desk handoff. Its old Step 5 bug is closed; it now points forward instead of acting as an open-task list.                                      |
| `docs/dash-milestones-calendar-addendum.md` | The spec for milestones and the Calendar view.                                                                                                           |
| `docs/changes-2026-08-16-desk-reconciliation.md` | The dated record of the Desk reconciliation rounds, pile-weight cache, and the CI closeout.                                                          |
| `docs/changes-2026-08-16-release-safety.md` | The service-worker release guardrail: what it checks, what it deliberately does not automate, and how it fits the existing publishing routine.           |
| `docs/changes-YYYY-MM-DD-*.md`              | One per past change, dated — history, useful for *why*, not authoritative on *now*.                                                                      |

You don't need to read these yourself. Point an AI at this file and the relevant one; it'll take it from there.

---

Dash is a personal tool, not a product. The best answer is whichever one keeps it reliable, understandable, cheap, and easy for Andra to keep changing with an AI's help. Sophistication isn't the goal — dependability is.
