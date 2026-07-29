-- Add reposts_count to posts
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "reposts_count" INTEGER NOT NULL DEFAULT 0;

-- Create reposts table
CREATE TABLE IF NOT EXISTS "reposts" (
    "post_id"    UUID NOT NULL,
    "user_id"    UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "reposts_pkey" PRIMARY KEY ("post_id", "user_id"),
    CONSTRAINT "reposts_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE,
    CONSTRAINT "reposts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "reposts_user_id_created_at_idx" ON "reposts"("user_id", "created_at" DESC);
