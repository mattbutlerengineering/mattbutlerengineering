-- Store the entry kind as its own column instead of a prompt prefix.
-- Additive: existing rows default to 'generate', then legacy prefixes are
-- moved into `kind` and stripped from `prompt`.
ALTER TABLE "stored_specs" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'generate';

UPDATE "stored_specs" SET "kind" = 'refine', "prompt" = substr("prompt", length('Refined: ') + 1)
  WHERE "prompt" LIKE 'Refined: %';
UPDATE "stored_specs" SET "kind" = 'failed', "prompt" = substr("prompt", length('Failed: ') + 1)
  WHERE "prompt" LIKE 'Failed: %';
UPDATE "stored_specs" SET "kind" = 'recover', "prompt" = substr("prompt", length('Recovered: ') + 1)
  WHERE "prompt" LIKE 'Recovered: %';
