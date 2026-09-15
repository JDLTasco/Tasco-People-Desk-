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

/** A UTC-midnight Date representing the Melbourne calendar date -- what a Postgres `date` column (no timezone) should receive. */
export function melbourneDateOnly(date: Date): Date {
  const { year, month, day } = melbourneParts(date);
  return new Date(Date.UTC(year, month - 1, day));
}
