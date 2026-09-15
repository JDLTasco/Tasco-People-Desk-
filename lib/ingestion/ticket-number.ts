import { melbourneParts } from "../timezone";

// §5, §7.3: "YYMMDDHHMM plus a 2-digit sequence starting 01 for
// same-minute collisions." This produces the 10-digit base; the sequence
// suffix (and the actual collision retry, which needs the database) lives
// in lib/ingestion/create-ticket.ts.
export function ticketNoBase(receivedAt: Date): string {
  const { year, month, day, hour, minute } = melbourneParts(receivedAt);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(year % 100)}${pad(month)}${pad(day)}${pad(hour)}${pad(minute)}`;
}

export function ticketNoWithSequence(receivedAt: Date, sequence: number): string {
  return `${ticketNoBase(receivedAt)}${String(sequence).padStart(2, "0")}`;
}
