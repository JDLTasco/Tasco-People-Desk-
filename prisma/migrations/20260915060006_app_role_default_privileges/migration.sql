-- Fixes a real gap found in Stage 4: the original audit_log_grants
-- migration (Stage 1) granted app_role CRUD "ON ALL TABLES IN SCHEMA
-- public", but that only covers tables that existed at the moment it ran.
-- graph_delta_state (this stage's own new table) had NO grant for
-- app_role at all until this migration -- the app would have gotten
-- "permission denied" trying to use it.
--
-- Fixed two ways: (1) explicitly grant on every table that exists now,
-- (2) ALTER DEFAULT PRIVILEGES so every table any FUTURE migration
-- creates (as the same migration role) gets the grant automatically,
-- so this can't quietly recur every time a later stage adds a table.
-- audit_log's own append-only restriction is untouched by either --
-- default privileges only apply to tables that don't exist yet, and
-- audit_log already exists with its REVOKE already in place.

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_role;

REVOKE UPDATE, DELETE ON audit_log FROM app_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_role;
