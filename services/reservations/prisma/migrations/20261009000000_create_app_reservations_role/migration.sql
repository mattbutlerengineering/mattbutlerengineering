-- Single statement. Prisma 7.10 split_script_into_statements keeps a leading
-- line comment on the following statement and does not split inside a
-- dollar-quoted body. CREATE ROLE is cluster-global, so a shadow-database
-- replay must swallow 42710 duplicate_object.
DO $$
BEGIN
  CREATE ROLE app_reservations NOLOGIN NOINHERIT;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END
$$;
