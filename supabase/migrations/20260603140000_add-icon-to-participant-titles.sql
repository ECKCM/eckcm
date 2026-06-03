-- Optional icon shown before a participant title's label on name badges.
-- Stores a curated Lucide icon name (e.g. 'star', 'shield', 'mic'); NULL = none.

ALTER TABLE eckcm_participant_titles
  ADD COLUMN IF NOT EXISTS icon text;

COMMENT ON COLUMN eckcm_participant_titles.icon IS
  'Optional Lucide icon name rendered before the title label on badges. NULL = no icon.';
