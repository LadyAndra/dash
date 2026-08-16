# Merge notes that came back, and Projects flashing to Home

**August 15, 2026 · `dash-v38` → `dash-v39`**
Two bug fixes. No new features, no data format change, no new files in `SHELL`.
`formatVersion` stays **3**.

---

## 1. A merge note came back after you dismissed it

### What you saw

> "Once I say something is fine, or clear the list, the next time I open the
> app it pops up again."

### What was actually happening

Dash kept **one** record of a merge note: the list of notes on screen.
Dismissing a note removed it from that list, and the shortened list was saved.

That list was also the only memory Dash had of ever having seen the collision.
`_noteCollision()` checks a set of note keys before recording anything, and
that set was built from the visible list and nothing else — at construction
(`new Set(this._collisions.map(c => c.key))`) and again inside
`clearCollisions()`.

So dismissing a note did two things at once, only one of them wanted: it took
the note off the screen, **and** it erased the record that the note had ever
existed. Sync re-reads logs routinely. The next time the losing op came back
through `_applyOp`, `_noteCollision()` found no trace of it and wrote the note
out again, indistinguishable from a brand-new collision.

Note where it bit. Inside one session the note stayed gone, because the
in-memory key set still happened to hold the key. It only came back **after a
reload** — which is exactly how you described it, and exactly how it slipped
past a green test suite.

### The fix

"Resolved" now has its own memory, in its own place, that nothing shortens:

```
dash.mergeNotesResolved     a plain list of note keys, per device
```

The moment a note is dismissed, cleared, or restored, its key goes in there and
stays. `_noteCollision()` checks that list first and returns early. Once a key
is on it, that note can never be written again — same spirit as a tombstone.

The note key is derived entirely from the losing op
(`itemId | field | wall.count.device`), so replaying the same op always
produces the same key. That is what makes the check survive both a reload and a
re-read of the logs.

Everything else is unchanged. While a note is visible, "Put the replaced one
back" works exactly as before, and the losing value is still preserved in full
in the logs either way. This fix only governs what happens *after* dismissal.

**Per-device, like the rest of the merge-notes plumbing.** `dash.mergeNotes`
is deliberately never synced, because a note is an inbox for the person sitting
at *this* device. "I have already dealt with it" is a fact about this device
too, so its tombstones sit beside it.

**On the size of that list.** Capped at 1000 keys, versus 60 for the notes
themselves. A tombstone is one short string rather than a note carrying two
values, so a thousand of them is tens of kilobytes against a multi-megabyte
budget — and you would have to resolve a thousand collisions on one device to
reach it. The cap is there so the key cannot grow without limit, not because
the limit is anywhere near.

---

## 2. Tapping Projects flashed back to Home

### What you saw

> "When I open Dash and click the Projects button, it takes me to the projects
> page but then back to the home screen in a flash."

Mainly right after a fresh open, not mid-session. A whole-screen flicker, like
a browser refresh.

### Confirming it before changing anything

This was scoped from reading the source, so it was reproduced first, in a real
browser, before a line was touched. The repo was served over `localhost` (a
secure context, so service workers run) with GitHub Pages' `max-age=600` header
mirrored, driven by headless Chromium.

Opening Dash, tapping Projects immediately, and waiting:

```
NAVIGATED -> /                          the open
tabs right after the tap: project       the tap worked
NAVIGATED -> /                          a full page reload, unasked for
tabs 4s later:            home          back on Home
```

That is the bug, exactly as described. Then the timing, measured from
navigation start on a fresh open after a deploy:

```
    30ms  page scripts start   (no worker waiting, none installing)
   221ms  window load          (this is when sw.js registration is kicked off)
  2184ms  controllerchange     (index.html reloads here)
```

### Why

`sw.js` calls `self.skipWaiting()` on install and `self.clients.claim()` on
activate, both unconditional. Together they mean a newer worker seizes an
already-open tab the moment it finishes installing, and `index.html` answers
`controllerchange` with exactly one forced `window.location.reload()`.

Installing is not instant: it fetches the whole `SHELL`, about fifty files,
with `cache: "no-store"`. That measured **two seconds after the page was on
screen and tappable**. Tap Projects inside that window and the reload throws
the navigation away, and the reloaded page lands on Home, which is Dash's fixed
cold-start view.

Given how often Dash is redeployed, "a fresh open shortly after the last
deploy" is an ordinary thing to hit. It also happens on the very first visit
ever, when the first worker claims the page.

