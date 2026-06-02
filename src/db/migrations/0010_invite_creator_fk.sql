-- TRU-312: link invite_tokens.creator_id to creators as a proper FK.
-- Column already exists (added in initial schema); this just adds the constraint.
-- Existing NULL values are allowed (FK constraints allow NULL by default in Postgres).
ALTER TABLE "invite_tokens"
  ADD CONSTRAINT "invite_tokens_creator_id_creators_id_fk"
  FOREIGN KEY ("creator_id") REFERENCES "creators"("id")
  ON DELETE SET NULL;
