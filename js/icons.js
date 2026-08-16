// icons.js — inline SVG marks, as strings.
// ===================================================================
// Andra's own artwork, pasted in as source rather than fetched. Three reasons,
// all of them the no-build-step rule wearing different hats:
//
//   1. No fetch means no second network request, no loading state, and nothing
//      to get wrong when the app is opened offline — the service worker would
//      otherwise need every icon file in SHELL, one more thing to forget.
//   2. No <img> means the path can inherit colour. Every path below is
//      fill="currentColor", so a mark drawn inside the project banner comes
//      out in --ground-ink and a mark on the desk comes out in the project's
//      own colour, with no per-project asset and no recolouring code.
//   3. It keeps the file count down, which matters when deploying is dragging
//      folders into a web page.
//
// The originals live in Icons/ in the repo (Clip_r1.ai and its two exports)
// and are NOT deployed — this file is the deployed copy.
//
// NEITHER MARK CARRIES A TILT. Both are drawn straight, on purpose: the desk
// mark's angle is derived per clip from a hash of its id and applied as a CSS
// rotate() at render time (js/desk.js clipRotationOf), the same technique the
// cards' wobble already uses. Baking an angle into the artwork would give
// every clip on the desk the identical lean, which is the one thing a
// handmade mark must not do.

// The banner button: enters select-to-clip mode. Smaller, plainer, and drawn
// to read at control size — this is a separate drawing from the desk mark, not
// a scaled copy of it.
export const CLIP_BANNER_SVG = `
<svg viewBox="0 0 34.7 27.47" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
  <path fill="currentColor" d="M22.05,12.33h0c0-.54.44-.98.98-.98h0v-5.67c0-3.13-2.54-5.68-5.68-5.68h0c-3.13,0-5.68,2.54-5.68,5.68v5.67h0c.54,0,.98.44.98.98h0c0,2.09-1.7,3.79-3.79,3.79h-2.43c-3.55,0-6.43,2.88-6.43,6.43v4.92h34.7v-4.92c0-3.55-2.88-6.43-6.43-6.43h-2.43c-2.09,0-3.79-1.7-3.79-3.79Z"/>
</svg>`.trim();

// The desk mark: the clip itself, sitting on the corner of a stack. A bigger,
// more detailed drawing (it has the rivet) because on the desk it is an object
// you look at rather than a button you press.
export const CLIP_MARK_SVG = `
<svg viewBox="0 0 87.19 69.01" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
  <path fill="currentColor" d="M71.03,40.5h-6.12c-5.26,0-9.52-4.26-9.52-9.52,0-1.36,1.1-2.46,2.46-2.46v-14.25c0-7.88-6.38-14.26-14.26-14.26h0c-7.88,0-14.26,6.38-14.26,14.26v14.25h0c1.36,0,2.46,1.1,2.46,2.46,0,5.26-4.26,9.52-9.52,9.52h-6.12C7.23,40.5,0,47.73,0,56.66v12.35h87.19v-12.35c0-8.92-7.23-16.16-16.16-16.16ZM43.6,17.55c-2.06,0-3.72-1.67-3.72-3.72s1.67-3.72,3.72-3.72,3.72,1.67,3.72,3.72-1.67,3.72-3.72,3.72Z"/>
</svg>`.trim();
