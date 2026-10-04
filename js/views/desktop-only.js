// desktop-only.js — what a phone sees, October 2026.
// ===================================================================
// Dash is DESKTOP ONLY for now (decided 2026-10-04). Phone and iPad come back
// next year as connected companions, so nothing about the data model, the
// store or Dropbox sync changed for this — it is a view-level gate only.
//
// The phone capture screen (js/views/phone-capture.js) is UNREGISTERED, not
// deleted, the standing Dash rule: it stays on disk and in sw.js's SHELL, and
// bringing it back is putting its import and its line in activeView() back in
// js/app.js. Nothing else.
//
// This screen is deliberately plain: one sentence, centred, nothing to tap.
// Every colour and size comes from tokens via css/desktop-only.css.

import { el } from "./shared.js";

export const desktopOnlyView = {
  name: "desktop-only",
  label: "Desktop only",
  ownFilter: true,   // reads nothing; never ask app.js to build a query for it

  render(_result, _ctx, container) {
    container.innerHTML = "";
    container.appendChild(el("div", { class: "desktop-only", role: "note" }, [
      el("p", { class: "desktop-only-line", text: "Dash is desktop only." }),
      el("p", { class: "desktop-only-sub", text: "Open it on your Mac." }),
    ]));
  },
};
