# 16 August 2026 — milestone form language

This is a visual/interaction refinement of the existing milestone editor. It does not change the milestone data shape, Store methods, sync, or the meaning of any field.

## What changed

- Milestone-name inputs no longer sit in permanent four-sided boxes. They keep the same full touch target but rest as text over a single hairline.
- Due and Remind dates now display as compact Dash readouts (`14 AUG 2026`) instead of leaving the browser's native date field visible all the time.
- The real native `<input type="date">` is still present over the readout and still supplies the iOS/macOS/browser date picker. Storage remains the existing `YYYY-MM-DD` value; there is no new parsing or timezone conversion.
- Empty dates read as a quiet dash rather than a large blank field.
- Secondary milestone copy moves from the faintest ink to the ordinary secondary-ink level so it does not read as disabled.
- The done control and reorder/remove controls keep their 44px touch areas, but their resting visual marks are smaller/quieter. Interaction size and visual size are deliberately separate.
- Project-colour drawers and the phone Peek page use the same hierarchy, redrawn from `--ground-ink`; no literal colour was introduced.

## Why

The milestone editor had become one of the places where native browser controls overpowered Dash's own visual language, especially on iPhone. The new direction is an **archival instrument** rather than a retro gadget: information first, sparse chrome, precise mono dates, serif content, and the operating system used only where it is genuinely better — the date picker itself.

## Safety / data

No saved-data format changed. No migration. No Store/Sync change. Dates are still written through `setMilestoneField()` exactly as before. The service-worker cache version was bumped because `css/app.css` and `js/views/milestone-editor.js` changed.

## Scope boundary

This is the milestone editor as the pilot for the form language. It does not yet replace the date fields in the full entry editor. That should be rolled out only after the milestone version has been used on desktop and iPhone and the visual direction is confirmed in practice.


## Round 2 — after desktop + iPhone use

The first live pass confirmed the readout direction but exposed three problems in actual use. The done checkbox still read as foreign checklist UI, the invisible native date input laid over the readout did not reliably open the picker, and the global ember focus ring made ordinary active fields look like errors.

Round 2 removes the checkbox metaphor entirely. Completion is now an explicit `MARK DONE` / `✓ DONE` text-state in the milestone metadata line, using the same quiet mono language as dates and labels. The visible date readout is now a real button; it opens a tiny native date input with `showPicker()` when available and a direct user-click fallback otherwise. The native input still owns the date selection and the stored value remains unchanged.

Milestone form focus/active styling is now neutral ink: stronger underline, text emphasis, or a quiet wash depending on the control. Ember remains reserved for actual overdue/error-like status, not ordinary editing focus.

No data shape, Store method, sync behavior, or milestone semantics changed. The cache version moves to `dash-v45` because the runtime CSS and milestone editor changed again.
