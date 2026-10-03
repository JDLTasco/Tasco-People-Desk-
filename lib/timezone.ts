// Australia/Melbourne date/time parts, used for ticket numbers and
// request_date (§5, §7.3). Uses Node's built-in Intl -- no new dependency
// needed, and it's DST-correct (Melbourne observes daylight saving;
// `Intl.DateTimeFormat` with an IANA zone handles that automatically,
// which a fixed UTC+10/+11 offset would not).
export interface MelbourneParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number; // 0-23
  minute: number;
}

const formatter = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Melbourne",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function melbourneParts(date: Date): MelbourneParts {
  const parts = Object.fromEntries(formatter.formatToParts(date).map((p) => [p.type, p.value]));
  // Intl renders midnight as "24" in some environments' hour12:false output -- normalize to 0.
  const hour = parts.hour === "24" ? 0 : Number(parts.hour);
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour,
    minute: Number(parts.minute),
  };
}

/**
 * The UTC instant at which Melbourne's wall clock reads the given date and
 * time (DST-correct). Finds Melbourne's offset at that moment by asking Intl
 * what the wall clock shows for a first guess, then corrects; a second pass
 * settles the rare case where the guess straddles a daylight-saving change.
 * A wall time that doesn't exist (the skipped hour when clocks go forward)
 * resolves to an hour later, as clocks do.
 */
export function melbourneWallTimeToUtc(year: number, month: number, day: number, hour: number, minute: number): Date {
  const wanted = Date.UTC(year, month - 1, day, hour, minute);
  let guess = wanted - 10 * 60 * 60 * 1000; // AEST as a first guess
  for (let i = 0; i < 2; i++) {
    const p = melbourneParts(new Date(guess));
    const shown = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    guess += wanted - shown;
  }
  return new Date(guess);
}

/** A UTC-midnight Date representing the Melbourne calendar date -- what a Postgres `date` column (no timezone) should receive. */
export function melbourneDateOnly(date: Date): Date {
  const { year, month, day } = melbourneParts(date);
  return new Date(Date.UTC(year, month - 1, day));
}
