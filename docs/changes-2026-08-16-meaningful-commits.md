# Meaningful commit messages — 16 Aug 2026

## Why this changed

GitHub's web uploader has repeatedly left Dash changes with the generic commit
message `Add files via upload`. That does not hurt the running app, but it makes
the repository's history poor at answering simple future questions such as
"when did the phone navigation change?" or "which upload added the safety
check?"

A useful history is a recovery tool. It should not require Andra to understand
the code or invent a technical summary at publish time.

## New handoff rule

Every change handed to Andra now includes a **Commit message** alongside
**What changed**, **Upload these**, and **Try these**.

The AI preparing the files chooses the message. It should be short plain English
that describes the outcome, usually around 3–8 words, for example:

- `Simplify mobile navigation`
- `Add release safety check`
- `Fix project shelf redraw`

If GitHub pre-fills `Add files via upload`, replace it with the supplied message.

No formal prefix, ticket number, date, filename list, or conventional-commit
syntax is required. The goal is readable history, not another system to
maintain.

## Deploy runbook correction

While updating the publishing instructions, `docs/deploy-runbook.md` was found
to contain an older service-worker strategy that no longer matched the actual
`sw.js`.

The runbook now matches the current code: Dash has an explicit `SHELL` and
`CACHE_VERSION`; whoever prepares a cached app change updates both as needed,
and `tests/release-safety.test.mjs` checks that bookkeeping after upload.

This is documentation cleanup only. The service worker itself is unchanged.

## No app behavior or data change

This change updates documentation only:

- no app JavaScript or CSS changed;
- no saved-data format changed;
- no sync behavior changed;
- no service-worker file changed; and
- no cache-version bump is needed.
