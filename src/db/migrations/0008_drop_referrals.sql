-- Откат referral_codes feature (Гарри-агент добавил без согласования, Глеб
-- 2026-05-31 решил откатить целиком). Атрибуция waitlist-заявок остаётся
-- через UTM-параметры (utm_source/utm_campaign), referral_code как
-- отдельный механизм не используется.
ALTER TABLE waitlist_signups DROP COLUMN IF EXISTS referral_code;
DROP TABLE IF EXISTS referral_codes;
