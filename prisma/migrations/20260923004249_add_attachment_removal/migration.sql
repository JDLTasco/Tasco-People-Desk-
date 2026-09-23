-- AlterTable
ALTER TABLE "ticket_attachments" ADD COLUMN     "remove_reason" TEXT,
ADD COLUMN     "removed_at" TIMESTAMP(3),
ADD COLUMN     "removed_by" UUID;

-- AddForeignKey
ALTER TABLE "ticket_attachments" ADD CONSTRAINT "ticket_attachments_removed_by_fkey" FOREIGN KEY ("removed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
