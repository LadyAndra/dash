// settings.js — the in-app settings modal. Crucially this is where Types
// and Statuses are added/edited entirely in-app (§2.2, §13.2 #2) — no code,
// no config file. Also hosts the eye-strain controls: text-size slider and
// dark mode (§10), and the device label used in sync/merge notes.

import { el } from "./views/shared.js";
import { colorToken } from "./theme.js";
import { setTextScale, getTextScale, toggleDark } from "./theme.js";
import { getDeviceLabel, setDeviceLabel } from "./device.js";
import { toast } from "./ui/toast.js";

const COLOR_NAMES = ["green", "clay", "blue", "ochre", "plum", "slate", "gray"];
const ICONS = ["⚡", "◆", "◎", "•", "★", "❏", "✎", "◈", "❐", "▲"];

export function openSettings(store, sync) {
  const scrim = el("div", { class: "modal-scrim", onclick: (e) => { if (e.target === scrim) scrim.remove(); } });
  const modal = el("div", { class: "modal", role: "dialog", "aria-modal": "true", "aria-label": "Settings" });

  // ---- text size (eye strain §10) ----
  const scale = el("input", {
    type: "range", min: "0.9", max: "1.6", step: "0.05", value: String(getTextScale()),
    "aria-label": "Text size",
    oninput: (e) => setTextScale(e.target.value),
    style: "width:100%",
  });

  const darkBtn = el("button", { class: "btn", text: "Toggle light / dark", onclick: () => toggleDark() });

  // ---- device label ----
  const deviceInput = el("input", { type: "text", value: getDeviceLabel(), "aria-label": "Device name",
    onchange: (e) => { setDeviceLabel(e.target.value); toast("Device name saved.", "success"); } });

  // ---- types editor ----
  const typesWrap = el("div", {});
  function drawTypes() {
    typesWrap.innerHTML = "";
    for (const t of store.types()) {
      typesWrap.appendChild(el("div", { class: "finder-entry" }, [
        el("span", { style: `color:${colorToken(t.color)}`, text: `${t.icon || "•"} ${t.label}` }),
      ]));
    }
    typesWrap.appendChild(addRow("type", (def) => { store.addType(def); drawTypes(); }));
  }

  // ---- statuses editor ----
  const statusWrap = el("div", {});
  function drawStatuses() {
    statusWrap.innerHTML = "";
    for (const s of store.statuses()) {
      statusWrap.appendChild(el("div", { class: "finder-entry" }, [
        el("span", { style: `color:${colorToken(s.color)}`, text: s.label }),
      ]));
    }
    statusWrap.appendChild(addRow("status", (def) => { store.addStatus(def); drawStatuses(); }));
  }

  drawTypes();
  drawStatuses();

  // ---- Dropbox automatic sync ----
  const dbxWrap = el("div", {});
  function drawDropbox() {
    dbxWrap.innerHTML = "";
    const connected = sync && sync.mode === "dropbox" && sync.dbx;
    if (connected) {
      dbxWrap.append(
        el("div", { class: "sync-pill ok", style: "margin-bottom:var(--space-2)" }, [
          el("span", { class: "dot" }), el("span", { text: "Connected — syncing automatically on this device" }),
        ]),
        el("button", { class: "btn", text: "Disconnect Dropbox on this device", onclick: () => {
          if (confirm("Disconnect Dropbox on this device? Your data stays, but this device will stop syncing automatically until you reconnect.")) {
            sync.disconnectDropbox(); drawDropbox();
          }
        }}),
      );
    } else {
      const tokenInput = el("input", { type: "password", placeholder: "Paste your Dropbox access token", "aria-label": "Dropbox access token",
        autocomplete: "off", spellcheck: "false" });
      const connectBtn = el("button", { class: "btn btn-primary", text: "Connect", onclick: async () => {
        connectBtn.textContent = "Connecting…"; connectBtn.disabled = true;
        const okThis = await sync.connectDropbox(tokenInput.value);
        connectBtn.textContent = "Connect"; connectBtn.disabled = false;
        if (okThis) drawDropbox();
      }});
      dbxWrap.append(
        el("div", { class: "row", style: "align-items:flex-end" }, [
          el("div", { class: "field", style: "flex:1; margin:0" }, [tokenInput]),
          connectBtn,
        ]),
      );
    }
  }
  drawDropbox();

  modal.append(
    el("h2", { text: "Settings" }),
    field("Text size", scale, "Bigger text, less eye strain. Applies everywhere instantly."),
    field("Appearance", darkBtn),
    field("This device's name", deviceInput, "Shown in sync and merge notes so you can tell devices apart."),
    el("hr", { style: "border:none; border-top:1px solid var(--border); margin:var(--space-4) 0" }),
    field("Automatic sync (Dropbox)", dbxWrap, "Paste your Dropbox token once on each device. After that, Dash syncs across all your devices automatically — no buttons."),
    el("hr", { style: "border:none; border-top:1px solid var(--border); margin:var(--space-4) 0" }),
    field("Types", typesWrap, "Add your own item types. New types appear everywhere immediately."),
    field("Statuses", statusWrap, "Add your own statuses. Each status becomes a Kanban column."),
    el("div", { class: "modal-actions" }, [el("div", { class: "spacer" }), el("button", { class: "btn btn-primary", text: "Done", onclick: () => scrim.remove() })]),
  );

  scrim.appendChild(modal);
  document.body.appendChild(scrim);
}

function addRow(kind, onAdd) {
  const name = el("input", { type: "text", placeholder: `New ${kind} name`, "aria-label": `New ${kind} name`, style: "flex:2" });
  const iconSel = el("select", { "aria-label": "Icon", style: "flex:0 0 4rem" },
    ICONS.map(i => el("option", { value: i, text: i })));
  const colorSel = el("select", { "aria-label": "Color", style: "flex:1" },
    COLOR_NAMES.map(c => el("option", { value: c, text: c })));
  const add = el("button", { class: "btn", text: "Add", onclick: () => {
    const label = name.value.trim();
    if (!label) { name.focus(); return; }
    const key = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const def = kind === "type"
      ? { key, label, icon: iconSel.value, color: colorSel.value }
      : { key, label, color: colorSel.value };
    onAdd(def);
    name.value = "";
  }});
  const row = el("div", { class: "row", style: "align-items:flex-end; margin-top:var(--space-2)" }, [
    el("div", { class: "field", style: "flex:2; margin:0" }, [name]),
    kind === "type" ? el("div", { class: "field", style: "flex:0 0 4rem; margin:0" }, [iconSel]) : null,
    el("div", { class: "field", style: "flex:1; margin:0" }, [colorSel]),
    add,
  ]);
  return row;
}

function field(label, control, hint) {
  return el("div", { class: "field" }, [
    el("label", { text: label }),
    control,
    hint ? el("div", { class: "hint", text: hint }) : null,
  ]);
}
