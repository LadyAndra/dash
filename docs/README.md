# Dash docs — read this first

This folder is Dash's reference library. **You usually do not need to read all of it.**

The repository-root [`START-HERE.md`](../START-HERE.md) is the first document for both Andra and any AI helping with Dash. This README explains what the files in `docs/` are for and which ones matter for a given job.

---

## The default reading order

For almost any change:

1. Read **`../START-HERE.md`** — project rules, owner constraints, publishing, safety.
2. Read **`dash-current-state.md`** — what is actually built and true today.
3. Read the **one relevant feature spec/addendum**, if the change touches one.
4. Inspect the **current code** involved.
5. Read old change notes only if you need the history behind a decision or bug.

**The current code is the final authority.** If a document disagrees with the code, follow the source-of-truth order in `START-HERE.md` and update stale current documentation as part of the change.

---

## Current operating documents

| File | Use it for |
| --- | --- |
| `dash-current-state.md` | **Read this first after `START-HERE.md`.** The best written description of what Dash actually does now, including intentional departures from the original plan. |
| `deploy-runbook.md` | The current plain-English GitHub publishing process. This is the authority for deployment instructions. |
| `dash-architecture-proposal.md` | The original architecture and major design principles. Useful for understanding the intended data model and structure; `dash-current-state.md` wins where reality has moved on. |
| `dash-desk-addendum.md` | The Desk's deeper design, data, interaction rules, and decision history. Read for Desk work. |
| `dash-milestones-calendar-addendum.md` | Milestones/Calendar design and decisions. Read for milestone, Today, or Calendar work. |
| `example-theme.json` | Example theme data/reference. Use only when working on theme import/export or theme structure. |

---

## Useful history, but not current instructions

These files are intentionally kept. They explain **why** something exists, what was tried, or what a particular build changed.

| File / pattern | What it is |
| --- | --- |
| `changes-YYYY-MM-DD-*.md` | Dated shipping notes. Good for tracing why a behavior changed. Treat them as history, not today's instructions. |
| `review-2026-08-01-code-health.md` | The August 1 structural code review and the reasoning behind the cleanup work that followed. |
| `desk-handoff-2026-08-14.md` | A snapshot of the Desk as of August 14. Later Desk work has superseded parts of it; use `dash-current-state.md` and `dash-desk-addendum.md` for current truth. |
| `dash-home-panels-addendum.md` | The build brief for the Home panel redesign. The redesign has since been built; use this for original intent, not current status. |
| `phase-0-setup-guide.md` | Early project/setup history. Usually unnecessary for ordinary maintenance. |

### Important warning about historical files

Old files may contain instructions that were correct **at the time** but are no longer current — especially references to:

- `dash-vNN` cache versions;
- manually bumping `CACHE_VERSION`;
- uploading `sw.js` with every change;
- treating the service-worker `SHELL` list as a deployment requirement.

**Do not revive those instructions from an old note.** Current deployment behavior is defined by `START-HERE.md`, `deploy-runbook.md`, the current `sw.js`, and `dash-current-state.md`.

---

## What to read for a specific job

### A normal bug or small visual change
Read:

1. `START-HERE.md`
2. `dash-current-state.md`
3. the actual files involved

Do **not** read the whole change-note archive unless the bug points to an old decision.

### Desk work
Read:

1. `START-HERE.md`
2. `dash-current-state.md`
3. `dash-desk-addendum.md`
4. current Desk code and tests

Use the dated Desk handoff/change notes only when investigating the history of a particular behavior.

### Milestones, Today, or Calendar
Read:

1. `START-HERE.md`
2. `dash-current-state.md`
3. `dash-milestones-calendar-addendum.md`
4. current related code/tests

### Publishing or update trouble
Read:

1. `START-HERE.md`
2. `deploy-runbook.md`
3. current `sw.js` only if the problem actually concerns offline/update behavior

Do not use an old dated deploy note.

### “Why was this designed this way?”
Start with the relevant addendum. Then search the dated change notes or the code-health review for the specific feature or decision.

---

## When documentation should be updated

Keep documentation useful rather than exhaustive.

- **Actual app behavior or architecture changed:** update `dash-current-state.md`.
- **How Andra maintains/publishes Dash changed:** update root `START-HERE.md` and, if relevant, `deploy-runbook.md`.
- **A lasting feature/design decision changed:** update the relevant addendum.
- **A change has context genuinely worth preserving:** a dated `changes-*.md` note is useful.
- **A tiny routine fix:** it does not need a new document just for the sake of having one.

Do not rewrite old dated change notes to make them look current. Their value is that they preserve what was true and why at that point in time.

---

## The point of this folder

This documentation exists so a fresh AI can become useful quickly **without making Andra explain the project again and without reading dozens of irrelevant files**.

Read the smallest set of documents needed for the task, trust current sources over historical ones, and leave the documentation clearer than you found it.
