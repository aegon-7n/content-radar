-- Soft-delete для креаторов с накопленной историей видео.
-- Раньше DELETE возвращал 409 "Нельзя удалить: есть ролики" и зависал кейс
-- "девочка ушла, новая снимает на тот же канал" — старая блокировала
-- youtube_channel_id, скрапер засчитывал просмотры ей.
-- Теперь: креатор с роликами помечается archived_at, видео остаются в БД
-- для истории, скрапер и UI его игнорируют как активного.
ALTER TABLE creators ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL;
CREATE INDEX IF NOT EXISTS idx_creators_active ON creators (tenant_id) WHERE archived_at IS NULL;
