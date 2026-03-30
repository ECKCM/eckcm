-- Seed AI summary rows in eckcm_legal_content
-- Run this once against your Supabase project

INSERT INTO eckcm_legal_content (slug, title, content, updated_at)
VALUES
  ('claude-summary-en', 'Claude Summary (EN)', '', now()),
  ('claude-summary-ko', 'Claude Summary (KO)', '', now()),
  ('chatgpt-summary-en', 'ChatGPT Summary (EN)', '', now()),
  ('chatgpt-summary-ko', 'ChatGPT Summary (KO)', '', now())
ON CONFLICT (slug) DO NOTHING;
