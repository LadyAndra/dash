// ulid.js — tiny ULID generator (§2.1)
// ULIDs are unique + time-sortable + generated fully offline with no
// coordination between devices. That's exactly what we need: any device
// can mint an id while on a plane and it will never collide with another.
// (Self-contained, no dependency, so nothing to vendor.)

const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32
const ENCODING_LEN = ENCODING.length;
const TIME_LEN = 10;
const RANDOM_LEN = 16;

function randomChar() {
  return ENCODING[Math.floor(Math.random() * ENCODING_LEN)];
}

function encodeTime(now, len) {
  let str = "";
  for (let i = len - 1; i >= 0; i--) {
    const mod = now % ENCODING_LEN;
    str = ENCODING[mod] + str;
    now = (now - mod) / ENCODING_LEN;
  }
  return str;
}

export function ulid(seedTime) {
  const now = seedTime ?? Date.now();
  let rand = "";
  for (let i = 0; i < RANDOM_LEN; i++) rand += randomChar();
  return encodeTime(now, TIME_LEN) + rand;
}
