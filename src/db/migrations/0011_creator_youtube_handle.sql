-- Хранить raw input юзера для YouTube канала, чтобы в UI отображать handle
-- (или URL) который ввёл юзер, а не резолвленный UC-ID. youtube_channel_id
-- продолжает хранить UC для скрапера.
ALTER TABLE creators ADD COLUMN IF NOT EXISTS youtube_handle TEXT NULL;
