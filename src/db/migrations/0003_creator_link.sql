ALTER TABLE "users" ADD COLUMN "creator_id" uuid REFERENCES creators(id) ON DELETE SET NULL;
CREATE INDEX "idx_users_creator_id" ON "users"("creator_id");

ALTER TABLE "invite_tokens" ADD COLUMN "creator_id" uuid REFERENCES creators(id) ON DELETE CASCADE;
