-- Enforce unique emails (PostgreSQL allows multiple NULLs in a UNIQUE index)
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users"("email");
