-- Phase 1: intake questions, encrypted mask maps, shareable estimates.

-- ---------------------------------------------------------------------------
-- Ideas
-- ---------------------------------------------------------------------------
-- Stored text is masked, and placeholders can be longer than the values they hide.
-- The 50 to 2,000 character rule is enforced on the original text by the server.
alter table public.ideas drop constraint ideas_text_check;
alter table public.ideas add constraint ideas_text_length check (char_length(text) between 1 and 8000);

alter table public.ideas
  add column question_count int not null default 0 check (question_count between 0 and 4),
  -- AES-256-GCM sealed JSON of placeholder -> original value; the key never reaches the database.
  add column mask_map_enc text not null default '';

-- The owner reads their idea but never the sealed mask map.
revoke select on public.ideas from anon, authenticated;
grant select (id, user_id, text, links, status, question_count, created_at)
  on public.ideas to authenticated;

-- Atomic slot for one more agent question. Returns false once the idea has used four.
create function public.claim_question_slot(p_idea_id uuid)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  with claimed as (
    update public.ideas
    set question_count = question_count + 1
    where id = p_idea_id and question_count < 4
    returning 1
  )
  select exists (select 1 from claimed);
$$;

revoke execute on function public.claim_question_slot(uuid) from public, anon, authenticated;
grant execute on function public.claim_question_slot(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Intake messages
-- ---------------------------------------------------------------------------
alter table public.intake_messages
  add column kind text not null default 'question' check (kind in ('question', 'answer'));
alter table public.intake_messages alter column kind drop default;

create index intake_messages_idea_created on public.intake_messages (idea_id, created_at);

-- ---------------------------------------------------------------------------
-- Shareable estimates: headline numbers only, for anyone holding the link.
-- ---------------------------------------------------------------------------
create function public.shared_estimate(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'name', s.spec ->> 'name',
    'summary', s.spec ->> 'summary',
    'cost_usd', q.cost_usd,
    'low_usd', q.low_usd,
    'high_usd', q.high_usd,
    'hours', q.hours
  )
  from public.quotes q
  join public.specs s on s.id = q.spec_id
  where q.share_slug = p_slug;
$$;

revoke execute on function public.shared_estimate(text) from public;
grant execute on function public.shared_estimate(text) to anon, authenticated;
