-- Beta-program screening fields (TRU-291)
-- Adds applicant name, telegram handle, and 5 screening questions.
-- All nullable so existing rows are unaffected.
ALTER TABLE "waitlist_signups" ADD COLUMN IF NOT EXISTS "name" text;
ALTER TABLE "waitlist_signups" ADD COLUMN IF NOT EXISTS "telegram_handle" text;
ALTER TABLE "waitlist_signups" ADD COLUMN IF NOT EXISTS "video_volume" text;
ALTER TABLE "waitlist_signups" ADD COLUMN IF NOT EXISTS "marketplace" text;
ALTER TABLE "waitlist_signups" ADD COLUMN IF NOT EXISTS "excel_hours" text;
ALTER TABLE "waitlist_signups" ADD COLUMN IF NOT EXISTS "feedback_commitment" text;
ALTER TABLE "waitlist_signups" ADD COLUMN IF NOT EXISTS "goal" text;
