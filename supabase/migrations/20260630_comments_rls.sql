-- RLS policies for the comments table
-- Comments on private posts are only readable by the post author.

alter table comments enable row level security;

-- Comment authors can read/delete their own comments
create policy "Comment authors manage their comments"
  on comments
  for all
  using (auth.uid()::text = author_id)
  with check (auth.uid()::text = author_id);

-- Post authors can delete comments on their posts
create policy "Post authors manage comments on their posts"
  on comments
  for delete
  using (
    exists (
      select 1 from posts p
      where p.id = comments.post_id
        and p.author_id = auth.uid()::text
    )
  );

-- Published/flagged comments on public or followers posts are readable by authenticated users
create policy "Authenticated users read comments on accessible posts"
  on comments
  for select
  using (
    auth.role() = 'authenticated'
    and status in ('published', 'flagged')
    and exists (
      select 1 from posts p
      where p.id = comments.post_id
        and p.status = 'published'
        and p.visibility in ('public', 'followers')
    )
  );
