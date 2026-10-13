-- Store the entry kind as its own column instead of a prompt prefix.
-- Additive: existing rows default to 'generate'; each legacy-prefixed row is then
-- reclassified at most once (single strip, matching the client's resolveEntry),
-- moving the prefix into `kind` and stripping it from `prompt`.
ALTER TABLE "stored_specs" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'generate';

UPDATE "stored_specs" SET "kind" = 'refine', "prompt" = substr("prompt", length('Refined: ') + 1)
  WHERE "kind" = 'generate' AND "prompt" LIKE 'Refined: %';
UPDATE "stored_specs" SET "kind" = 'failed', "prompt" = substr("prompt", length('Failed: ') + 1)
  WHERE "kind" = 'generate' AND "prompt" LIKE 'Failed: %';
UPDATE "stored_specs" SET "kind" = 'recover', "prompt" = substr("prompt", length('Recovered: ') + 1)
  WHERE "kind" = 'generate' AND "prompt" LIKE 'Recovered: %';
