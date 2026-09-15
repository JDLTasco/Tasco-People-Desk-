// Seeds the two administrator-maintained lookup tables (build spec §5).
// Categories/business units are never deleted, only deactivated -- this
// seed is safe to re-run (upsert by unique name).
import { PrismaClient } from "@prisma/client";
import { ticketNoWithSequence } from "../lib/ingestion/ticket-number";
import { melbourneDateOnly } from "../lib/timezone";
import { SYSTEM_ENTRA_OBJECT_ID } from "../lib/ingestion/process-message";

const prisma = new PrismaClient();

const CATEGORIES = [
  "Recruitment",
  "Payroll",
  "Leave",
  "Workers Compensation",
  "Return to Work",
  "Employee Relations",
  "Performance",
  "Training",
  "Compliance",
  "Other",
];

const BUSINESS_UNITS = ["Head Office", "Retail", "Transport", "Depots", "Other"];

// Mock users for the dev-mock auth provider (build spec §16: Stages 1-3
// "proceed... using seeded data and a mocked auth provider" -- §14's real
// Entra security groups don't exist yet). Only the initials and roles §3
// actually specifies are used here -- no full names are invented. Real
// accounts get created automatically from real Entra claims once §14
// lands (see lib/auth.ts's jwt callback); these rows exist for local/dev
// sign-in only, entraObjectId deliberately prefixed "mock-" so a real
// Entra object ID can never collide with one.
const MOCK_USERS = [
  { initials: "RJ", role: "HR_LEAD" as const },
  { initials: "LF", role: "HR_OFFICER" as const },
  { initials: "DN", role: "HR_OFFICER" as const },
  { initials: "JDL", role: "ADMIN" as const },
  { initials: "RGL", role: "ADMIN" as const },
];

// SLA hours by priority (§8).
const SLA_HOURS: Record<string, number> = { P1: 48, P2: 168, P3: 336 };

function purgeDate(requestDate: Date): Date {
  const d = new Date(requestDate);
  d.setUTCFullYear(d.getUTCFullYear() + 7);
  return d;
}

