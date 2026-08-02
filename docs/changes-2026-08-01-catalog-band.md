# Changes — August 1, 2026: the catalog band, the index rail, and Sort

**Ships as `dash-v27`.** Follows directly from the navigation pass (`dash-v26`). Still topbar and view layer only: **no new op kind, no new field, no `formatVersion` bump, no sync or merge impact.**

## The idea

There were two strips of controls fighting over one job. This pass gives each strip exactly one meaning:

- **The topbar is the APP.** Where am I (view tabs) and what can I do (Select, New, Read, Settings, Sync). Nothing else.
- **The catalog band is the PAGE.** What am I looking at: Search, Group, Sort, the entry count, and the active filter.

Everything that narrows or reorders what's on screen moved out of the toolbar and down onto the page, which is what Andra asked for.

## What changed

### 1. The catalog band

A mount-coloured (near-black, cream ink) band across the top of **List and Board**, inside the scrolling page. It carries:

- the view name and the live entry count;
- **Search**, moved down from the topbar;
- **Group**, moved down from the panel it briefly lived in;
- **Sort** — new, see below;
- the **☰ Index** toggle for the rail;
- when a filter is on, **the filter said in words with an ✕ to clear it.**

It's `position: sticky`. That's deliberate: it belongs to the page and scrolls with it, but never leaves — re-sorting a list you've scrolled halfway down shouldn't mean scrolling back to the top first.

Mount was Andra's choice over "reacts to the active filter" and "plain paper". It's an existing material in the system — the Today rail is the same block — so nothing new was invented and it inverts correctly on the dark theme for free. **Ember is untouched by this**: it's still an indicator only, and `--ember-on-mount` is the version of it that stays legible on the band.

The filter chip is the one thing added beyond what was asked for, and it earns its place: a filter you've forgotten about looks exactly like missing data, and "why is half my archive gone" is a genuinely confusing five minutes. One chip removes the whole category of bug.

### 2. The index rail

The tag / type / status index is now a **permanent left column on List and Board, open by default.** On Home and Project it's absent entirely, along with the band.

This reverses the earlier same-day decision to keep the sidebar closed. That's intentional, not drift: closed-by-default was right when it was a drawer you had to remember, and wrong once it became the thing you steer with.

The **☰ Index** toggle in the band can still close it — the escape hatch survives, it just isn't in the toolbar any more.

One detail worth knowing: this uses a **new key, `dash.rail`**, not the old `dash.sidebar`. The old key meant "the drawer I open occasionally" and defaulted to closed; inheriting a stale `0` from that would have hidden the exact thing this pass was about. `dash.sidebar` is left behind on purpose and nothing reads it any more.

### 3. Sort

`query.js` had supported six orderings **since it was written**, and nothing had ever been wired to reach them — the app was permanently stuck on "recently changed". Sort is now a real control in the band:

- Recently changed · Longest untouched
- Newest first · Oldest first
- A → Z · **Z → A** · Recently opened

Only **Z → A** is new code (three lines in `query.js`, the exact mirror of A → Z). Everything else was already there. The choice persists per device in `dash.sortBy`, like Group.

## How to try it

1. Upload and hard-reload (**Cmd+Shift+R**).
2. **Home**: topbar has view tabs and the verbs only. No band, no rail, no search box.
3. **List**: the mount band across the top, the index column down the left.
4. Change **Sort** to `A → Z`. Scroll down — the band stays put, so Sort is still reachable.
5. Click a tag or status in the rail: the band grows a chip naming the filter. Click its ✕ to clear.
6. Hit **☰ Index** to collapse the rail; go to Home and back — it stays how you left it.
7. Narrow the window past 820px: the rail becomes a horizontal strip and the band stacks.

## Verification done before delivery

The headless boot test grew from 27 to **41 assertions, all passing** — it drives the real `app.js` in jsdom against a real `Store`:

- search, group and sort are inside the band and *not* in the topbar; no Filters button remains;
- views render into `#view-host` rather than the raw viewport;
- band and rail appear on List and Board and are absent on Home and Project;
- the rail defaults to open, the toggle works, and the preference survives a trip through Home;
- Sort offers exactly the orderings `query.js` implements, persists to `dash.sortBy`, and A→Z / Z→A / oldest-first actually order correctly;
- plus everything from the previous pass (status control, select mode, the switcher).

Also checked: `css/app.css` contains **zero literal colour values** — the band is tokens only, so a theme swap restyles it for free. All five mount tokens it depends on are confirmed present in `tokens.css`.

**What was NOT verified:** actual rendered layout. Browser dependencies couldn't be installed in this environment, so nothing screenshotted the band. Instead `mockups/home-panels-preview.html` has a new **"List (band + rail)"** button — it links the real `tokens.css` and `app.css`, so opening that file locally shows you the true band, rail and row controls (and the mount/cream toggle works on it) **before** you upload anything. That's the project's own stated method for this, and it's the thing to do first if the band looks off.

## Deploy note

Upload whole folders (`js/`, `js/views/`, `css/`), plus `sw.js` at the root. Hard-reload with **Cmd+Shift+R** before judging — GitHub Pages' ten-minute browser cache sits in front of the service worker, so without it a correct upload can look like nothing happened.

Files changed: `js/app.js`, `js/query.js`, `js/views/list.js`, `js/views/board.js`, `css/app.css`, `sw.js`, `mockups/home-panels-preview.html`, plus this doc and `dash-current-state.md`.

`CACHE_VERSION` is `dash-v27`. **No new JS files**, so `SHELL` needed no additions. `mockups/` is deliberately not in `SHELL` and not uploaded.
