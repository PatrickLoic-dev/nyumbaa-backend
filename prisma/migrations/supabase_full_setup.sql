-- =============================================================================
-- Nyumba'a — Full Supabase Setup
-- Tables + RLS policies + coherent mock data
-- Run once in the Supabase SQL editor
-- =============================================================================

-- ─── 0. Extensions ────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── 1. Enums ─────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "AppLanguage"       AS ENUM ('fr', 'en', 'sw', 'yo', 'ha');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "PostVisibility"    AS ENUM ('public', 'followers', 'private');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "PostStatus"        AS ENUM ('published', 'under_review', 'removed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "PostImageStatus"   AS ENUM ('pending_review', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CommentStatus"     AS ENUM ('published', 'flagged', 'removed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ConversationType"  AS ENUM ('private', 'group');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "MessageStatus"     AS ENUM ('sent', 'delivered', 'read');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "MemberRole"        AS ENUM ('admin', 'moderator', 'member');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 2. Tables ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS profiles (
  id                          UUID        PRIMARY KEY,
  display_name                TEXT        NOT NULL,
  avatar_url                  TEXT,
  language                    "AppLanguage" NOT NULL DEFAULT 'fr',
  timezone                    TEXT        NOT NULL DEFAULT 'UTC',
  username                    VARCHAR(30) UNIQUE,
  bio                         VARCHAR(80),
  location                    VARCHAR(100),
  interests                   TEXT[]      NOT NULL DEFAULT '{}',
  phone_number                TEXT        UNIQUE,
  phone_verified              BOOLEAN     NOT NULL DEFAULT FALSE,
  email_notifications_enabled BOOLEAN     NOT NULL DEFAULT TRUE,
  push_followers              BOOLEAN     NOT NULL DEFAULT TRUE,
  push_comments               BOOLEAN     NOT NULL DEFAULT TRUE,
  push_likes                  BOOLEAN     NOT NULL DEFAULT TRUE,
  email_followers             BOOLEAN     NOT NULL DEFAULT TRUE,
  email_comments              BOOLEAN     NOT NULL DEFAULT TRUE,
  email_likes                 BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS posts (
  id               UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id        UUID            NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content          TEXT            NOT NULL,
  visibility       "PostVisibility" NOT NULL DEFAULT 'public',
  status           "PostStatus"    NOT NULL DEFAULT 'published',
  likes_count      INT             NOT NULL DEFAULT 0,
  comments_enabled BOOLEAN         NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS posts_author_created_idx ON posts (author_id, created_at DESC);

CREATE TABLE IF NOT EXISTS post_images (
  id         UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    UUID              NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  s3_key     TEXT              NOT NULL,
  cdn_url    TEXT              NOT NULL,
  alt_text   VARCHAR(200),
  "order"    INT               NOT NULL,
  status     "PostImageStatus" NOT NULL DEFAULT 'pending_review',
  created_at TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS post_images_post_order_idx ON post_images (post_id, "order");

CREATE TABLE IF NOT EXISTS likes (
  post_id    UUID        NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS comments (
  id         UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    UUID            NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id  UUID            NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content    VARCHAR(500)    NOT NULL,
  status     "CommentStatus" NOT NULL DEFAULT 'published',
  created_at TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS comments_post_created_idx ON comments (post_id, created_at ASC);

CREATE TABLE IF NOT EXISTS post_mentions (
  post_id           UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  mentioned_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, mentioned_user_id)
);

CREATE TABLE IF NOT EXISTS follows (
  follower_id  UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  following_id UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (follower_id, following_id)
);
CREATE INDEX IF NOT EXISTS follows_following_id_idx ON follows (following_id);

CREATE TABLE IF NOT EXISTS conversations (
  id         UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
  type       "ConversationType" NOT NULL DEFAULT 'private',
  name       TEXT,
  created_by UUID               NOT NULL,
  created_at TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ        NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id UUID        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  role            "MemberRole" NOT NULL DEFAULT 'member',
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       UUID        NOT NULL REFERENCES profiles(id),
  content         TEXT        NOT NULL,
  lang            TEXT        NOT NULL DEFAULT 'fr',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS messages_conv_created_idx ON messages (conversation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS message_statuses (
  message_id UUID          NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id    UUID          NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status     "MessageStatus" NOT NULL DEFAULT 'sent',
  updated_at TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, user_id)
);

CREATE TABLE IF NOT EXISTS translations_cache (
  message_id       UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  target_lang      TEXT NOT NULL,
  translated_text  TEXT NOT NULL,
  PRIMARY KEY (message_id, target_lang)
);

CREATE TABLE IF NOT EXISTS push_tokens (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  expo_token TEXT        NOT NULL,
  platform   TEXT        NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, platform)
);

-- ─── 3. updated_at trigger ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'profiles','posts','comments','conversations','messages'
  ]) LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%s_updated_at ON %I;
       CREATE TRIGGER trg_%s_updated_at
         BEFORE UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION set_updated_at();',
      t, t, t, t
    );
  END LOOP;
END $$;

-- ─── 4. Row Level Security ────────────────────────────────────────────────────
ALTER TABLE profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts                ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_images          ENABLE ROW LEVEL SECURITY;
ALTER TABLE likes                ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments             ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_mentions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE follows              ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages             ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_statuses     ENABLE ROW LEVEL SECURITY;
ALTER TABLE translations_cache   ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_tokens          ENABLE ROW LEVEL SECURITY;

-- profiles
DROP POLICY IF EXISTS "profiles_select_all"   ON profiles;
DROP POLICY IF EXISTS "profiles_insert_own"   ON profiles;
DROP POLICY IF EXISTS "profiles_update_own"   ON profiles;

CREATE POLICY "profiles_select_all"  ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_insert_own"  ON profiles FOR INSERT WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_update_own"  ON profiles FOR UPDATE USING (id = auth.uid());

-- posts
DROP POLICY IF EXISTS "posts_select_public"   ON posts;
DROP POLICY IF EXISTS "posts_insert_own"      ON posts;
DROP POLICY IF EXISTS "posts_update_own"      ON posts;
DROP POLICY IF EXISTS "posts_delete_own"      ON posts;

CREATE POLICY "posts_select_public" ON posts FOR SELECT
  USING (status = 'published' AND visibility = 'public');
CREATE POLICY "posts_insert_own"    ON posts FOR INSERT WITH CHECK (author_id = auth.uid());
CREATE POLICY "posts_update_own"    ON posts FOR UPDATE USING (author_id = auth.uid());
CREATE POLICY "posts_delete_own"    ON posts FOR DELETE USING (author_id = auth.uid());

-- post_images
DROP POLICY IF EXISTS "post_images_select" ON post_images;
DROP POLICY IF EXISTS "post_images_insert" ON post_images;

CREATE POLICY "post_images_select" ON post_images FOR SELECT USING (
  EXISTS (SELECT 1 FROM posts p WHERE p.id = post_id AND p.status = 'published' AND p.visibility = 'public')
);
CREATE POLICY "post_images_insert" ON post_images FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM posts p WHERE p.id = post_id AND p.author_id = auth.uid())
);

