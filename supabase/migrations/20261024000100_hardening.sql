-- Hardening from the Phase 0 review.

-- Users never write directly; every write goes through the server with the service role.
-- Revoking the grants turns a silent RLS no-op into a clear permission error and keeps a
-- future permissive policy from opening writes by accident.
revoke insert, update, delete, truncate, trigger, references
  on all tables in schema public from anon, authenticated;

-- Security definer functions run only for the roles that need them.
revoke execute on function public.is_staff() from public, anon;
grant execute on function public.is_staff() to authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Keep profiles.email in step with auth when a user changes their address.
create function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = coalesce(new.email, '') where id = new.id;
  return new;
end;
$$;

revoke execute on function public.handle_user_email_change() from public, anon, authenticated;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

-- Indexes for the columns every RLS predicate filters on.
create index ideas_user_id on public.ideas (user_id);
create index intake_messages_idea_id on public.intake_messages (idea_id);
create index specs_user_id on public.specs (user_id);
create index quotes_user_id on public.quotes (user_id);
create index quotes_spec_id on public.quotes (spec_id);
create index payments_user_id on public.payments (user_id);
create index payments_quote_id on public.payments (quote_id);
create index builds_user_id on public.builds (user_id);
create index builds_quote_id on public.builds (quote_id);
create index deployments_build_id on public.deployments (build_id);
create index audits_deployment_id on public.audits (deployment_id);

-- Contract for later phases: never write a deployment URL into build_events.payload.
-- build_events is readable by the owner and streamed over realtime, so it would bypass the
-- column privilege that keeps deployments.url hidden until release.
comment on table public.build_events is
  'Owner-readable and streamed. Never include deployments.url in payload before release.';
