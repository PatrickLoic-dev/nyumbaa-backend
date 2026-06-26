-- RLS policies for the posts table
-- Private posts are only readable by their author.

alter table posts enable row level security;

-- Authors can do everything on their own posts
create policy "Authors manage their posts"
  on posts
  for all
  using (auth.uid()::text = author_id)
  with check (auth.uid()::text = author_id);

-- Public and followers posts are readable by authenticated users
create policy "Authenticated users read public posts"
  on posts
  for select
  using (
    auth.role() = 'authenticated'
    and visibility in ('public', 'followers')
    and status = 'published'
  );

-- Private posts: no select for non-authors (covered by absence of policy)
-- The application layer enforces a 403 via PostsService.findOneForUser()

alter table post_mentions enable row level security;

create policy "Mentions inherit post visibility"
  on post_mentions
  for select
  using (
    exists (
      select 1 from posts p
      where p.id = post_mentions.post_id
        and (
          p.author_id = auth.uid()::text
          or p.visibility in ('public', 'followers')
        )
    )
  );
