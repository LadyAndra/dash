// readaloud.js — voice OUT (§10). Uses the browser's built-in, on-device
// SpeechSynthesis: zero-cost, private, and directly serves "prefer being
// told over visually scanning" for eye strain. Any item or list can be read.

let speaking = false;

export function readAloud(text) {
  if (!("speechSynthesis" in window)) return false;
  const synth = window.speechSynthesis;
  if (speaking) { synth.cancel(); speaking = false; return true; }
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.0; u.pitch = 1.0;
  u.onend = () => { speaking = false; };
  u.oncancel = () => { speaking = false; };
  speaking = true;
  synth.speak(u);
  return true;
}

export function stopReading() {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  speaking = false;
}

// Turn an item into a natural spoken summary.
export function itemToSpeech(item, store) {
  const typeLabel = store.typeDef(item.type)?.label || item.type;
  const statusLabel = store.statusDef(item.status)?.label || item.status;
  const parts = [
    item.title || "Untitled",
    `${typeLabel}, ${statusLabel}.`,
  ];
  if (item.tags.length) parts.push(`Tagged ${item.tags.join(", ")}.`);
  if (item.body) parts.push(item.body);
  return parts.join(" ");
}
