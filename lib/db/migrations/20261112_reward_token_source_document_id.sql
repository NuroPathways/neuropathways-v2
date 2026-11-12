-- Preserve exact document provenance for newly extracted goals.
-- Do not add a foreign key: the goal retains its source ID after document deletion.
ALTER TABLE reward_tokens
  ADD COLUMN IF NOT EXISTS source_document_id varchar;
