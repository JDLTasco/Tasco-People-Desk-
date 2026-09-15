-- Least-privilege application runtime role (build spec §5, §0.1.8).
--
-- The Next.js app connects as app_role, never as the migration role used
-- above (whatever DATABASE_URL's role is -- "postgres" locally, a separate
-- migration identity in Azure). app_role gets ordinary CRUD on every table
-- except audit_log, where it holds INSERT and SELECT only: "Append-only,
-- enforced at the database. The application's Postgres role holds INSERT
-- and SELECT on this table only -- no UPDATE, no DELETE grant. This is a
-- migration concern, not a code concern."
--
-- app_role's password is NOT set here -- a password belongs to a bootstrap
-- step (scripts/db-bootstrap-local.sh) or Key Vault/managed identity in
-- Azure, never inside a versioned migration file (§0.1.8: no secrets in
-- the repo). CREATE ROLE here is idempotent so this migration is safe to
-- re-run in any environment that already has the role.

DO
$$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_role') THEN
    CREATE ROLE app_role WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO app_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_role;

-- The one deliberate exception: audit_log is append-only at the database
-- level, not just by application convention.
REVOKE UPDATE, DELETE ON audit_log FROM app_role;
GRANT SELECT, INSERT ON audit_log TO app_role;