### Why option 1 could not work

The scoping doc's first suggestion was to check for a waiting worker as early
as possible in boot and reload immediately, before `buildChrome()` finishes
attaching click handlers.

The measurement above rules that out, and it is worth writing down so it is not
proposed again. At 30ms, the earliest a boot check can run, there is **no
waiting worker and none installing** — `getRegistration()` reports
`waiting=false, installing=false`. The new worker does not exist yet at boot.
It is fetched at `window.load` and arrives about two seconds later. There is
nothing early to find, so an early check finds nothing and the reload still
fires mid-session.

### What was done instead

The reload stays, for the reason the old comment gives: never run a mix of old
and new code. What changed is **when it is allowed to happen**.

- **Nobody has touched the page yet** → reload straight away, exactly as
  before. There is no navigation to lose, and the update lands promptly.
- **There has been a real tap or keypress** → remember that an update is ready
  and wait for a quiet moment. The quiet moment is the tab being hidden:
  switching apps, switching tabs, locking the screen. Nobody is looking, so the
  reload costs nothing.

"Touched" is a deliberate act, a `pointerdown` or a `keydown`. Not scroll and
not pointer movement, on purpose: reading the Home sheet is not a state you can
lose, and counting it would let a page that is merely open hold an update off
forever.

**Nothing is lost by waiting.** The new worker is already active, so the very
next time Dash is opened it serves the new code regardless. Deferring delays an
update, it never skips one.

The honest tradeoff: if you tap something, then leave that tab in front for an
hour and never switch away, you keep running the old code for that hour. That
is the standard PWA bargain and it is the right side to err on, because the
alternative is what you reported.

### Proof it holds

The same harness, opening Dash eight times with a deploy before each open, and
tapping Projects at a different delay each time:

```
                     before          after
tap at +   0ms       Home            Projects
tap at + 150ms       Home            Projects
tap at + 400ms       Home            Projects
tap at + 800ms       Home            Projects
tap at +1200ms       Home            Projects
tap at +1600ms       Home            Projects
tap at +2000ms       Projects        Projects
tap at +2400ms       Projects        Projects
                     6 of 8 lost     8 of 8 held
```

The two that survived on the old code are the two that landed after
`controllerchange` had already fired, which is the window closing rather than
the bug being absent.

Also checked, on the fixed code:

- An untouched page still reloads on its own within the same few seconds, so
  updates still arrive promptly when nobody is mid-anything.
- A page that deferred its update does reload once the tab is hidden.

### A note on the harness

The reproduction is a Playwright script, not a repo test. It stays out of
`tests/` on purpose: that folder's standing promise is `node` plus the repo's
own `js/`, with jsdom as the single grudging exception, and a real browser plus
a real service worker is a much bigger dependency than that. The method is
written down here instead, which is what a future service-worker change
actually needs.

---

## Files changed

```
js/store.js            merge notes get a persistent "resolved" list
index.html             the update reload waits if you are mid-something
sw.js                  CACHE_VERSION → dash-v39 (no SHELL change: no new app files)
tests/desk-d1.test.mjs six assertions for the dismissed-note case
docs/dash-current-state.md
docs/changes-2026-08-15-two-bugs.md   (this file)
```

No `css/` change, no view-layer change, no `formatVersion` bump.

## Tests

```
tests/desk-d1.test.mjs            all 46 passed   (was 40)
tests/desk-d1.render.test.mjs     all 28 passed
tests/desk-d1.gesture.test.mjs    all 16 passed
tests/desk-d1.viewstate.test.mjs  all 11 passed
tests/desk-d1.mount.test.mjs      all  8 passed
tests/editor-scrim.test.mjs       all  5 passed
```

**The new assertions were checked against the un-fixed store and go red on
it** — the standing rule from the last round. Which assertion is the red one
matters here, so it is written into the test file: it is *"...and it is still
gone after a reload"*, plus its `clearCollisions` twin. The same-session replay
passes on the old code too, because the in-memory key set happened to still
hold the key. **The reload is the test.** That is precisely how a green suite
sat beside this bug, which is now the third time on the desk that has happened.

Bug 2 has no repo test, and cannot have one under the current rules. jsdom has
no service worker, and the whole bug is a service worker taking over a live
page two seconds after it loads. The browser harness above is the evidence, and
the timing table is the part worth keeping.
