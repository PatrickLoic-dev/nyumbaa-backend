-- RLS policies for post_images table
-- Images of private posts are only accessible to the post author.

alter table post_images enable row level security;

-- Authors can read/write their own post images
create policy "Authors manage their post images"
  on post_images
  for all
  using (
    exists (
      select 1 from posts p
      where p.id = post_images.post_id
        and p.author_id = auth.uid()::text
    )
  )
  with check (
    exists (
      select 1 from posts p
      where p.id = post_images.post_id
        and p.author_id = auth.uid()::text
    )
  );

-- Approved images on public/followers posts are readable by authenticated users
create policy "Authenticated users read approved public post images"
  on post_images
  for select
  using (
    auth.role() = 'authenticated'
    and status = 'approved'
    and exists (
      select 1 from posts p
      where p.id = post_images.post_id
        and p.visibility in ('public', 'followers')
        and p.status = 'published'
    )
  );

-- Supabase Storage bucket RLS: post-images bucket
-- Objects under posts/<uuid>/ are only publicly readable when the post is published + public
-- (configure via Storage → Policies in the Supabase dashboard)
