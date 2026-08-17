# Projects overview — Next up register

**Date:** 16 August 2026  
**Scope:** desktop/larger-device Projects overview usability.

## What changed

The Projects picker now answers two different questions with two different
surfaces instead of asking the spine shelf to do both.

**The shelf stays the library.** Its project order remains stable, each spine
keeps the project's own colour, width still reflects member count, overdue
still has its ember bookmark, and the August 16 keep-the-DOM-node fix remains
intact.

**Next up is the action register.** When at least one project has an unfinished
milestone, a single bordered register appears between the Projects band and the
shelf. It uses the same specimen-row language Dash already uses elsewhere and
shows:

- project title and catalogue number;
- current milestone/stage;
- the current stage's date, or `No date`; and
- project entry count.

The order is derived fresh on every render:

1. overdue current stages;
2. dated current stages, nearest date first;
3. undated current stages.

Completed projects and projects without milestones remain on the shelf but do
not appear in Next up. Project search filters the shelf and Next up together.

## What deliberately did not change

There is no new "priority" or "attention" field. Nothing is written back merely
because the overview rendered, and no project is silently classified by a new
rule. Next up is just a view over the milestone facts Dash already stores.

The shelf is not reordered by urgency. It stays a stable catalogue so a project
does not jump around merely because a date changed.

## Tests

`tests/project-next-up.test.mjs` covers:

- overdue → dated → undated ordering;
- completed/no-milestone exclusion;
- member counts;
- row identity across ordinary redraws;
- search applying to both surfaces;
- opening a project from Next up; and
- no new archive-walk-per-project regression.

## Data / compatibility impact

- No data-model change.
- No saved-data migration.
- `formatVersion` remains 3.
- No sync behavior change.
- No new runtime file.
- `js/views/project.js` is already in the offline shell, so `sw.js` only needs
  the normal cache-version bump for the changed cached file.
