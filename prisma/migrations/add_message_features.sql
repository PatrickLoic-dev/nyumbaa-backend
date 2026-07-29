-- Message type enum
CREATE TYPE "MessageType" AS ENUM ('text', 'voice', 'image', 'video', 'forwarded');

-- New columns on messages
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS type              "MessageType" NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS media_url         TEXT,
  ADD COLUMN IF NOT EXISTS media_duration    FLOAT,
  ADD COLUMN IF NOT EXISTS reply_to_id       UUID REFERENCES messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS forwarded_from_id UUID,
  ADD COLUMN IF NOT EXISTS deleted_at        TIMESTAMPTZ;
