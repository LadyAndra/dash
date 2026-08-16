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

Every finished change arrives as **complete files**, plus a short plain-English note covering: what changed, exactly what to upload, anything unusual that has to happen first, and a few things to check afterward.

1. Open the repo on **github.com** → **Add file → Upload files**.
2. Drag in exactly what the change note says, keeping folders intact rather than pulling individual files out of them.
3. Click **Commit changes**.
4. Wait for the automatic **Check Dash** test in GitHub Actions to show a green check.
5. Give GitHub Pages about a minute to publish, then open Dash while online.
6. If the old version still appears, **Cmd+Shift+R** on Mac, or fully close and reopen the tab/app on phone or tablet.
7. Check the few things the change note asks you to check.

If the new version still doesn't show up after reopening/hard-reloading, stop there — don't start changing GitHub or browser settings. Screenshot it and bring it back to chat.

**There is no routine cache-version step anymore.** `sw.js` uses one permanent offline cache. When Dash is online, it gets the newest app files and replaces its saved offline copies automatically. `sw.js` itself only needs uploading when the service-worker code is intentionally changed.

---
# The folders, in plain English

| Path | What it is |
| --- | --- |
| `index.html` | The single page Dash runs from. |
| `manifest.json` | Makes Dash installable as an app, with its name and icons. |
| `sw.js` | The offline helper. When online, Dash refreshes its saved copies automatically; when offline, it falls back to the last good copies. |
| `css/tokens.css` | Every color, size, and font Dash uses, in one place. This is how a full theme change stays possible. |
| `css/app.css` | All actual styling — pulls from `tokens.css`, never a literal color or size of its own. |
| `js/` | The app's logic. No build step; the browser runs these files as written. |
|   `js/store.js` | The data model and merge logic — how edits from different devices combine safely. |
|   `js/sync.js`, `js/dropbox.js`, `js/dropbox-auth.js` | Dropbox sync and its OAuth login. |
|   `js/query.js` | The one shared query shape every view uses. |
|   `js/theme.js` | Contrast and theming logic. |
|   `js/editor.js`, `js/entries.js`, `js/milestones.js`, `js/desk.js` | Feature-specific logic — the item editor, entry/source handling, milestones, and the Desk's geometry. |
|   `js/app.js` | Boots the app, builds the shared chrome, and registers which views exist. |
| `js/views/` | One file per screen — Home, List, Board, Project, Desk, and so on. A new screen is a new file here, registered in `app.js`, not a scattered set of special cases. |
| `js/ui/` | Small reusable interface pieces (toasts, color pickers, and similar). |
| `js/widgets/` | The home-screen corner widgets (weather, tide, pet). Currently switched off. |
| `docs/` | Dash's written memory: architecture, current behavior, feature specs, and dated notes for past changes. |
| `tests/` | Automated checks. GitHub Actions runs them automatically after changes are committed. Not part of the live app. |
| `mockups/` | Throwaway design previews. Not part of the live app. |
| `icon*.png`, `icon.svg`, `logo-mark.png` | Dash's app icons. |

### About retired features

Dash's policy is **unregister, don't delete.** When a feature stops being used — Kanban and Finder views, the corner-cluster widgets — its files stay in the repo, just no longer imported or shown. Keeping a feature that may come back makes restoration straightforward and avoids unnecessary reconstruction.

**This still isn't a reason to let dead weight pile up forever.** Cleaning up something that's genuinely obsolete (an unused import, a duplicated value, a leftover from an abandoned approach) is fine and welcome. The line is: a *feature* that might come back stays; *residue* from getting somewhere doesn't need to.

**User data is different from code either way** — never deleted outright, regardless of what happens to a feature. Removed items are tombstoned, not erased.

---
# Where to look when something breaks

| What you're seeing | Likely cause | What to do |
| --- | --- | --- |
| Uploaded a change but nothing looks different | The browser may still be displaying an older copy temporarily | Hard-reload: **Cmd+Shift+R** on Mac; fully close and reopen on phone/tablet. |
| Dash opens to a blank screen | A required file may be missing/misnamed, or a changed file may have an error | Screenshot it and say "Dash opens blank after the last change," with what was uploaded. |
| A message about this device needing to update | Devices are temporarily running different code versions | Reload while online. If it persists, report it rather than changing settings. |
| Something typed on one device isn't showing on another | Usually sync delay or a device still on old code, not real loss | Don't recreate or delete anything yet — check the other device, then describe what's missing and where it was entered. |
| One feature misbehaves but everything else is fine | Usually isolated to that feature | Screenshot it: what you did, what happened, what you expected. |
| Anything else looks wrong | Unknown, and that's fine | Bring the screenshot or description to chat — you don't need to diagnose it first. |

---
# What an AI needs to know before editing Dash

Before making a real change: read this file, read `docs/dash-current-state.md`, and read whichever architecture proposal or addendum the change actually touches. Then look at the real current files before proposing anything — don't assume an old change note still describes today's behavior.

- **No build step, ever.** Vanilla JS, ES modules, no bundler, no framework, nothing fetched from a CDN at runtime.
- **Theme tokens only** for anything visual — never a literal color, size, or font in a component.
- **Derived data is never stored.** Anything computable at render time stays computed, never written back as a field.
- **Views are registered modules**, declared in `app.js` — not hardcoded checks scattered through the app.
- **Accessibility floor stays intact:** 18px+ base text, AA contrast, 44px+ tap targets, `prefers-reduced-motion` respected.
- **Never delete user data.** Tombstone, don't erase.
- **Do not reintroduce manual cache-version bumps.** `sw.js` uses a permanent cache and refreshes requested app files automatically while online. New or renamed files should still be checked for correct paths and offline behavior, but Andra should never have to edit a cache version.
- **Never commit a secret.** Passwords, Dropbox tokens, API keys — none of it belongs in this repository, ever. If something needs a secret to work, that's a sign to redesign, not to hide it in a file.
- **Deliverables are complete files, never diffs or snippets**, with a short plain-English note — Andra doesn't read code.
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
- [ ] Relevant tests pass, including the automatic GitHub check
- [ ] New/renamed files were checked for correct paths and offline behavior
- [ ] No manual cache-version bump was introduced
- [ ] No paid service or recurring cost was introduced
- [ ] No secrets were added to the repo
- [ ] `docs/dash-current-state.md` was updated if real behavior changed
- [ ] This file was updated if the maintenance process itself changed

Then deliver complete replacement files with a short note:

**What changed** — one or two plain-English sentences. **Upload these** — the exact files or folders. **Try these** — a short numbered list of things to check. **Anything unusual** — only if there's genuinely something to flag.

---
# The docs worth knowing about

| File | What's in it |
| --- | --- |
| `docs/dash-architecture-proposal.md` | The original design and the non-negotiable rules — why Dash is built the way it is. |
| `docs/dash-current-state.md` | What's actually built and working today, including where it's drifted from the original plan. Trust this over older docs; trust the code over even this. |
| `docs/dash-desk-addendum.md` | The spec for the Desk — the per-project freeform board. |
| `docs/dash-milestones-calendar-addendum.md` | The spec for milestones and the Calendar view. |
| `docs/changes-YYYY-MM-DD-*.md` | One per past change, dated — history, useful for *why*, not authoritative on *now*. |

You don't need to read these yourself. Point an AI at this file and the relevant one; it'll take it from there.

---

Dash is a personal tool, not a product. The best answer is whichever one keeps it reliable, understandable, cheap, and easy for Andra to keep changing with an AI's help. Sophistication isn't the goal — dependability is.