-- likes
DROP POLICY IF EXISTS "likes_select_all"  ON likes;
DROP POLICY IF EXISTS "likes_insert_own"  ON likes;
DROP POLICY IF EXISTS "likes_delete_own"  ON likes;

CREATE POLICY "likes_select_all"  ON likes FOR SELECT USING (true);
CREATE POLICY "likes_insert_own"  ON likes FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "likes_delete_own"  ON likes FOR DELETE USING (user_id = auth.uid());

-- comments
DROP POLICY IF EXISTS "comments_select_public" ON comments;
DROP POLICY IF EXISTS "comments_insert_own"    ON comments;
DROP POLICY IF EXISTS "comments_update_own"    ON comments;
DROP POLICY IF EXISTS "comments_delete_own"    ON comments;

CREATE POLICY "comments_select_public" ON comments FOR SELECT USING (status = 'published');
CREATE POLICY "comments_insert_own"    ON comments FOR INSERT WITH CHECK (author_id = auth.uid());
CREATE POLICY "comments_update_own"    ON comments FOR UPDATE USING (author_id = auth.uid());
CREATE POLICY "comments_delete_own"    ON comments FOR DELETE USING (author_id = auth.uid());

-- follows
DROP POLICY IF EXISTS "follows_select_all"  ON follows;
DROP POLICY IF EXISTS "follows_insert_own"  ON follows;
DROP POLICY IF EXISTS "follows_delete_own"  ON follows;

CREATE POLICY "follows_select_all"  ON follows FOR SELECT USING (true);
CREATE POLICY "follows_insert_own"  ON follows FOR INSERT WITH CHECK (follower_id = auth.uid());
CREATE POLICY "follows_delete_own"  ON follows FOR DELETE USING (follower_id = auth.uid());

-- post_mentions
DROP POLICY IF EXISTS "post_mentions_select" ON post_mentions;
CREATE POLICY "post_mentions_select" ON post_mentions FOR SELECT USING (true);

