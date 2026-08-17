# Pin the Check Dash jsdom dependency — 16 Aug 2026

## Why this changed

Some of Dash's headless rendering and interaction tests need `jsdom`.
Until this change, the GitHub Actions workflow installed the unversioned package
name:

`jsdom`

That asks npm for whatever release is current on the day the workflow runs.
It means Dash's own files could remain completely unchanged while a future
upstream jsdom release changes the test environment and turns Check Dash red.

That is avoidable uncertainty.

## What changed

`.github/workflows/check-dash.yml` now installs:

`jsdom@30.0.1`

Version 30.0.1 is the current stable jsdom release at the time of this
maintenance pass. Its package metadata supports the Node 22 line used by
Check Dash (with Node 22.22.2 or newer).

The workflow still has no package file, lockfile, build step, or runtime
dependency. It simply installs the same known test helper version on each run.

## How future updates should work

Do not automatically chase new jsdom releases.

Upgrade the pinned version only when there is a reason to do so, and let the
ordinary Dash test suite prove that the new version works before keeping it.
A dependency update should be an intentional maintenance change, not something
that happens invisibly between uploads.

## No app behavior or data change

This maintenance pass changes only the CI test environment and its
documentation:

- no app JavaScript changed;
- no CSS changed;
- no saved-data format changed;
- no Dropbox/sync behavior changed;
- no service-worker file changed; and
- no cache-version bump is needed.
