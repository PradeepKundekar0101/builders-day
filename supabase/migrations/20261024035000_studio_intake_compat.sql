-- Reconcile Studio saves with the Phase 1 required intake message kind.
create or replace function public.save_prompt_studio(
  p_session_id uuid, p_user_id uuid, p_expected_revision integer,
  p_mutation_id uuid, p_payload jsonb, p_status text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.prompt_studio_sessions%rowtype;
  prior public.prompt_studio_versions%rowtype;
  v integer;
  q jsonb;
begin
  if p_status not in ('draft', 'user_reviewed') or p_expected_revision < 0 then
    raise exception 'invalid studio request' using errcode = '22023';
  end if;
  -- Serializes creation for one user, including the daily creation limit.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  select * into s from public.prompt_studio_sessions where id = p_session_id for update;
  if found then
    if s.user_id <> p_user_id then raise exception 'not found' using errcode = 'P0002'; end if;
    select * into prior from public.prompt_studio_versions where session_id = p_session_id and mutation_id = p_mutation_id;
    if found then
      if prior.payload - 'revision' <> p_payload - 'revision' or prior.status <> p_status then
        raise exception 'mutation reused with different content' using errcode = '40001';
      end if;
      return jsonb_build_object('id', p_session_id, 'revision', prior.revision, 'draft', prior.payload, 'status', prior.status);
    end if;
    if s.revision <> p_expected_revision then raise exception 'revision conflict' using errcode = '40001'; end if;
  else
    if p_expected_revision <> 0 then raise exception 'not found' using errcode = 'P0002'; end if;
    if (select count(*) from public.prompt_studio_sessions where user_id = p_user_id and created_at > now() - interval '1 day') >= 50 then
      raise exception 'daily studio creation limit reached' using errcode = '54000';
    end if;
    insert into public.ideas(id, user_id, text, links, status)
      values (p_session_id, p_user_id, p_payload #>> '{input,idea}',
        array(select jsonb_array_elements_text(p_payload #> '{input,links}')), 'in_intake');
    insert into public.prompt_studio_sessions(id, user_id) values (p_session_id, p_user_id);
    insert into public.intake_messages(idea_id, role, kind, content) values (p_session_id, 'user', 'answer', p_payload #>> '{input,idea}');
    for q in select value from jsonb_array_elements(p_payload->'questions') loop
      insert into public.intake_messages(idea_id, role, kind, content) values (p_session_id, 'agent', 'question', q->>'question');
    end loop;
  end if;
  if p_expected_revision > 0 then
    select * into prior from public.prompt_studio_versions where session_id = p_session_id and revision = p_expected_revision;
  end if;
  for q in select value from jsonb_array_elements(p_payload->'questions') loop
    if coalesce(q->>'answer','') <> '' and not exists (
      select 1 from jsonb_array_elements(coalesce(prior.payload->'questions','[]'::jsonb)) old
      where old->>'id' = q->>'id' and old->>'answer' = q->>'answer'
    ) then
      insert into public.intake_messages(idea_id, role, kind, content)
        values (p_session_id, 'user', 'answer', (q->>'question') || E'\n' || (q->>'answer'));
    end if;
  end loop;
  v := p_expected_revision + 1;
  p_payload := jsonb_set(p_payload, '{revision}', to_jsonb(v));
  insert into public.prompt_studio_versions(session_id, revision, mutation_id, payload, status)
    values (p_session_id, v, p_mutation_id, p_payload, p_status);
  update public.prompt_studio_sessions set revision = v where id = p_session_id;
  return jsonb_build_object('id', p_session_id, 'revision', v, 'draft', p_payload, 'status', p_status);
end; $$;
revoke execute on function public.save_prompt_studio(uuid,uuid,integer,uuid,jsonb,text) from public, anon, authenticated;
grant execute on function public.save_prompt_studio(uuid,uuid,integer,uuid,jsonb,text) to service_role;
