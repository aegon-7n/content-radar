-- TRU-310: store content metadata captured from API responses.
-- Fields are nullable — populated lazily on next successful scrape.
-- Hashtags stored as comma-separated text to avoid jsonb dependency.
ALTER TABLE "videos"
  ADD COLUMN "title" text,
  ADD COLUMN "duration_sec" integer,
  ADD COLUMN "music_title" text,
  ADD COLUMN "music_author" text,
  ADD COLUMN "music_is_original" boolean,
  ADD COLUMN "hashtags" text,
  ADD COLUMN "cover_url" text;
