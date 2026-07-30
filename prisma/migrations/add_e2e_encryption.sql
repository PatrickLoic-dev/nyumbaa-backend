-- Add public key to profiles for E2E encryption key exchange
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS public_key TEXT;

-- Add E2E encryption fields to messages
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_encrypted BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS nonce TEXT;
