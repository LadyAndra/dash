# Close the stale Desk Step 5 wording — 16 Aug 2026

## Why this changed

`docs/dash-current-state.md` is meant to describe what Dash actually does now.

One paragraph in its historical Desk section still said the in-place
reconciliation work known as Step 5 was future work. That was true when the
typing-flicker fix landed, but it stopped being true after the later August 16
Desk reconciliation/performance closeout.

The completed work is already recorded in:

- `docs/changes-2026-08-16-desk-reconciliation.md`
- `docs/dash-desk-addendum.md` §14.27

`START-HERE.md` therefore had to carry a temporary exception telling future AIs
not to trust that one current-state paragraph.

## What changed

The stale Step 5 paragraph now says what is actually built:

- the selected project's Desk keeps a persistent shell/controller;
- ordinary store writes refresh that Desk in place;
- cards, clip marks and post-its are reconciled by stable ids; and
- pile-weight work is invalidated only when relevant loose-card geometry or
  membership changes.

The paragraph also keeps the important historical distinction: the typing
flicker itself was fixed by the synchronous scroll restore. Step 5 landed later
as architecture/performance work.

Because the current-state document is accurate again, the temporary
`START-HERE.md` Desk exception is removed and the docs table no longer describes
that file as knowingly stale.

## No app behavior or data change

Documentation only:

- no app JavaScript changed;
- no CSS changed;
- no saved-data format changed;
- no Dropbox/sync behavior changed;
- no service-worker file changed; and
- no cache-version bump is needed.
