-- Collapse the participant title's English/Korean name into a single free-text
-- `name`. Titles are printed as-is on physical name badges, where an EN/KO split
-- is meaningless — a title is just one label in whatever language it happens to
-- be (e.g. "EM Leader" or "야영회장").

ALTER TABLE eckcm_participant_titles RENAME COLUMN name_en TO name;
ALTER TABLE eckcm_participant_titles DROP COLUMN IF EXISTS name_ko;

COMMENT ON COLUMN eckcm_participant_titles.name IS
  'Single free-text title label (any language), printed as-is on name badges.';
