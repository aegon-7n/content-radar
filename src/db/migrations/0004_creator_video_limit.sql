-- TRU-22: add video_limit to creators for per-creator TU allocation (stub metering)
ALTER TABLE "creators" ADD COLUMN IF NOT EXISTS "video_limit" integer;
