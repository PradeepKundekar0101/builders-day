-- Immutable Studio-to-build handoff; service-only worker coordination.
create table public.studio_build_specs (
 session_id uuid not null references public.prompt_studio_sessions(id),
 revision integer not null,
 spec_id uuid not null unique references public.specs(id),
 primary key(session_id,revision),
 foreign key(session_id,revision) references public.prompt_studio_versions(session_id,revision)
);
alter table public.studio_build_specs enable row level security;
revoke all on public.studio_build_specs from anon,authenticated;
create function public.prepare_studio_build(p_user_id uuid,p_session_id uuid,p_revision integer,p_flags text[]) returns uuid
language plpgsql security definer set search_path='' as $$
declare s public.prompt_studio_sessions%rowtype; v public.prompt_studio_versions%rowtype; result uuid;
begin
 select * into s from public.prompt_studio_sessions where id=p_session_id and user_id=p_user_id for update;
 if not found then raise exception 'Draft not found'; end if;
 if s.revision<>p_revision then raise exception 'Draft changed; reload before quoting'; end if;
 select * into v from public.prompt_studio_versions where session_id=s.id and revision=p_revision;
 if v.status<>'user_reviewed' then raise exception 'Mark the saved draft reviewed first'; end if;
 select spec_id into result from public.studio_build_specs where session_id=s.id and revision=p_revision;
 if result is not null then return result; end if;
 insert into public.specs(idea_id,user_id,version,spec,flag_reasons,operator_status)
 values(s.id,p_user_id,(select coalesce(max(version),0)+1 from public.specs where idea_id=s.id),v.payload->'spec',p_flags,case when cardinality(p_flags)>0 then 'pending' else 'not_needed' end) returning id into result;
 insert into public.studio_build_specs values(s.id,p_revision,result);
 if cardinality(p_flags)>0 then insert into public.approvals(kind,subject_id,note) values('flagged_spec',result,array_to_string(p_flags,', ')); end if;
 return result;
end; $$;
revoke all on function public.prepare_studio_build(uuid,uuid,integer,text[]) from public,anon,authenticated;
grant execute on function public.prepare_studio_build(uuid,uuid,integer,text[]) to service_role;

create table public.build_outputs (
 build_id uuid primary key references public.builds(id),
 status text not null check(status in ('running','ready','failed','needs_review')),
 artifact_path text,
 message text not null default '',
 checks jsonb not null default '{}',
 updated_at timestamptz not null default now()
);
alter table public.build_outputs enable row level security;
revoke all on public.build_outputs from anon,authenticated;
create table public.build_worker_health(id text primary key,seen_at timestamptz not null default now());
alter table public.build_worker_health enable row level security;
revoke all on public.build_worker_health from anon,authenticated;

-- Stale jobs are stopped for reconciliation, not blindly retried after a possibly billed call.
create function public.claim_studio_build(p_worker text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare b public.builds%rowtype;
begin
 insert into public.build_worker_health(id) values(p_worker) on conflict(id) do update set seen_at=now();
 with stale as (
 update public.builds set status='paused_budget',claimed_by=null where claimed_by is not null and status in ('running','building_fix') and heartbeat_at<now()-interval '2 minutes' returning id
 ) insert into public.build_outputs(build_id,status,message) select id,'needs_review','Worker interrupted. Operator reconciliation is required before another attempt.' from stale on conflict(build_id) do update set status=excluded.status,message=excluded.message;
 select x.* into b from public.builds x join public.quotes q on q.id=x.quote_id join public.studio_build_specs m on m.spec_id=q.spec_id
 where x.status='queued' and x.claimed_by is null
 and exists(select 1 from public.cost_wallet_accounts w, jsonb_array_elements(w.state->'runs') r where w.account_id=x.user_id and r->>'id'=x.id::text and r->>'quoteId'=q.id::text and r->>'phase'='running' and (r->>'heldPaid')::numeric+(r->>'heldMonthly')::numeric>0) and not exists(select 1 from public.build_outputs o where o.build_id=x.id)
 order by x.created_at for update of x skip locked limit 1;
 if not found then return null; end if;
 update public.builds set status='running',claimed_by=p_worker,heartbeat_at=now(),started_at=coalesce(started_at,now()) where id=b.id;
 insert into public.build_outputs(build_id,status) values(b.id,'running');
 return to_jsonb(b);
end; $$;
revoke all on function public.claim_studio_build(text) from public,anon,authenticated;
grant execute on function public.claim_studio_build(text) to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('build-artifacts','build-artifacts',false,52428800,array['application/zip']) on conflict(id) do nothing;

-- A canonical spec referenced by a reviewed build must never change underneath its quote.
create function public.studio_spec_immutable() returns trigger language plpgsql set search_path='' as $$
begin
 if exists(select 1 from public.studio_build_specs where spec_id=old.id) and (new.spec is distinct from old.spec or new.idea_id<>old.idea_id or new.user_id<>old.user_id or new.version<>old.version) then raise exception 'Reviewed build specification is immutable'; end if;
 return new;
end; $$;
create trigger studio_spec_immutable before update on public.specs for each row execute function public.studio_spec_immutable();
grant all on public.studio_build_specs, public.build_outputs, public.build_worker_health to service_role;

-- Source generation does not include deployment; never charge a deployment line for it.
insert into public.cost_pricing_versions(version,config)
select 'source-v1',jsonb_set(jsonb_set(config,'{version}','"source-v1"'::jsonb),'{deployUsd}','0'::jsonb)
from public.cost_pricing_versions where version='v1';
