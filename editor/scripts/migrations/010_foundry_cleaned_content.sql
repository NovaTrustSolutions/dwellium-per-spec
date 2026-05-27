-- 010_foundry_cleaned_content.sql
-- Add cleaned_content to foundry_items so the Triage Agent can strip
-- scrape noise (cookie banners, nav menus, ads, image markdown, "Related
-- Articles" footers, etc.) at triage time rather than punting cleanup
-- to Andy at Approve time.
--
-- The previous flow stored only metadata on the row; Approve wrote
-- `raw_content` to disk. This forced Andy to either accept the noise
-- into the Codex or hit Edit-then-Approve on every URL capture. Storing
-- the agent's cleaned version means:
--   • Approve (no edit) writes the clean version automatically
--   • The Review UI's preview shows what will actually be written
--   • Edit-then-Approve starts from the clean version (less editing)
--
-- `cleaned_content` is nullable — older rows (and paste captures where
-- cleaning was a no-op) keep it NULL and the renderer falls back to
-- raw_content gracefully. IDEMPOTENT.

BEGIN;

ALTER TABLE foundry_items
  ADD COLUMN IF NOT EXISTS cleaned_content TEXT;

COMMIT;
