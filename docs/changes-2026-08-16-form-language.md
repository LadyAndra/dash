# 16 August 2026 — form system v1: native dates + phone scope

This note supersedes the two earlier date-readout experiments from the same day. Those experiments were useful visually, but real desktop and iPhone use showed that hiding or indirectly invoking the native date input made date selection less dependable.

## Final decision for now

Dash uses **one visible native `<input type="date">` pattern everywhere** until the full Calendar feature is designed. The browser / operating system owns date selection. Dash owns the surrounding hierarchy, spacing, typography and focus treatment.

This is deliberately an interim system, not the final visual design of Calendar. When the custom Calendar is eventually built, it should replace this one shared date-control seam rather than introduce different date interactions per page or device.

## Entry editor

- The existing Due and Remind fields remain real native date controls; no custom date parser or picker was added.
- Scheduling is now visually grouped as one metadata section so the date fields do not disappear among Title, Type, Status and Notes.
- On phone, Due and Remind take full rows rather than reading like two anonymous boxes in a dense form.
- Title is treated as the primary field; Type and Status read as structured metadata beneath it.
- Ordinary editing focus uses neutral ink/border emphasis rather than ember. Ember stays meaningful for overdue/attention states.

## Milestones

- Due and Remind are back to visible native date inputs. The custom `14 AUG 2026` trigger/readout and hidden picker input are removed.
- The explicit `MARK DONE` / `✓ DONE` treatment from round 2 remains; the orphaned checkbox metaphor stays retired.
- Milestone title/date/action hierarchy uses the same neutral focus language as the entry editor.

## Phone Project scope

For now, phone-sized coarse-pointer devices do not expose the Project view. The Project tab is hidden and any attempt to route into Project returns to Home.

This does **not** remove, migrate, or alter project data. Desktop Projects and Desk continue exactly as before. The temporary product decision is simply that the phone should be a dependable capture/edit surface instead of squeezing the still-growing Project workspace into a narrow screen.

## Data / compatibility

- No Store or Sync change.
- No saved-data migration.
- Entry date storage is unchanged.
- Milestone date storage is unchanged.
- No Desk code or Desk behavior changed.
- No new runtime file was added.
- `sw.js` moves to `dash-v46` because `css/app.css`, `js/app.js`, and `js/views/milestone-editor.js` changed.

## What this sets up

The next Calendar work can begin from a single predictable rule: **a date field means one thing everywhere**. The eventual custom Calendar may replace the picker/display layer, but it should keep that shared contract rather than create separate systems for Home, the editor, milestones, desktop and phone.

## Portrait Home metadata follow-up

On narrow portrait phones, dated Home rows now lay their small metadata marks out as a compact two-column ledger instead of forcing Reminder, Milestone, and date information into one crowded flex line. Phone landscape, tablet, and desktop layouts are unchanged. This is presentation only; no date, milestone, reminder, Store, or Sync behavior changes. `sw.js` moves to `dash-v47` because `css/app.css` changed.



## Portrait Home utility-gutter follow-up

The remaining portrait crowding was not date metadata itself; it was the left utility gutter. On narrow portrait phones, Home dated rows now omit the catalogue/accession number so the actual entry uses the full row. Landscape and larger layouts keep the number. Milestone completion keeps its full interaction target, but the visible square is reduced and attached to the item instead of reading like a separate block in the margin. No item, milestone, date, Store, or Sync behavior changes. `sw.js` moves to `dash-v48` because `css/app.css` changed.

## Portrait overdue spacing polish

After the narrow-phone Home rows were simplified, the overdue row's existing inset edge flag sat too close to the first metadata/title text. On portrait phones only, flagged overdue rows now use a larger left content inset. The overdue rule, data, ordering, selection behavior, landscape layout, and desktop layout are unchanged.

`sw.js` moves to `dash-v49` because `css/app.css` changed.
