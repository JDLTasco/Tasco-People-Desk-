-- Business calendar (John, 2026-10-03): non-working days for the automatic
-- target due date -- Victorian public holidays + Tasco shutdowns, managed on
-- Admin -> Calendar. Seeded with the 2026-2027 Victorian public holidays
-- (same list as lib/calendar/vic-holidays.ts). Idempotent inserts.
-- Existing tickets' target dates are NOT recalculated.

CREATE TABLE "non_working_days" (
    "id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "is_recurring" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "non_working_days_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "non_working_days_date_key" ON "non_working_days"("date");

-- Covered by the default privileges from 20260915060006 when run as the
-- migration role; granted explicitly as well in case it isn't.
GRANT SELECT, INSERT, UPDATE, DELETE ON "non_working_days" TO app_role;

INSERT INTO "non_working_days" ("id", "date", "name") VALUES
  (gen_random_uuid(), '2026-01-01', 'New Year''s Day'),
  (gen_random_uuid(), '2026-01-26', 'Australia Day'),
  (gen_random_uuid(), '2026-03-09', 'Labour Day'),
  (gen_random_uuid(), '2026-04-03', 'Good Friday'),
  (gen_random_uuid(), '2026-04-04', 'Easter Saturday'),
  (gen_random_uuid(), '2026-04-05', 'Easter Sunday'),
  (gen_random_uuid(), '2026-04-06', 'Easter Monday'),
  (gen_random_uuid(), '2026-04-25', 'ANZAC Day'),
  (gen_random_uuid(), '2026-06-08', 'King''s Birthday'),
  (gen_random_uuid(), '2026-09-25', 'AFL Grand Final Friday'),
  (gen_random_uuid(), '2026-11-03', 'Melbourne Cup Day'),
  (gen_random_uuid(), '2026-12-25', 'Christmas Day'),
  (gen_random_uuid(), '2026-12-26', 'Boxing Day'),
  (gen_random_uuid(), '2026-12-28', 'Boxing Day (additional holiday)'),
  (gen_random_uuid(), '2027-01-01', 'New Year''s Day'),
  (gen_random_uuid(), '2027-01-26', 'Australia Day'),
  (gen_random_uuid(), '2027-03-08', 'Labour Day'),
  (gen_random_uuid(), '2027-03-26', 'Good Friday'),
  (gen_random_uuid(), '2027-03-27', 'Easter Saturday'),
  (gen_random_uuid(), '2027-03-28', 'Easter Sunday'),
  (gen_random_uuid(), '2027-03-29', 'Easter Monday'),
  (gen_random_uuid(), '2027-04-25', 'ANZAC Day'),
  (gen_random_uuid(), '2027-06-14', 'King''s Birthday'),
  (gen_random_uuid(), '2027-11-02', 'Melbourne Cup Day'),
  (gen_random_uuid(), '2027-12-25', 'Christmas Day'),
  (gen_random_uuid(), '2027-12-26', 'Boxing Day'),
  (gen_random_uuid(), '2027-12-27', 'Christmas Day (additional holiday)'),
  (gen_random_uuid(), '2027-12-28', 'Boxing Day (additional holiday)')
ON CONFLICT ("date") DO NOTHING;
