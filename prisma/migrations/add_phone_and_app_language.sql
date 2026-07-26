-- Migration: add phone_number, phone_verified, and AppLanguage enum to profiles
-- Apply manually via Supabase SQL editor or psql

-- 1. Create the AppLanguage enum
CREATE TYPE "AppLanguage" AS ENUM ('fr', 'en', 'sw', 'yo', 'ha');

-- 2. Add new columns (nullable first to avoid locking issues on existing rows)
ALTER TABLE profiles
  ADD COLUMN phone_number  TEXT UNIQUE,
  ADD COLUMN phone_verified BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. Migrate existing language column (TEXT → AppLanguage enum)
--    Cast existing values; anything not in the enum defaults to 'fr'
ALTER TABLE profiles
  ALTER COLUMN language DROP DEFAULT;

ALTER TABLE profiles
  ALTER COLUMN language TYPE "AppLanguage"
    USING CASE
      WHEN language IN ('fr','en','sw','yo','ha') THEN language::"AppLanguage"
      ELSE 'fr'::"AppLanguage"
    END;

ALTER TABLE profiles
  ALTER COLUMN language SET DEFAULT 'fr';
