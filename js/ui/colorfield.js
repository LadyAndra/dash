// colorfield.js — the colour picker control (August 2026).
// ===================================================================
// One control, used in two places: picking a project's colour in the item
// editor, and picking Dash's accent colour in Settings. Both need the same
// three things, so they share one component rather than two that drift.
//
//   1. A real colour picker. This is <input type="color">, which on macOS and
//      iOS opens the SYSTEM picker — spectrum, sliders, eyedropper, saved
//      swatches, the lot. Writing a custom gradient canvas would be several
//      hundred lines, worse with a finger, and worse with a screen reader,
//      to arrive somewhere less capable. The browser already has this.
//
//   2. A hex box, for when you know the value or want to paste one.
//
//   3. A contrast readout — the part that matters here.
//
// THE POLICY (decided August 2026)
// --------------------------------
// Your colour is used exactly as you picked it. Dash does not quietly darken
// it to make itself comfortable, and there is no "you can't use that".
//
// What it does instead is tell you the truth before you commit, in the two
// ways the colour will actually be used:
//
//   "as small text"  — the colour written on the paper ground, which is what
//                      an 11px label or an overdue heading does. This is the
//                      one that bites: a pale colour vanishes here.
//   "as a block"     — Dash's most readable ink written on your colour, which
//                      is what a filled banner or the overdue band does.
//
// Choosing which ink goes on top is not an adjustment to your colour — the
// ground stays exactly what you chose; only the writing over it changes.
//
// Anything under 4.5:1 is flagged, with plain words about what will be hard
// to read. Then it's your call, and the button says so.

import { el } from "../views/shared.js";
import { colorReport, isHex, resolveHex } from "../theme.js";

// opts:
//   value        current colour — hex, palette name, or null
//   fallback     the hex to show in the picker when value is null
//   onChange(hex)  called when a colour is committed
//   onReset()      called by the reset button; omit to hide the button
//   resetLabel   text for that button
//   note         a line of explanation under the control
export function colorField(opts = {}) {
  const {
    value = null, fallback = "#b23a14",
    onChange, onReset, resetLabel = "Reset", note = null,
  } = opts;

  const start = value ? resolveHex(value, fallback) : fallback;

  const swatch = el("input", {
    type: "color", value: start,
    class: "cf-swatch", "aria-label": "Pick a colour",
    oninput: (e) => sync(e.target.value, "swatch"),
    onchange: (e) => commit(e.target.value),
  });

  const hex = el("input", {
    type: "text", value: start,
    class: "cf-hex", "aria-label": "Hex colour code",
    spellcheck: "false", autocapitalize: "off", autocomplete: "off",
    placeholder: "#B23A14",
    oninput: (e) => {
      const v = normalise(e.target.value);
      if (isHex(v)) sync(v, "hex");
    },
    onchange: (e) => {
      const v = normalise(e.target.value);
      if (isHex(v)) commit(v);
      else { e.target.value = current; sync(current, "hex"); }   // put back what was there
    },
  });

  const readout = el("div", { class: "cf-readout" });
  const wrap = el("div", { class: "cf" }, [
    el("div", { class: "cf-row" }, [
      swatch, hex,
      onReset ? el("button", {
        type: "button", class: "btn", text: resetLabel,
        onclick: () => { onReset(); },
      }) : null,
    ]),
    readout,
    note ? el("p", { class: "hint", text: note }) : null,
  ]);

  let current = start;

  // A hex with a missing "#", or in caps, or with stray spaces, is what a
  // person actually types. Accept all of it.
  function normalise(v) {
    const s = String(v || "").trim();
    return s && s[0] !== "#" ? "#" + s : s;
  }

  // Live preview of the report as you drag the system picker. Does NOT write
  // anything — that's commit's job — so scrubbing through a spectrum doesn't
  // fire a hundred store writes.
  function sync(v, from) {
    current = v;
    if (from !== "swatch") swatch.value = v;
    if (from !== "hex") hex.value = v.toUpperCase();
    drawReport(v);
  }

  function commit(v) {
    const n = normalise(v);
    if (!isHex(n)) return;
    sync(n, null);
    if (onChange) onChange(n);
  }

  function drawReport(v) {
    readout.innerHTML = "";
    const r = colorReport(v);

    readout.appendChild(row("As small text", r.asText, r.textOk,
      "on the paper ground — labels, dates, an overdue heading"));
    readout.appendChild(row("As a block", r.asBlock, r.blockOk,
      "with Dash's most readable ink written on it"));

    if (!r.textOk || !r.blockOk) {
      const parts = [];
      if (!r.textOk) parts.push("small labels in this colour will be hard to read");
      if (!r.blockOk) parts.push("writing on a block of this colour will be hard to read");
      readout.appendChild(el("p", { class: "cf-warn" }, [
        el("span", { class: "cf-warn-mark", text: "!" }),
        el("span", { text: `Below the AA readability floor — ${parts.join(", and ")}. It's still yours to use.` }),
      ]));
    }
  }

  function row(label, ratio, ok, why) {
    return el("div", { class: "cf-line" + (ok ? "" : " is-low") }, [
      el("span", { class: "lbl", text: label }),
      el("span", { class: "num cf-ratio", text: `${ratio.toFixed(2)}:1` }),
      el("span", { class: "lbl lbl-faint cf-why", text: ok ? why : `${why} — too low` }),
    ]);
  }

  drawReport(start);
  return wrap;
}
