// Address book (John, 2026-10-03): every email address the People Desk has
// already seen -- requesters, people CC'd, anyone who emailed in, anyone HR
// emailed -- used to suggest addresses in the To/CC boxes, and listed on
// Admin -> Address book. Nothing is stored separately: it's derived from
// tickets and correspondence on the fly, so it's always current, and it
// respects §9 (addresses that only appear on confidential tickets a viewer
// can't see are never suggested to them).
import { prisma } from "./prisma";
import type { UserRole } from "./roles";
import { confidentialFilter } from "./tickets/queries";
import { HR_MAILBOX_ADDRESS } from "./email/send";

/** HR's own addresses are never suggested (we don't email ourselves). */
export const EXCLUDED_ADDRESSES = ["hrtickets@tascopetroleum.com.au", "humanresources@tascopetroleum.com.au"];

import type { AddressSource } from "./address-book-labels";
export { ADDRESS_SOURCE_LABELS, type AddressSource } from "./address-book-labels";

/** One sighting of an address, as read from a ticket or message. */
export interface AddressSighting {
  email: string;
  name?: string | null;
  source: AddressSource;
  ticketId: string;
  ticketNo: string;
  at: Date | null;
  /** Staff member who sent it (EMAILED_BY_HR only). */
  sentBy?: string | null;
}

export interface AddressEntry {
  email: string;
  name: string | null;
  sources: AddressSource[];
  ticketCount: number;
  tickets: { id: string; ticketNo: string }[];
  timesEmailedByHr: number;
  firstSeen: Date | null;
  lastSeen: Date | null;
  lastEmailedByHrAt: Date | null;
  lastEmailedByHrBy: string | null;
}

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Pure: combine sightings into one entry per address (case-insensitive), most-used first. */
export function aggregateAddresses(sightings: AddressSighting[], excluded: string[] = EXCLUDED_ADDRESSES): AddressEntry[] {
  const skip = new Set(excluded.map((e) => e.toLowerCase()));
  const byEmail = new Map<string, AddressEntry & { _ticketIds: Set<string>; _nameAt: number }>();

  for (const s of sightings) {
    const email = s.email.trim().toLowerCase();
    if (!email || skip.has(email) || !looksLikeEmail(email)) continue;
    let e = byEmail.get(email);
    if (!e) {
      e = {
        email,
        name: null,
        sources: [],
        ticketCount: 0,
        tickets: [],
        timesEmailedByHr: 0,
        firstSeen: null,
        lastSeen: null,
        lastEmailedByHrAt: null,
        lastEmailedByHrBy: null,
        _ticketIds: new Set(),
        _nameAt: -Infinity,
      };
      byEmail.set(email, e);
    }
    if (!e.sources.includes(s.source)) e.sources.push(s.source);
    if (!e._ticketIds.has(s.ticketId)) {
      e._ticketIds.add(s.ticketId);
      e.tickets.push({ id: s.ticketId, ticketNo: s.ticketNo });
    }
    const t = s.at?.getTime() ?? null;
    // Most recent real name wins (a name that is just the address doesn't count).
    const name = s.name?.trim();
    if (name && name.toLowerCase() !== email && (t ?? 0) >= e._nameAt) {
      e.name = name;
      e._nameAt = t ?? 0;
    }
    if (s.at) {
      if (!e.firstSeen || s.at < e.firstSeen) e.firstSeen = s.at;
      if (!e.lastSeen || s.at > e.lastSeen) e.lastSeen = s.at;
    }
    if (s.source === "EMAILED_BY_HR") {
      e.timesEmailedByHr++;
      if (s.at && (!e.lastEmailedByHrAt || s.at > e.lastEmailedByHrAt)) {
        e.lastEmailedByHrAt = s.at;
        e.lastEmailedByHrBy = s.sentBy ?? null;
      }
    }
  }

  return Array.from(byEmail.values())
    .map(({ _ticketIds, _nameAt, ...entry }) => ({ ...entry, ticketCount: _ticketIds.size }))
    .sort((a, b) => b.ticketCount - a.ticketCount || (b.lastSeen?.getTime() ?? 0) - (a.lastSeen?.getTime() ?? 0) || a.email.localeCompare(b.email));
}

/** Pure: suggestions for what's been typed so far -- matches the start of the address, name, or any word in the name. */
export function suggestAddresses(entries: AddressEntry[], query: string, limit = 8): { email: string; name: string | null }[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const score = (e: AddressEntry): number => {
    const name = (e.name ?? "").toLowerCase();
    if (e.email.startsWith(q)) return 0;
    if (name.startsWith(q)) return 1;
    if (name.split(/\s+/).some((w) => w.startsWith(q))) return 2;
    if (e.email.includes(q) || name.includes(q)) return 3;
    return -1;
  };
  return entries
    .map((e) => ({ e, s: score(e) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => a.s - b.s) // stable: keeps most-used first within a tier
    .slice(0, limit)
    .map(({ e }) => ({ email: e.email, name: e.name }));
}

/** Reads every sighting the viewer is allowed to see and aggregates it. */
export async function loadAddressBook(userId: string, role: UserRole): Promise<AddressEntry[]> {
  const tickets = await prisma.ticket.findMany({
    where: { isDeleted: false, ...confidentialFilter(userId, role) },
    select: {
      id: true,
      ticketNo: true,
      requesterEmail: true,
      requesterName: true,
      ccRecipients: true,
      receivedAt: true,
      messages: {
        select: {
          direction: true,
          messageType: true,
          fromAddress: true,
          fromName: true,
          toRecipients: true,
          ccRecipients: true,
          receivedAt: true,
          sentAt: true,
          sentBy: { select: { displayName: true } },
        },
      },
    },
  });

  const sightings: AddressSighting[] = [];
  for (const t of tickets) {
    const base = { ticketId: t.id, ticketNo: t.ticketNo };
    sightings.push({ ...base, email: t.requesterEmail, name: t.requesterName, source: "REQUESTER", at: t.receivedAt });
    for (const cc of t.ccRecipients) sightings.push({ ...base, email: cc, source: "CC", at: t.receivedAt });
    for (const m of t.messages) {
      if (m.direction === "INBOUND") {
        // A + New ticket entry (phone call, walk-in) is stored as an inbound
        // MANUAL message from the requester -- they didn't email HR.
        if (m.messageType !== "MANUAL") {
          sightings.push({ ...base, email: m.fromAddress, name: m.fromName, source: "EMAILED_IN", at: m.receivedAt });
        }
        for (const cc of m.ccRecipients) sightings.push({ ...base, email: cc, source: "CC", at: m.receivedAt });
      } else {
        for (const to of m.toRecipients) {
          sightings.push({ ...base, email: to, source: "EMAILED_BY_HR", at: m.sentAt, sentBy: m.sentBy?.displayName });
        }
        for (const cc of m.ccRecipients) {
          sightings.push({ ...base, email: cc, source: "EMAILED_BY_HR", at: m.sentAt, sentBy: m.sentBy?.displayName });
        }
      }
    }
  }
  return aggregateAddresses(sightings, [...EXCLUDED_ADDRESSES, HR_MAILBOX_ADDRESS]);
}
