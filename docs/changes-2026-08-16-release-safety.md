# Release safety net — 16 Aug 2026

## Why this exists

Dash intentionally keeps its service worker simple: `sw.js` contains a
hand-maintained `SHELL` list and a manually bumped `CACHE_VERSION`. That is easy
to understand and keeps publishing possible through GitHub's website, but it
also creates one repetitive failure mode: a perfectly good app change can be
uploaded while the offline-cache bookkeeping is forgotten.

That failure is unusually stressful because the symptom arrives later as
"nothing changed", stale code on one device, or a blank/offline failure rather
than as an obvious mistake at upload time.

## What changed

`tests/release-safety.test.mjs` adds a fail-loudly guardrail to the existing
**Check Dash** workflow. No workflow file changed: `check-dash.yml` already runs
every `tests/*.test.mjs`, so this test joins the existing suite automatically.

The test has two layers.

### Current-tree checks

Every run checks that:

- `sw.js` has a `CACHE_VERSION`;
- the `SHELL` list has no duplicate paths;
- every file named in `SHELL` actually exists; and
- every required offline runtime asset that Dash reaches from `index.html`,
  `manifest.json`, CSS dependencies, and active ES-module imports is covered by
  `SHELL`. Explicitly documented online-only diagnostics may be excepted.

Retired/shelved modules may remain in `SHELL`. The test does not require every
cached file to be actively imported; it only prevents an active dependency from
being forgotten.

### Commit checks

When git history is available — including GitHub Actions — the test compares the
new commit with its parent.

- If a file that was or is in the offline shell changed, `sw.js` must change in
  the same commit.
- If `sw.js` changed for any reason, `CACHE_VERSION` must also change.

GitHub's checkout is normally shallow, so the test deepens that checkout by one
commit only when it needs the parent. That avoids changing the workflow or
adding a build/install step.

## First-run calibration

The first real CI run did exactly what a new guardrail should do: it exposed two
parser assumptions before we trusted it. The checker initially mistook an SVG
filter reference (`url(%23n)`) inside an embedded `data:image/svg+xml` value for
a file, and it treated the deliberately online-only `js/focus-debug.js`
diagnostic as an offline requirement. The parser now skips quoted data URLs and
keeps that one diagnostic in an explicit exception set. Required app modules
remain checked normally.

## What this deliberately does not do

It does **not** generate `sw.js`, edit the cache list, choose a cache version, or
change how Andra publishes.

The existing rule remains: whoever builds a Dash change is responsible for
including the correct `sw.js` before handoff. This test is the seatbelt: if that
human/AI bookkeeping is missed, **Check Dash** now says exactly what is wrong
instead of letting the mistake stay mysterious.

## Maintenance docs

`START-HERE.md` now describes the guardrail and keeps the manual-cache rule
explicit. `tests/README.md` lists the new test and clarifies that tests are not
loaded by the app, even though the public GitHub Pages root can serve repository
files.

## No app behavior or data change

This release changes tests and documentation only.

- no app JavaScript changed;
- no CSS changed;
- no saved-data format changed;
- no Dropbox/sync behavior changed;
- no service-worker cache contents changed; and
- therefore `sw.js` does not need a cache-version bump for this release.