-- conversations — members only
DROP POLICY IF EXISTS "conversations_select_member" ON conversations;
DROP POLICY IF EXISTS "conversations_insert_own"    ON conversations;

CREATE POLICY "conversations_select_member" ON conversations FOR SELECT USING (
  EXISTS (SELECT 1 FROM conversation_members cm WHERE cm.conversation_id = id AND cm.user_id = auth.uid())
);
CREATE POLICY "conversations_insert_own" ON conversations FOR INSERT WITH CHECK (created_by = auth.uid());

-- conversation_members
DROP POLICY IF EXISTS "conv_members_select" ON conversation_members;
DROP POLICY IF EXISTS "conv_members_insert" ON conversation_members;

CREATE POLICY "conv_members_select" ON conversation_members FOR SELECT USING (
  EXISTS (SELECT 1 FROM conversation_members cm WHERE cm.conversation_id = conversation_id AND cm.user_id = auth.uid())
);
CREATE POLICY "conv_members_insert" ON conversation_members FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM conversations c WHERE c.id = conversation_id AND c.created_by = auth.uid())
);

-- messages — members only
DROP POLICY IF EXISTS "messages_select_member" ON messages;
DROP POLICY IF EXISTS "messages_insert_member" ON messages;

CREATE POLICY "messages_select_member" ON messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM conversation_members cm WHERE cm.conversation_id = conversation_id AND cm.user_id = auth.uid())
);
CREATE POLICY "messages_insert_member" ON messages FOR INSERT WITH CHECK (
  sender_id = auth.uid() AND
  EXISTS (SELECT 1 FROM conversation_members cm WHERE cm.conversation_id = conversation_id AND cm.user_id = auth.uid())
);

-- message_statuses
DROP POLICY IF EXISTS "msg_status_select" ON message_statuses;
DROP POLICY IF EXISTS "msg_status_upsert" ON message_statuses;

CREATE POLICY "msg_status_select" ON message_statuses FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "msg_status_upsert" ON message_statuses FOR INSERT WITH CHECK (user_id = auth.uid());

-- translations_cache — readable by anyone in the conversation
DROP POLICY IF EXISTS "translations_select" ON translations_cache;
CREATE POLICY "translations_select" ON translations_cache FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM messages m
    JOIN conversation_members cm ON cm.conversation_id = m.conversation_id
    WHERE m.id = message_id AND cm.user_id = auth.uid()
  )
);

-- push_tokens — private
DROP POLICY IF EXISTS "push_tokens_own" ON push_tokens;
CREATE POLICY "push_tokens_own" ON push_tokens FOR ALL USING (user_id = auth.uid());

-- ─── 5. Service-role bypass (backend uses service role key) ───────────────────
-- The NestJS backend authenticates with the service role key which bypasses RLS.
-- No additional policy needed for backend operations.

-- ─── 6. Mock Data (plain SQL, no PL/pgSQL block) ─────────────────────────────
-- Fixed UUIDs for users
-- u1 = Amara  (fr / Cameroun)  11111111-0000-0000-0000-000000000001
-- u2 = Kwame  (en / Ghana)     11111111-0000-0000-0000-000000000002
-- u3 = Zawadi (sw / Kenya)     11111111-0000-0000-0000-000000000003
-- u4 = Adaeze (yo / Nigeria)   11111111-0000-0000-0000-000000000004
-- u5 = Musa   (ha / Niger)     11111111-0000-0000-0000-000000000005

-- Fixed UUIDs for posts
-- p1 = 22222222-0000-0000-0000-000000000001 (Amara)
-- p2 = 22222222-0000-0000-0000-000000000002 (Kwame)
-- p3 = 22222222-0000-0000-0000-000000000003 (Zawadi)
-- p4 = 22222222-0000-0000-0000-000000000004 (Adaeze)
-- p5 = 22222222-0000-0000-0000-000000000005 (Musa)

-- Fixed UUIDs for conversations
-- conv1 = 33333333-0000-0000-0000-000000000001 (Amara <-> Kwame)
-- conv2 = 33333333-0000-0000-0000-000000000002 (Zawadi <-> Adaeze)

-- Fixed UUIDs for messages
-- m1 = 44444444-0000-0000-0000-000000000001
-- m2 = 44444444-0000-0000-0000-000000000002
-- m3 = 44444444-0000-0000-0000-000000000003
-- m4 = 44444444-0000-0000-0000-000000000004

