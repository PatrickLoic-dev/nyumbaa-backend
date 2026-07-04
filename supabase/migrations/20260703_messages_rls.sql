-- RLS policy for the messages table — NYUMBAA-47
-- A message can only be inserted by its own sender, and only into a
-- conversation the sender is already a member of.

alter table messages enable row level security;

create policy "Members can send messages to their conversations"
  on messages
  for insert
  with check (
    auth.uid()::text = sender_id
    and exists (
      select 1 from conversation_members cm
      where cm.conversation_id = messages.conversation_id
        and cm.user_id = auth.uid()::text
    )
  );
