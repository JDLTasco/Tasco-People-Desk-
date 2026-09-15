-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "close_reason" ADD VALUE 'AUTOCLOSE';
ALTER TYPE "close_reason" ADD VALUE 'MERGED';

-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "merged_into_ticket_id" UUID;

-- CreateIndex
CREATE INDEX "tickets_merged_into_ticket_id_idx" ON "tickets"("merged_into_ticket_id");

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_merged_into_ticket_id_fkey" FOREIGN KEY ("merged_into_ticket_id") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
