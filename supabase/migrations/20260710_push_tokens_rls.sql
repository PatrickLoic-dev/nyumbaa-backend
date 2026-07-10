-- RLS policy for the push_tokens table — NYUMBAA-48
-- A user may only read/write/delete their own push tokens. The backend uses
-- the service role (which bypasses RLS) to send notifications, so no
-- cross-user select policy is needed here.

alter table push_tokens enable row level security;

create policy "Users manage their own push tokens"
  on push_tokens
  for all
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

-- Backfill for the new email notification preference on profiles — NYUMBAA-48
alter table profiles
  add column if not exists email_notifications_enabled boolean not null default true;
