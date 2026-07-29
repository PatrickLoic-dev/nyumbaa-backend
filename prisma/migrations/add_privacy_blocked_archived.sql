-- Privacy settings enums
CREATE TYPE "MessagePermission" AS ENUM ('everyone', 'followers', 'nobody');
CREATE TYPE "CommentPermission" AS ENUM ('everyone', 'followers', 'nobody');

-- Privacy columns on profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_private           BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_activity        BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_messages_from  "MessagePermission" NOT NULL DEFAULT 'everyone',
  ADD COLUMN IF NOT EXISTS allow_comments_from  "CommentPermission" NOT NULL DEFAULT 'everyone',
  ADD COLUMN IF NOT EXISTS show_read_receipts   BOOLEAN NOT NULL DEFAULT true;

-- Blocked users
CREATE TABLE IF NOT EXISTS blocked_users (
  blocker_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  blocked_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id)
);
CREATE INDEX IF NOT EXISTS blocked_users_blocker_id_idx ON blocked_users(blocker_id);

-- Archived posts
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
