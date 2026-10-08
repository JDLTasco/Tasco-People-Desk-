-- Employee's termination/resignation date on Terminations/Resignations
-- tickets (John, 2026-10-08), for the dashboard's Upcoming Terminations list.
-- NULL = not set. See lib/tickets/terminations.ts.
ALTER TABLE "tickets" ADD COLUMN "termination_date" DATE;
