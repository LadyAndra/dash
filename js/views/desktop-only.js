// desktop-only.js — what a phone or an iPad sees, October 2026.
// ===================================================================
// Dash is DESKTOP ONLY for now (decided 2026-10-04, widened to iPad and the
// old phone code removed 2026-10-05). Phone and iPad come back later as
// something designed from the ground up, so nothing about the data model, the
// store or Dropbox sync changed for this.
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
