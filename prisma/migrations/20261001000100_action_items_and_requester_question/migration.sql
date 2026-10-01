-- Operator additions (John, 2026-10-01).

-- AlterEnum: an officer's mid-investigation question to the requester.
ALTER TYPE "message_type" ADD VALUE 'REQUESTER_QUESTION';

-- CreateTable: admin-managed action items (labels on an IN_ACTION ticket).
CREATE TABLE "action_statuses" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "action_statuses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "action_statuses_name_key" ON "action_statuses"("name");

ALTER TABLE "action_statuses" ADD CONSTRAINT "action_statuses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "tickets" ADD COLUMN "action_status_id" UUID;

CREATE INDEX "tickets_action_status_id_idx" ON "tickets"("action_status_id");

ALTER TABLE "tickets" ADD CONSTRAINT "tickets_action_status_id_fkey" FOREIGN KEY ("action_status_id") REFERENCES "action_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed the one item John asked for.
INSERT INTO "action_statuses" ("id", "name", "sort_order") VALUES (gen_random_uuid(), 'On Hold', 0);

-- A label only means something while the ticket is IN_ACTION. Any UPDATE
-- that changes status without also setting a new label clears it, so none
-- of the many status-changing routes (closes, outcome, merge, reversal,
-- awaiting response, ...) can leave a stale label behind.
CREATE FUNCTION "clear_action_status_on_status_change"() RETURNS trigger AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.action_status_id IS NOT DISTINCT FROM OLD.action_status_id THEN
    NEW.action_status_id := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "tickets_clear_action_status"
  BEFORE UPDATE OF "status" ON "tickets"
  FOR EACH ROW EXECUTE FUNCTION "clear_action_status_on_status_change"();
