-- Referral codes for partner attribution
CREATE TABLE IF NOT EXISTS referral_codes (
  code TEXT PRIMARY KEY,
  partner_name TEXT NOT NULL,
  used_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Track which referral code was used on each waitlist signup.
-- No FK constraint — store raw code from URL param; invalid codes are accepted
-- gracefully and simply won't match any referral_codes row.
ALTER TABLE waitlist_signups ADD COLUMN IF NOT EXISTS referral_code TEXT;
