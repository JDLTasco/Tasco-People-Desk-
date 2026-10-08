-- Each staff member's own dashboard arrangement: section order, widths and
-- hidden sections (John, 2026-10-08). NULL = the standard dashboard.
-- See lib/dashboard/layout.ts.
ALTER TABLE "users" ADD COLUMN "dashboard_layout" JSONB;
