-- ─────────────────────────────────────────────────────────────────────────────
-- add_messaging_features_v2.sql
-- Safe to run whether or not add_message_features.sql was applied before.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Ensure MessageType enum exists with all required values
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MessageType') THEN
    CREATE TYPE "MessageType" AS ENUM ('text', 'voice', 'image', 'video', 'forwarded', 'document');
  ELSE
    BEGIN ALTER TYPE "MessageType" ADD VALUE IF NOT EXISTS 'voice';     EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TYPE "MessageType" ADD VALUE IF NOT EXISTS 'image';     EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TYPE "MessageType" ADD VALUE IF NOT EXISTS 'video';     EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TYPE "MessageType" ADD VALUE IF NOT EXISTS 'forwarded'; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TYPE "MessageType" ADD VALUE IF NOT EXISTS 'document';  EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;

-- 2. Ensure MessageStatus enum exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MessageStatus') THEN
    CREATE TYPE "MessageStatus" AS ENUM ('sent', 'delivered', 'read');
  END IF;
END $$;

-- 3. Add new columns to messages (idempotent)
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS type        "MessageType" NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS media_url        TEXT,
  ADD COLUMN IF NOT EXISTS media_name       TEXT,
  ADD COLUMN IF NOT EXISTS media_size       INTEGER,
  ADD COLUMN IF NOT EXISTS media_duration   FLOAT,
  ADD COLUMN IF NOT EXISTS reply_to_id      UUID REFERENCES messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS forwarded_from_id UUID,
  ADD COLUMN IF NOT EXISTS is_pinned        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at       TIMESTAMPTZ;

-- 4. Add new columns to conversation_members (idempotent)
ALTER TABLE conversation_members
  ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_pinned   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS wallpaper   TEXT;

-- 5. Add avatar_url to conversations (idempotent)
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 6. Create message_reactions table
CREATE TABLE IF NOT EXISTS message_reactions (
  message_id UUID        NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  emoji      VARCHAR(10) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_message_reactions_message_id ON message_reactions(message_id);

-- 7. Create message_statuses table if not exists
CREATE TABLE IF NOT EXISTS message_statuses (
  message_id UUID          NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id    UUID          NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status     "MessageStatus" NOT NULL DEFAULT 'sent',
  updated_at TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, user_id)
);
