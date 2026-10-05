-- Admin-chosen staff colour (John, 2026-10-05). NULL = automatic (the slot
-- from the user's position in the user list, lib/users/colours.ts); 0-9 =
-- one of the colours in lib/users/colour-names.ts / globals.css.
ALTER TABLE "users" ADD COLUMN "colour_slot" INTEGER;
ALTER TABLE "users" ADD CONSTRAINT "users_colour_slot_range" CHECK ("colour_slot" IS NULL OR ("colour_slot" BETWEEN 0 AND 9));

-- John asked for Dianne Nichols to be purple (slot 4). Audited as the System
-- user, same action as a change made on Admin -> Users.
WITH changed AS (
  UPDATE users SET colour_slot = 4
  WHERE display_name = 'Dianne Nichols' AND entra_object_id <> 'system'
  RETURNING id
)
INSERT INTO audit_log (id, actor_id, action, entity, entity_id, before_json, after_json, reason, correlation_id, created_at)
SELECT gen_random_uuid(), s.id, 'USER_COLOUR_CHANGED', 'user', c.id::text,
       jsonb_build_object('colourSlot', NULL), jsonb_build_object('colourSlot', 4),
       'Colour set to Purple at operator request (migration)', gen_random_uuid(), now()
FROM changed c
CROSS JOIN (SELECT id FROM users WHERE entra_object_id = 'system') s;
