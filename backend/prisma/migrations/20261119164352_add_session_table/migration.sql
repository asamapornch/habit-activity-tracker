-- Additive only: adds the session store table used by connect-pg-simple
-- (backend/src/lib/session.ts). Does not alter any existing table.
-- Schema matches connect-pg-simple's own table.sql exactly, so
-- createTableIfMissing stays false and this migration is the single
-- source of truth for the table shape.
CREATE TABLE "session" (
  "sid" varchar NOT NULL,
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL
);

ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;

CREATE INDEX "IDX_session_expire" ON "session" ("expire");