async function main() {
  for (let index = 0; index < CATEGORIES.length; index++) {
    await prisma.category.upsert({
      where: { name: CATEGORIES[index] },
      update: {},
      create: { name: CATEGORIES[index], sortOrder: index },
    });
  }

  for (let index = 0; index < BUSINESS_UNITS.length; index++) {
    await prisma.businessUnit.upsert({
      where: { name: BUSINESS_UNITS[index] },
      update: {},
      create: { name: BUSINESS_UNITS[index], sortOrder: index },
    });
  }

  for (const mockUser of MOCK_USERS) {
    const entraObjectId = `mock-${mockUser.initials.toLowerCase()}`;
    await prisma.user.upsert({
      where: { entraObjectId },
      update: {},
      create: {
        entraObjectId,
        upn: `${mockUser.initials.toLowerCase()}@mock.local`,
        displayName: mockUser.initials,
        initials: mockUser.initials,
        role: mockUser.role,
      },
    });
  }

  // The system actor for automated ingestion (§7.3, §7.3.1) -- audit_log
  // and ticket_notes both require a real actor/author, and the spec never
  // names one, so this is a real, deliberately-seeded row rather than
  // something invented ad hoc in ingestion code. Not a real Entra
  // account; filtered out of user-facing pickers (app/api/users/route.ts)
  // by this same entraObjectId. role must be a real UserRole value (the
  // enum has no "system" option) -- ADMIN is used here only because the
  // system account is never signed in as and never reaches any
  // permission check, not because it should be treated as one.
  await prisma.user.upsert({
    where: { entraObjectId: SYSTEM_ENTRA_OBJECT_ID },
    update: {},
    create: {
      entraObjectId: SYSTEM_ENTRA_OBJECT_ID,
      upn: "system@internal",
      displayName: "System",
      initials: "SYS",
      role: "ADMIN",
    },
  });

  // A couple of suppression rules (§7.0.1) for Stage 4's ingestion testing
  // -- the admin UI to manage these is a later stage; this is dev/test
  // seed data only, same convention as categories/business units/users above.
  const suppressionFixtures: { type: "SENDER" | "DOMAIN" | "SUBJECT_PATTERN"; value: string }[] = [
    { type: "DOMAIN", value: "noisy-newsletter.example.com" },
    { type: "SUBJECT_PATTERN", value: "out of office" },
  ];
  for (const rule of suppressionFixtures) {
    const existing = await prisma.suppressionRule.findFirst({ where: { type: rule.type, value: rule.value } });
    if (!existing) {
      await prisma.suppressionRule.create({ data: rule });
    }
  }

  // Fixture tickets for Stage 3's UI/state-machine work. Real ingestion
  // (§7) is Stage 4 -- until then, nothing else can create a ticket.
  // Deliberately synthetic requester identities, never real people.
  const users = Object.fromEntries(
    (await prisma.user.findMany({ where: { entraObjectId: { startsWith: "mock-" } } })).map((u) => [u.initials, u]),
  );
  const categories = Object.fromEntries((await prisma.category.findMany()).map((c) => [c.name, c]));
  const businessUnits = Object.fromEntries((await prisma.businessUnit.findMany()).map((b) => [b.name, b]));

  const now = new Date();
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000);

  interface Fixture {
    seq: number;
    receivedAt: Date;
    subject: string;
    requesterName: string;
    requesterEmail: string;
    priority: "P1" | "P2" | "P3";
    status: "NEW" | "ALLOCATED" | "IN_ACTION" | "OUTCOME" | "CLOSED";
    categoryName?: string;
    businessUnitName?: string;
    assigneeInitials?: string;
    isConfidential?: boolean;
    confidentialSetByInitials?: string;
    closeReason?: "RESOLVED" | "NOT_A_REQUEST";
    note?: { authorInitials: string; body: string };
  }

  const fixtures: Fixture[] = [
    {
      seq: 1,
      receivedAt: hoursAgo(3),
      subject: "Urgent -- need help with super contribution query",
      requesterName: "Test Requester One",
      requesterEmail: "test-requester-1@example.com",
      priority: "P1",
      status: "NEW",
    },
    {
      seq: 2,
      receivedAt: hoursAgo(30),
      subject: "Payroll deduction question",
      requesterName: "Test Requester Two",
      requesterEmail: "test-requester-2@example.com",
      priority: "P2",
      status: "ALLOCATED",
      categoryName: "Payroll",
      businessUnitName: "Retail",
      assigneeInitials: "LF",
    },
    {
      seq: 3,
      receivedAt: hoursAgo(72),
      subject: "Parental leave request",
      requesterName: "Test Requester Three",
      requesterEmail: "test-requester-3@example.com",
      priority: "P3",
      status: "IN_ACTION",
      categoryName: "Leave",
      businessUnitName: "Depots",
      assigneeInitials: "DN",
      note: { authorInitials: "DN", body: "Called requester, confirming dates with their manager." },
    },
    {
      seq: 4,
      receivedAt: hoursAgo(5),
      subject: "Newsletter subscription (spam)",
      requesterName: "Test Requester Four",
      requesterEmail: "test-requester-4@example.com",
      priority: "P3",
      status: "CLOSED",
      closeReason: "NOT_A_REQUEST",
    },
    {
      // P1, received 60h ago -- past its 48h SLA, so this shows in Overdue.
      seq: 5,
      receivedAt: hoursAgo(60),
      subject: "Workplace grievance -- please treat carefully",
      requesterName: "Test Requester Five",
      requesterEmail: "test-requester-5@example.com",
      priority: "P1",
      status: "ALLOCATED",
      categoryName: "Employee Relations",
      assigneeInitials: "RJ",
      isConfidential: true,
      confidentialSetByInitials: "RJ",
    },
  ];

  for (const fixture of fixtures) {
    const requestDate = melbourneDateOnly(fixture.receivedAt);
    const slaDueAt = new Date(fixture.receivedAt.getTime() + SLA_HOURS[fixture.priority] * 60 * 60 * 1000);
    const assignee = fixture.assigneeInitials ? users[fixture.assigneeInitials] : undefined;
    const fixtureTicketNo = ticketNoWithSequence(fixture.receivedAt, fixture.seq);

    const ticket = await prisma.ticket.upsert({
      where: { ticketNo: fixtureTicketNo },
      update: {},
      create: {
        ticketNo: fixtureTicketNo,
        originalSubject: fixture.subject,
        subject: fixture.subject,
        requesterEmail: fixture.requesterEmail,
        requesterName: fixture.requesterName,
        ccRecipients: [],
        receivedAt: fixture.receivedAt,
        requestDate,
        categoryId: fixture.categoryName ? categories[fixture.categoryName].id : null,
        businessUnitId: fixture.businessUnitName ? businessUnits[fixture.businessUnitName].id : null,
        priority: fixture.priority,
        slaDueAt,
        status: fixture.status,
        assignedToId: assignee?.id,
        assignedAt: assignee ? fixture.receivedAt : undefined,
        closeReason: fixture.closeReason,
        closedAt: fixture.closeReason ? now : undefined,
        isConfidential: fixture.isConfidential ?? false,
        confidentialSetById: fixture.confidentialSetByInitials ? users[fixture.confidentialSetByInitials].id : undefined,
        confidentialSetAt: fixture.confidentialSetByInitials ? fixture.receivedAt : undefined,
        retentionPurgeDate: purgeDate(requestDate),
        messages: {
          create: {
            direction: "INBOUND",
            messageType: "ORIGINAL",
            fromAddress: fixture.requesterEmail,
            fromName: fixture.requesterName,
            toRecipients: ["humanresources@tascopetroleum.com.au"],
            ccRecipients: [],
            subject: fixture.subject,
            bodyText: `(Fixture data, Stage 3 -- no real Graph ingestion yet.) ${fixture.subject}`,
            receivedAt: fixture.receivedAt,
            correlationId: crypto.randomUUID(),
          },
        },
      },
    });

    if (fixture.note) {
      const existingNote = await prisma.ticketNote.findFirst({ where: { ticketId: ticket.id } });
      if (!existingNote) {
        await prisma.ticketNote.create({
          data: {
            ticketId: ticket.id,
            authorId: users[fixture.note.authorInitials].id,
            body: fixture.note.body,
          },
        });
      }
    }
  }

  console.log(
    `Seeded ${CATEGORIES.length} categories, ${BUSINESS_UNITS.length} business units, ${MOCK_USERS.length} mock users, ` +
      `1 system user, ${suppressionFixtures.length} suppression rules, and ${fixtures.length} fixture tickets.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
