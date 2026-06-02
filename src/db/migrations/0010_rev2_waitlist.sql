-- rev2 waitlist form: merge email+telegramHandle → contact, add storeUrl
-- email and brand become nullable (new form doesn't collect them separately)

ALTER TABLE "waitlist_signups" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "waitlist_signups" ALTER COLUMN "brand" DROP NOT NULL;
ALTER TABLE "waitlist_signups" ADD COLUMN IF NOT EXISTS "contact" text;
ALTER TABLE "waitlist_signups" ADD COLUMN IF NOT EXISTS "store_url" text;