-- ── Profiles ──────────────────────────────────────────────────────────────────
INSERT INTO profiles (id, display_name, username, bio, location, language, timezone, interests)
VALUES
  ('11111111-0000-0000-0000-000000000001', 'Amara Nkengne',   'amara_nk',   'Passionnee de culture africaine et de tech', 'Cameroun', 'fr', 'Africa/Douala',  ARRAY['Culture africaine','Technologie','Musique']),
  ('11111111-0000-0000-0000-000000000002', 'Kwame Asante',    'kwame_gh',   'Software dev | Accra vibes',                 'Ghana',    'en', 'Africa/Accra',   ARRAY['Technologie','Sport','Business']),
  ('11111111-0000-0000-0000-000000000003', 'Zawadi Odhiambo', 'zawadi_ke',  'Nakupenda Afrika | Nairobi',                 'Kenya',    'sw', 'Africa/Nairobi', ARRAY['Voyage','Musique','Art']),
  ('11111111-0000-0000-0000-000000000004', 'Adaeze Okonkwo',  'adaeze_ng',  'Writer and storyteller from Lagos',          'Nigeria',  'yo', 'Africa/Lagos',   ARRAY['Art','Education','Politique']),
  ('11111111-0000-0000-0000-000000000005', 'Musa Diallo',     'musa_ni',    'Entrepreneur | Niamey',                      'Niger',    'ha', 'Africa/Niamey',  ARRAY['Business','Famille','Actualites'])
ON CONFLICT (id) DO NOTHING;

-- ── Posts ─────────────────────────────────────────────────────────────────────
INSERT INTO posts (id, author_id, content, visibility, status, likes_count)
VALUES
  ('22222222-0000-0000-0000-000000000001',
   '11111111-0000-0000-0000-000000000001',
   'Fiere de voir autant de jeunes Africains embrasser la technologie ! L''avenir du continent se construit aujourd''hui. #AfriTech',
   'public', 'published', 12),

  ('22222222-0000-0000-0000-000000000002',
   '11111111-0000-0000-0000-000000000002',
   'Just shipped a new feature for our fintech startup. Building for Africa, by Africans. The ecosystem is growing fast! #GhanaTech',
   'public', 'published', 28),

  ('22222222-0000-0000-0000-000000000003',
   '11111111-0000-0000-0000-000000000003',
   'Safari ilikuwa ya ajabu! Maisha ya porini ni zawadi ya Afrika. Asante Kenya kwa urembo wako.',
   'public', 'published', 45),

  ('22222222-0000-0000-0000-000000000004',
   '11111111-0000-0000-0000-000000000004',
   'Itan wa ni ijinle to po. Awa ara Afrika gbodo pa awon itan wa mo. Ko o. Kowe re. Pin an.',
   'public', 'published', 19),

  ('22222222-0000-0000-0000-000000000005',
   '11111111-0000-0000-0000-000000000005',
   'Kasuwancin Afirka na girma kowace rana. Dole ne mu tallafa wa juna a matsayin yan kasuwa. Hadin kai shi ne karfi!',
   'public', 'published', 8)
ON CONFLICT (id) DO NOTHING;

-- ── Likes ─────────────────────────────────────────────────────────────────────
INSERT INTO likes (post_id, user_id) VALUES
  ('22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000002'),
  ('22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000003'),
  ('22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000004'),
  ('22222222-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001'),
  ('22222222-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000003'),
  ('22222222-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000005'),
  ('22222222-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000001'),
  ('22222222-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000002'),
  ('22222222-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000004'),
  ('22222222-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000005'),
  ('22222222-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001'),
  ('22222222-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000003'),
  ('22222222-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000002')
ON CONFLICT DO NOTHING;

-- ── Comments ──────────────────────────────────────────────────────────────────
INSERT INTO comments (post_id, author_id, content) VALUES
  ('22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000002', 'Totally agree! The African tech scene is unstoppable'),
  ('22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000003', 'Ndio kabisa! Vijana wa Afrika wanabadilisha dunia.'),
  ('22222222-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', 'Bravo Kwame ! Fierte africaine'),
  ('22222222-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000004', 'This is inspiring! Keep building'),
  ('22222222-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000001', 'Magnifique ! Le Kenya est tellement beau.'),
  ('22222222-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000002', 'One day I''ll go on that safari. Bucket list'),
  ('22222222-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001', 'Tellement important de preserver nos histoires. Merci Adaeze.'),
  ('22222222-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000001', 'La cooperation africaine est la cle du developpement !')
