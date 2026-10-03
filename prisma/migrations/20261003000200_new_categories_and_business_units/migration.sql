-- Data-only migration (John, 2026-10-03): new categories and business
-- units, and the Transport business unit renamed to Carriers. Idempotent:
-- a name that already exists (any case) is left alone, and the rename only
-- happens if there is a "Transport" and no "Carriers" yet. Every change is
-- audited as the System user, with the same actions the Admin screens use.

-- 1. Business unit: Transport -> Carriers (row updated in place, so
--    existing tickets simply show the new name).
WITH renamed AS (
  UPDATE business_units
  SET name = 'Carriers'
  WHERE name = 'Transport'
    AND NOT EXISTS (SELECT 1 FROM business_units WHERE lower(name) = 'carriers')
  RETURNING id
)
INSERT INTO audit_log (id, actor_id, action, entity, entity_id, before_json, after_json, reason, correlation_id, created_at)
SELECT gen_random_uuid(), s.id, 'BUSINESS_UNIT_RENAMED', 'business_unit', r.id::text,
       jsonb_build_object('name', 'Transport'), jsonb_build_object('name', 'Carriers'),
       'Renamed at operator request (migration)', gen_random_uuid(), now()
FROM renamed r
CROSS JOIN (SELECT id FROM users WHERE entra_object_id = 'system') s;

-- 2. New business units (dropdowns sort them alphabetically).
WITH wanted(name, n) AS (
  VALUES ('Albury Office', 1), ('Sky Garden', 2), ('Garment Gallery', 3)
),
base AS (SELECT COALESCE(MAX(sort_order), -1) AS m FROM business_units),
created AS (
  INSERT INTO business_units (id, name, sort_order, is_active, created_at)
  SELECT gen_random_uuid(), w.name, base.m + w.n, true, now()
  FROM wanted w CROSS JOIN base
  WHERE NOT EXISTS (SELECT 1 FROM business_units b WHERE lower(b.name) = lower(w.name))
  RETURNING id, name
)
INSERT INTO audit_log (id, actor_id, action, entity, entity_id, before_json, after_json, reason, correlation_id, created_at)
SELECT gen_random_uuid(), s.id, 'BUSINESS_UNIT_CREATED', 'business_unit', c.id::text,
       NULL, jsonb_build_object('name', c.name),
       'Added at operator request (migration)', gen_random_uuid(), now()
FROM created c
CROSS JOIN (SELECT id FROM users WHERE entra_object_id = 'system') s;

-- 3. New categories, added before "Other" so it stays last in the list.
WITH wanted(name, n) AS (
  VALUES ('Terminations/Resignations', 1), ('Incidents', 2), ('Staff Details', 3)
),
base AS (SELECT COALESCE(MAX(sort_order), -1) AS m FROM categories),
created AS (
  INSERT INTO categories (id, name, sort_order, is_active, created_at)
  SELECT gen_random_uuid(), w.name, base.m + w.n, true, now()
  FROM wanted w CROSS JOIN base
  WHERE NOT EXISTS (SELECT 1 FROM categories c WHERE lower(c.name) = lower(w.name))
  RETURNING id, name
)
INSERT INTO audit_log (id, actor_id, action, entity, entity_id, before_json, after_json, reason, correlation_id, created_at)
SELECT gen_random_uuid(), s.id, 'CATEGORY_CREATED', 'category', c.id::text,
       NULL, jsonb_build_object('name', c.name),
       'Added at operator request (migration)', gen_random_uuid(), now()
FROM created c
CROSS JOIN (SELECT id FROM users WHERE entra_object_id = 'system') s;

UPDATE categories
SET sort_order = (SELECT MAX(sort_order) + 1 FROM categories)
WHERE name = 'Other'
  AND sort_order < (SELECT MAX(sort_order) FROM categories);
