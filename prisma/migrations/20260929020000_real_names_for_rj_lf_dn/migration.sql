-- Data-only migration (John, 2026-09-29): the RJ/LF/DN rows were seeded
-- with their initials as display name (no names were invented at seed
-- time) and later relinked to Roxanne Jones / Lisa Ferguson / Dianne
-- Nichols. Their display name only updates on their own first real
-- sign-in, so John asked for the full names now.
-- Only touches a row whose display name is still the placeholder (the
-- initials, or "Operator XX"), so a name already set by sign-in or by
-- Admin -> Users is never overwritten. Each rename is audited as the
-- System user, same action as an Admin -> Users rename.

WITH names(initials, full_name) AS (
  VALUES ('RJ', 'Roxanne Jones'), ('LF', 'Lisa Ferguson'), ('DN', 'Dianne Nichols')
),
targets AS (
  SELECT u.id, u.display_name AS old_name, n.full_name
  FROM users u
  JOIN names n ON u.initials = n.initials
  WHERE u.display_name = n.initials OR u.display_name ILIKE 'operator ' || n.initials
),
renamed AS (
  UPDATE users u
  SET display_name = t.full_name
  FROM targets t
  WHERE u.id = t.id
  RETURNING u.id, t.old_name, t.full_name
)
INSERT INTO audit_log (id, actor_id, action, entity, entity_id, before_json, after_json, reason, correlation_id, created_at)
SELECT gen_random_uuid(), s.id, 'USER_DISPLAY_NAME_CHANGED', 'user', r.id::text,
       jsonb_build_object('displayName', r.old_name), jsonb_build_object('displayName', r.full_name),
       'Placeholder initials replaced with full name at operator request (migration)', gen_random_uuid(), now()
FROM renamed r
CROSS JOIN (SELECT id FROM users WHERE entra_object_id = 'system') s;
