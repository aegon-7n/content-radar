ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "creator_id" uuid REFERENCES creators(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "idx_users_creator_id" ON "users"("creator_id");

ALTER TABLE "invite_tokens" ADD COLUMN IF NOT EXISTS "creator_id" uuid REFERENCES creators(id) ON DELETE CASCADE;
