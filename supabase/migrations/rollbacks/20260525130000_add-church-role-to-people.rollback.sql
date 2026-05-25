ALTER TABLE eckcm_people
  DROP CONSTRAINT IF EXISTS eckcm_people_church_role_check;

ALTER TABLE eckcm_people
  DROP COLUMN IF EXISTS church_role;
