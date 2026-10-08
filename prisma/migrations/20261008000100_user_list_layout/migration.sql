-- Each staff member's own ticket list column order + widths (John, 2026-10-08).
-- NULL = the default layout. See lib/tickets/list-layout.ts.
ALTER TABLE "users" ADD COLUMN "ticket_list_layout" JSONB;
