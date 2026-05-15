-- Add booklet_url column to store the public URL of the uploaded booklet PDF
ALTER TABLE eckcm_app_config
  ADD COLUMN IF NOT EXISTS booklet_url text;
