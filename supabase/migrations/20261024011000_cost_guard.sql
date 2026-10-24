-- Additive migration. Apply after the foundation migration.
-- The service-role boundary is intentional: clients cannot authorize spending.
create table public.cost_pricing_versions (
 version text primary key,
 config jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.cost_pricing_versions enable row level security;
create policy "read pricing" on public.cost_pricing_versions for select to authenticated using (true);
create function public.cost_pricing_immutable() returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'Pricing versions are immutable; insert a new version'; end; $$;
create trigger cost_pricing_immutable before update or delete on public.cost_pricing_versions
 for each row execute function public.cost_pricing_immutable();

create table public.cost_guard_accounts (
 build_id uuid primary key references public.builds on delete cascade,
 version bigint not null default 0,
 state jsonb not null,
 updated_at timestamptz not null default now()
);
alter table public.cost_guard_accounts enable row level security;
-- No direct client policy. User-visible status is provided by authenticated server routes.
create table public.cost_guard_journal (
 id bigint generated always as identity primary key,
 build_id uuid not null references public.builds on delete cascade,
 version bigint not null,
 command jsonb not null,
 created_at timestamptz not null default now(),
 unique(build_id, version)
);
alter table public.cost_guard_journal enable row level security;

-- Precision matches the package's integer micro-dollar accounting.
alter table public.builds alter column budget_usd type numeric(16,6);
alter table public.builds alter column spent_usd type numeric(16,6);
alter table public.quotes alter column model_budget_usd type numeric(16,6);

-- Lazy initialization takes its cap only from the verified paid build, not a client amount.
create function public.cost_guard_read(p_build_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare b public.builds%rowtype; cap bigint; result jsonb;
begin
 select * into b from public.builds where id=p_build_id for update;
 if not found then raise exception 'Unknown build'; end if;
 if not exists(select 1 from public.quotes q where q.id=b.quote_id and q.status='paid') then
  raise exception 'Budget requires a paid quote';
 end if;
 select state into result from public.cost_guard_accounts where build_id=p_build_id;
 if found then return result; end if;
 if b.spent_usd <> 0 or b.tokens_in <> 0 or b.tokens_out <> 0 then
  raise exception 'Existing spend requires explicit ledger migration';
 end if;
 if b.status not in ('queued','running','building_fix') then raise exception 'Build is not executable'; end if;
 cap := round(b.budget_usd*1000000);
 if cap <= 0 or cap > 9007199254740991 then raise exception 'Invalid cap'; end if;
 result := jsonb_build_object('buildId',p_build_id::text,'version',0,'initialCapMicros',cap,'capMicros',cap,'spentMicros',0,'stopped',false,'breached',false,'paused',false,'reservations','[]'::jsonb,'approvals','[]'::jsonb);
 insert into public.cost_guard_accounts(build_id,state) values(p_build_id,result);
 return result;
end; $$;

-- Compare-and-swap serializes competing worker decisions. All ledger, aggregate and
-- event writes commit together. A losing caller rereads and recomputes the decision.
create function public.cost_guard_cas(p_build_id uuid,p_expected_version bigint,p_state jsonb,p_command jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare old_state jsonb; old_version bigint; b public.builds%rowtype; new_cap numeric; new_spend numeric; actor uuid; approval_id uuid;
begin
 select * into b from public.builds where id=p_build_id for update;
 if not found then raise exception 'Unknown build'; end if;
 select state,version into old_state,old_version from public.cost_guard_accounts where build_id=p_build_id for update;
 if not found then raise exception 'Budget not initialized'; end if;
 if old_version<>p_expected_version then return false; end if;
 if p_state->>'buildId'<>p_build_id::text or (p_state->>'version')::bigint<>old_version+1 then raise exception 'Invalid state version'; end if;
 new_cap := (p_state->>'capMicros')::numeric;
 new_spend := (p_state->>'spentMicros')::numeric;
 if new_cap<=0 or new_cap>9007199254740991 or new_cap<>trunc(new_cap) or new_spend<0 or new_spend>9007199254740991 or new_spend<>trunc(new_spend) then raise exception 'Invalid accounting amount'; end if;
 if new_spend < (old_state->>'spentMicros')::numeric then raise exception 'Spend cannot decrease'; end if;
 if p_command->>'type' in ('reserve','start') and b.status not in ('queued','running','building_fix','paused_budget') then
  raise exception 'Build is not executable';
 end if;
 if new_cap<>(old_state->>'capMicros')::numeric then
  if p_command->>'type'<>'approve' or new_cap <= (old_state->>'capMicros')::numeric or new_cap<>(p_command->>'newCapMicros')::numeric then raise exception 'Cap requires approval'; end if;
  actor := (p_command->>'actorId')::uuid;
  if not exists(select 1 from public.profiles p where p.id=actor and (p.id=b.user_id or p.role in ('operator','admin'))) then raise exception 'Unauthorized budget approver'; end if;
  insert into public.approvals(kind,subject_id,decided_by,decided_at,decision,note)
   values('budget_overrun',p_build_id,actor,now(),'approved',jsonb_build_object('commandId',p_command->>'id','previousCapMicros',old_state->'capMicros','newCapMicros',new_cap)::text) returning id into approval_id;
 end if;
 if (p_state->>'paused')::boolean and not (old_state->>'paused')::boolean then
  if not exists(select 1 from public.approvals where subject_id=p_build_id and kind='budget_overrun' and decided_at is null) then
   insert into public.approvals(kind,subject_id,note) values('budget_overrun',p_build_id,'Budget paused; explicit cap decision required');
  end if;
 end if;
 if approval_id is not null then
  update public.approvals set decided_by=actor,decided_at=now(),decision='approved',note='Resolved by approval '||approval_id::text
   where subject_id=p_build_id and kind='budget_overrun' and decided_at is null;
 end if;
 update public.cost_guard_accounts set version=old_version+1,state=p_state,updated_at=now() where build_id=p_build_id;
 insert into public.cost_guard_journal(build_id,version,command) values(p_build_id,old_version+1,p_command);
 update public.builds set
  budget_usd=new_cap/1000000,spent_usd=new_spend/1000000,
  tokens_in=(select coalesce(sum((r->'usage'->>'inputTokens')::bigint),0) from jsonb_array_elements(p_state->'reservations') r),
  tokens_out=(select coalesce(sum((r->'usage'->>'outputTokens')::bigint),0) from jsonb_array_elements(p_state->'reservations') r),
  status=case when (p_state->>'stopped')::boolean then 'failed'
   when (p_state->>'paused')::boolean then 'paused_budget'
   when b.status='paused_budget' then 'queued' else b.status end
  where id=p_build_id;
 insert into public.build_events(build_id,type,payload) values(p_build_id,'budget',jsonb_build_object('version',old_version+1,'capMicros',new_cap,'spentMicros',new_spend,'paused',p_state->'paused','stopped',p_state->'stopped','breached',p_state->'breached'));
 return true;
end; $$;
revoke all on function public.cost_guard_read(uuid) from public,anon,authenticated;
revoke all on function public.cost_guard_cas(uuid,bigint,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.cost_guard_read(uuid) to service_role;
grant execute on function public.cost_guard_cas(uuid,bigint,jsonb,jsonb) to service_role;

insert into public.cost_pricing_versions(version,config) values ('v1', '{"version": "v1", "usdPerMillionTokens": 6, "margin": 2, "deployUsd": 1, "rangeFraction": 0.3, "features": {"static_page": {"tokens": 15000, "hours": 0.25, "weight": 1, "integrationUsd": 0}, "entity": {"tokens": 60000, "hours": 0.75, "weight": 1, "integrationUsd": 0}, "auth": {"tokens": 40000, "hours": 0.5, "weight": 1, "integrationUsd": 0}, "file_upload": {"tokens": 35000, "hours": 0.5, "weight": 1, "integrationUsd": 0}, "payment_pinelabs": {"tokens": 80000, "hours": 1, "weight": 1, "integrationUsd": 0}, "email": {"tokens": 30000, "hours": 0.5, "weight": 1, "integrationUsd": 0}, "ai_feature": {"tokens": 50000, "hours": 0.75, "weight": 1, "integrationUsd": 0}, "admin_dashboard": {"tokens": 70000, "hours": 1, "weight": 1, "integrationUsd": 0}}}'::jsonb);
