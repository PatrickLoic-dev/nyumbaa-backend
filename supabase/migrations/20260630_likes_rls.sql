-- RLS policies for the likes table
-- Likes on private posts are only visible to authorized users.

alter table likes enable row level security;

-- Users can manage their own likes
create policy "Users manage their own likes"
  on likes
  for all
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

-- Likes on public/followers posts are readable by authenticated users
create policy "Authenticated users read likes on accessible posts"
  on likes
  for select
  using (
    auth.role() = 'authenticated'
    and exists (
      select 1 from posts p
      where p.id = likes.post_id
        and p.status = 'published'
        and p.visibility in ('public', 'followers')
    )
  );
