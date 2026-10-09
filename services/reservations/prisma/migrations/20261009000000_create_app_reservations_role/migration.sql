-- Single statement. Prisma 7.10 split_script_into_statements keeps a leading
-- line comment on the following statement, so this comment is not a second
-- statement. CREATE ROLE stays in its own file.
CREATE ROLE app_reservations NOLOGIN NOINHERIT;