ON CONFLICT DO NOTHING;

-- ── Follows ───────────────────────────────────────────────────────────────────
INSERT INTO follows (follower_id, following_id) VALUES
  ('11111111-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000002'),
  ('11111111-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000003'),
  ('11111111-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000004'),
  ('11111111-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001'),
  ('11111111-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000003'),
  ('11111111-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000001'),
  ('11111111-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000004'),
  ('11111111-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000005'),
  ('11111111-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001'),
  ('11111111-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000002'),
  ('11111111-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000001'),
  ('11111111-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000003')
ON CONFLICT DO NOTHING;

-- ── Conversations ─────────────────────────────────────────────────────────────
INSERT INTO conversations (id, type, created_by) VALUES
  ('33333333-0000-0000-0000-000000000001', 'private', '11111111-0000-0000-0000-000000000001'),
  ('33333333-0000-0000-0000-000000000002', 'private', '11111111-0000-0000-0000-000000000003')
ON CONFLICT (id) DO NOTHING;

-- ── Conversation members ──────────────────────────────────────────────────────
INSERT INTO conversation_members (conversation_id, user_id, role) VALUES
  ('33333333-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'admin'),
  ('33333333-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000002', 'member'),
  ('33333333-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000003', 'admin'),
  ('33333333-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000004', 'member')
ON CONFLICT DO NOTHING;

-- ── Messages ─────────────────────────────────────────────────────────────────
INSERT INTO messages (id, conversation_id, sender_id, content, lang) VALUES
  ('44444444-0000-0000-0000-000000000001',
   '33333333-0000-0000-0000-000000000001',
   '11111111-0000-0000-0000-000000000001',
   'Salut Kwame ! J''ai vu ton post sur ta startup, c''est vraiment impressionnant',
   'fr'),

  ('44444444-0000-0000-0000-000000000002',
   '33333333-0000-0000-0000-000000000001',
   '11111111-0000-0000-0000-000000000002',
   'Thanks Amara! We are growing fast. Are you into software development',
   'en'),

  ('44444444-0000-0000-0000-000000000003',
   '33333333-0000-0000-0000-000000000002',
   '11111111-0000-0000-0000-000000000003',
   'Habari Adaeze! Nilipenda hadithi yako kuhusu Afrika.',
   'sw'),

  ('44444444-0000-0000-0000-000000000004',
   '33333333-0000-0000-0000-000000000002',
   '11111111-0000-0000-0000-000000000004',
   'E je ka soro nipa itan wa! Mo fe gbo awon itan Kenya.',
   'yo')
ON CONFLICT (id) DO NOTHING;

-- ── Message statuses ──────────────────────────────────────────────────────────
INSERT INTO message_statuses (message_id, user_id, status) VALUES
  ('44444444-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000002', 'read'),
  ('44444444-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', 'read'),
  ('44444444-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000004', 'delivered'),
  ('44444444-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000003', 'sent')
ON CONFLICT DO NOTHING;

-- ── Translations cache ────────────────────────────────────────────────────────
INSERT INTO translations_cache (message_id, target_lang, translated_text) VALUES
  ('44444444-0000-0000-0000-000000000001', 'en', 'Hey Kwame! I saw your post about your startup, it''s really impressive'),
  ('44444444-0000-0000-0000-000000000002', 'fr', 'Merci Amara ! Nous grandissons vite. Tu travailles dans le developpement logiciel'),
  ('44444444-0000-0000-0000-000000000003', 'yo', 'Bawo ni Adaeze! Mo feran itan re nipa Afrika.'),
  ('44444444-0000-0000-0000-000000000004', 'sw', 'Hebu tuzungumze kuhusu hadithi zetu! Nataka kusikia hadithi za Kenya.')
ON CONFLICT DO NOTHING;

-- ─── 7. Verify ────────────────────────────────────────────────────────────────
SELECT 'profiles'             AS "table", COUNT(*) FROM profiles
UNION ALL SELECT 'posts',                  COUNT(*) FROM posts
UNION ALL SELECT 'likes',                  COUNT(*) FROM likes
UNION ALL SELECT 'comments',               COUNT(*) FROM comments
UNION ALL SELECT 'follows',                COUNT(*) FROM follows
UNION ALL SELECT 'conversations',          COUNT(*) FROM conversations
UNION ALL SELECT 'conversation_members',   COUNT(*) FROM conversation_members
UNION ALL SELECT 'messages',               COUNT(*) FROM messages
UNION ALL SELECT 'translations_cache',     COUNT(*) FROM translations_cache;
