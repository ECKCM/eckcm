-- Per-person church position (직분). Optional.
-- Values: MEMBER, DEACON, ELDER, MINISTER, PASTOR (matches ChurchRole TS type).
-- Collected by the registration/profile flow but until now never persisted.

ALTER TABLE eckcm_people
  ADD COLUMN IF NOT EXISTS church_role text;

ALTER TABLE eckcm_people
  DROP CONSTRAINT IF EXISTS eckcm_people_church_role_check;

ALTER TABLE eckcm_people
  ADD CONSTRAINT eckcm_people_church_role_check
  CHECK (church_role IS NULL OR church_role IN ('MEMBER','DEACON','ELDER','MINISTER','PASTOR'));
