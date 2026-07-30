-- Add denormalized comments count to posts for faster feed queries
ALTER TABLE posts ADD COLUMN IF NOT EXISTS comments_count INTEGER NOT NULL DEFAULT 0;

-- Backfill from existing comments
UPDATE posts SET comments_count = (
  SELECT COUNT(*) FROM comments WHERE comments.post_id = posts.id
);
