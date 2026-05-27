-- Add onboarding state columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_state TEXT DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_updated_at TIMESTAMPTZ DEFAULT NULL;

-- Password reset tokens table
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
