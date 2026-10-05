// dates.js: the three small date helpers that more than one file needs.
//
// These used to be written out twice, word for word, in views/calendar.js and
// widgets/flipdate.js. They live here now, and both of those files still
// re-export them under the same names, so nothing that imports them changed.
//
// Pure functions over plain numbers: no page, no state, nothing to set up.
// Dates are handled as { y, mo, d } with mo = 1..12 (not 0..11), and as
// "YYYY-MM-DD" text. Nothing here goes near toISOString(), which converts to
// UTC and can shift a date by a day (see milestones.js).

// "2026-10-05" -> { y: 2026, mo: 10, d: 5 }, or null when it is not that shape.
export function parseISO(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
  return m ? { y: +m[1], mo: +m[2], d: +m[3] } : null;
}

// (2026, 10, 5) -> "2026-10-05"
export function toISO(y, mo, d) {
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// Day 0 of the NEXT month is the last day of this one, which gets February
// and every leap year right without a rule about leap years.
export function daysInMonth(y, mo) {
  return new Date(y, mo, 0).getDate();
}
