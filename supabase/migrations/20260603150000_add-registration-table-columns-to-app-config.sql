-- Admin "Registrations" table column order + visibility, shared globally across
-- all admins. Stored as a JSONB array on the singleton eckcm_app_config row.
-- Shape: [{ "id": "code", "visible": true }, { "id": "name", "visible": true }, ...]
-- NULL means "use the code default order/visibility", so existing installs need
-- no backfill and newly-added columns are reconciled in by the UI.
ALTER TABLE eckcm_app_config
  ADD COLUMN IF NOT EXISTS registration_table_columns jsonb;

COMMENT ON COLUMN eckcm_app_config.registration_table_columns IS
  'Admin registrations table column layout (global). Ordered array of { id: string, visible: boolean }. NULL = use code default. Reconciled against current column set by the UI.';
