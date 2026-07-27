-- Run in Supabase SQL editor
-- Adds username, bio, location, interests to profiles table

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS username    VARCHAR(30)  UNIQUE,
  ADD COLUMN IF NOT EXISTS bio         VARCHAR(80),
  ADD COLUMN IF NOT EXISTS location    VARCHAR(100),
  ADD COLUMN IF NOT EXISTS interests   TEXT[]       NOT NULL DEFAULT '{}';

-- Index for username lookups
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_idx ON profiles (username)
  WHERE username IS NOT NULL;
