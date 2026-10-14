-- Residual of 20261013000000_add_stored_spec_kind: clients cached from before
-- `kind` existed kept POSTing prefixed prompts, which were stored as
-- kind = 'generate' with the tag still in the prompt. Reclassify those rows with
-- the same single strip. Idempotent: once stripped, a row no longer matches, and
-- rows with an explicit kind are never touched (guarded by kind = 'generate').
UPDATE "stored_specs" SET "kind" = 'refine', "prompt" = substr("prompt", length('Refined: ') + 1)
  WHERE "kind" = 'generate' AND "prompt" LIKE 'Refined: _%';
UPDATE "stored_specs" SET "kind" = 'failed', "prompt" = substr("prompt", length('Failed: ') + 1)
  WHERE "kind" = 'generate' AND "prompt" LIKE 'Failed: _%';
UPDATE "stored_specs" SET "kind" = 'recover', "prompt" = substr("prompt", length('Recovered: ') + 1)
  WHERE "kind" = 'generate' AND "prompt" LIKE 'Recovered: _%';
