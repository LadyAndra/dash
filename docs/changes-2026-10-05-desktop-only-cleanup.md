# Round C-2: desktop only for iPad too, and the old phone code removed (dash-v116)

Dash now shows "Dash is desktop only. Open it on your Mac." on any phone or iPad, and the code that tried to make Dash work on those devices is gone.

## What changed
- **iPad now sees the "desktop only" screen**, like the phone already did. It goes by the type of device (touch screen), not the screen size, so even the biggest iPad gets it.
- **A small browser window on your Mac still works normally.** Only touch devices are turned away.
- **The old phone and iPad code is deleted.**
  - The phone capture screen (Text, Sketch, Image).
  - The phone's rearranged top bar and More menu.
  - The full-screen phone editor.
  - About 500 lines of phone-only styles.
  - A switch that sent anything captured on a touch device to the Unfiled box.
- **The "connect your Dash folder (top-right)" tip no longer shows on a phone or iPad**, since there is no top-right on that screen.
- **A few words changed** in the Export / Import sync sheet and the Unfiled box so they no longer talk about phones.

## What stayed, on purpose
- **Anything already in your Unfiled box.** Older entries from your phone or iPad still wait there.
- **Layout rules for narrow windows**, because a small browser window on a Mac still uses them.
- **Your data, sync, and every desktop screen.** Nothing about them changed.
- **The tap-size settings.** They sit unused until a touch version comes back.

## Getting it back
Nothing is lost. The deleted files are in Dash's saved history, in the commit just before "Desktop only: remove the phone and iPad code". Starting a phone or iPad version from the ground up later does not need them.

## How I checked
- All 32 test files pass, including a new iPad one.
- I opened the new version in a test browser acting as an iPad upright, an iPad sideways, the largest iPad, an iPhone, a desktop and a narrow desktop window. The four touch ones showed the "desktop only" screen with nothing to tap. Both desktops opened the app normally. No missing-file errors.

## How to try it
There is nothing to upload. Claude pushed this straight to GitHub. The live Dash will be on `dash-v116` within a few minutes.
1. Reload Dash on your Mac once or twice. It should look exactly as before.
2. Open it on your iPad or phone. You should see the one-line message.

## Files
Deleted: `js/views/phone-capture.js`, `css/phone-capture.css`, `js/mobile-chrome.js`. Changed: `js/device.js`, `js/app.js`, `js/ui-cleanup.js`, `js/views/home.js`, `js/views/desktop-only.js`, `js/views/desk.js` (comment), `css/app.css`, `css/desktop-only.css`, `css/projects.css` (comment), `index.html`, `sw.js`, `START-HERE.md`, `docs/dash-current-state.md`, this note. Tests: `tests/ipad-desktop-only.test.mjs` (new), `tests/round1-desktop-only.test.mjs`, `tests/calendar.test.mjs`, `tests/shared-helpers.test.mjs`, `tests/tap-targets.test.mjs`.
