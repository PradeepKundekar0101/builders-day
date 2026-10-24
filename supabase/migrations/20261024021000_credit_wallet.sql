-- PROVN credit accounts. Trusted server commands only; no browser ledger mutations.
create table public.cost_wallet_accounts (
 account_id uuid primary key references auth.users on delete cascade,
 version bigint not null default 0,
 state jsonb not null,
 updated_at timestamptz not null default now()
);
create table public.cost_wallet_journal (
 id bigint generated always as identity primary key,
 account_id uuid not null references auth.users on delete cascade,
 version bigint not null,
 command jsonb not null,
 created_at timestamptz not null default now(),
 unique(account_id,version)
);
alter table public.cost_wallet_accounts enable row level security;
alter table public.cost_wallet_journal enable row level security;
revoke all on public.cost_wallet_accounts,public.cost_wallet_journal from anon,authenticated;
alter table public.quotes add column billing_mode text not null default 'managed' check(billing_mode in ('managed','byok'));
alter table public.quotes add column spec_revision text;

create function public.cost_wallet_read(p_account_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 insert into public.cost_wallet_accounts(account_id,state) values(p_account_id,jsonb_build_object('accountId',p_account_id::text,'version',0,'paidUnits',0,'monthlyUnits',0,'period',null,'plan','payg','thresholdCredits',50,'runs','[]'::jsonb,'receipts','[]'::jsonb,'fundingRefs','[]'::jsonb)) on conflict do nothing;
 select state into result from public.cost_wallet_accounts where account_id=p_account_id;
 return result;
end; $$;

create function public.cost_wallet_cas(p_account_id uuid,p_expected_version bigint,p_state jsonb,p_command jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare old_state jsonb; old_version bigint; run jsonb; q public.quotes%rowtype; actor uuid;
begin
 select state,version into old_state,old_version from public.cost_wallet_accounts where account_id=p_account_id for update;
 if not found then raise exception 'Wallet not initialized'; end if;
 if old_version<>p_expected_version then return false; end if;
 if p_state->>'accountId'<>p_account_id::text or (p_state->>'version')::bigint<>old_version+1 then raise exception 'Invalid wallet version'; end if;
 if (p_state->>'paidUnits')::numeric<0 or (p_state->>'monthlyUnits')::numeric<0 then raise exception 'Negative wallet balance'; end if;
 if p_command->>'type' in ('approve','resume') then
  actor:=(p_command->>'actorId')::uuid;
  if actor<>p_account_id and not exists(select 1 from public.profiles where id=actor and role in ('operator','admin')) then raise exception 'Unauthorized wallet approver'; end if;
 end if;
 if p_command->>'type'='refund' and not exists(select 1 from public.profiles where id=(p_command->>'actorId')::uuid and role in ('operator','admin')) then raise exception 'Refund requires staff attribution'; end if;
 select r into run from jsonb_array_elements(p_state->'runs') r where r->>'id'=p_command->>'runId';
 -- Starting a funded quote creates its queued build in the same transaction as the hold.
 if p_command->>'type'='start' and exists(select 1 from jsonb_array_elements(old_state->'runs') r where r->>'id'=run->>'id' and r->>'phase'='ready') and run->>'phase'='running' and run->>'quoteId' is not null then
  select * into q from public.quotes where id=(run->>'quoteId')::uuid for update;
  if not found or q.user_id<>p_account_id or q.status<>'locked' or round(q.cost_usd*1000000)<>(run->>'capUnits')::numeric or q.spec_revision is distinct from run->>'specRevision' then raise exception 'Credit run must match its locked quote'; end if;
  if not exists(select 1 from public.specs where id=q.spec_id and operator_status in ('not_needed','approved')) then raise exception 'Operator review required'; end if;
  if q.billing_mode='byok' then raise exception 'BYOK key ownership integration required'; end if;
  if exists(select 1 from public.builds where quote_id=q.id) then raise exception 'Quote already has a build'; end if;
  insert into public.builds(id,quote_id,user_id,status,budget_usd) values((run->>'id')::uuid,q.id,p_account_id,'queued',q.model_budget_usd);
 end if;
 if p_command->>'type'='finish' and run->>'phase' in ('completed','failed') and run->>'quoteId' is not null then
  perform 1 from public.builds where id=(run->>'id')::uuid for update;
  if exists(select 1 from public.cost_guard_accounts g,jsonb_array_elements(g.state->'reservations') r where g.build_id=(run->>'id')::uuid and r->>'status' in ('reserved','started')) then raise exception 'Provider usage must be settled before wallet settlement'; end if;
 end if;
 update public.cost_wallet_accounts set version=old_version+1,state=p_state,updated_at=now() where account_id=p_account_id;
 insert into public.cost_wallet_journal(account_id,version,command) values(p_account_id,old_version+1,p_command);
 -- Retry-loop state is visible to the existing worker, without changing the provider ledger.
 if run is not null and run->>'quoteId' is not null then
  if p_command->>'type' in ('beginAttempt','reportAttempt','finish') and run->>'phase'='paused' then
   update public.builds set status='paused_budget' where id=(run->>'id')::uuid and status in ('queued','running','building_fix');
  elsif p_command->>'type'='resume' then
   update public.builds set status='queued' where id=(run->>'id')::uuid and status='paused_budget';
  elsif p_command->>'type'='finish' and run->>'phase'='failed' then
   update public.builds set status='failed' where id=(run->>'id')::uuid;
  end if;
 end if;
 return true;
end; $$;
revoke all on function public.cost_wallet_read(uuid) from public,anon,authenticated;
revoke all on function public.cost_wallet_cas(uuid,bigint,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.cost_wallet_read(uuid) to service_role;
grant execute on function public.cost_wallet_cas(uuid,bigint,jsonb,jsonb) to service_role;

-- Both legacy paid quotes and reserved credit runs can initialize the worker guard.
create or replace function public.cost_guard_read(p_build_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare b public.builds%rowtype; cap bigint; result jsonb;
begin
 select * into b from public.builds where id=p_build_id for update;
 if not found then raise exception 'Unknown build'; end if;
 select state into result from public.cost_guard_accounts where build_id=p_build_id;
 if found then return result; end if;
 if not exists(select 1 from public.quotes q where q.id=b.quote_id and q.status='paid') and not exists(select 1 from public.cost_wallet_accounts w, jsonb_array_elements(w.state->'runs') r where w.account_id=b.user_id and r->>'id'=b.id::text and r->>'quoteId'=b.quote_id::text and r->>'phase' in ('running','paused') and (r->>'heldPaid')::numeric+(r->>'heldMonthly')::numeric>0) then
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


create or replace function public.cost_guard_cas(p_build_id uuid,p_expected_version bigint,p_state jsonb,p_command jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare old_state jsonb; old_version bigint; b public.builds%rowtype; new_cap numeric; new_spend numeric; actor uuid; approval_id uuid;
begin
 -- Same lock order as wallet settlement: account, then build, then provider ledger.
 perform 1 from public.cost_wallet_accounts w where w.account_id=(select user_id from public.builds where id=p_build_id) for update;
 if exists(select 1 from public.cost_wallet_accounts w,jsonb_array_elements(w.state->'runs') r where r->>'id'=p_build_id::text and r->>'quoteId' is not null and w.account_id=(select user_id from public.builds where id=p_build_id)) then
  if p_command->>'type'='approve' then raise exception 'Wallet-funded cap changes require a new quote'; end if;
  if p_command->>'type' in ('reserve','start') and not exists(select 1 from public.cost_wallet_accounts w,jsonb_array_elements(w.state->'runs') r where w.account_id=(select user_id from public.builds where id=p_build_id) and r->>'id'=p_build_id::text and r->>'phase'='running' and exists(select 1 from jsonb_array_elements(r->'attempts') a where a->>'success' is null)) then raise exception 'Active wallet attempt required'; end if;
 end if;
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
   when exists(select 1 from public.cost_wallet_accounts w,jsonb_array_elements(w.state->'runs') r where w.account_id=b.user_id and r->>'id'=b.id::text and r->>'phase'='paused') then 'paused_budget'
   when b.status='paused_budget' then 'queued' else b.status end
  where id=p_build_id;
 insert into public.build_events(build_id,type,payload) values(p_build_id,'budget',jsonb_build_object('version',old_version+1,'capMicros',new_cap,'spentMicros',new_spend,'paused',p_state->'paused','stopped',p_state->'stopped','breached',p_state->'breached'));
 return true;
end; $$;

-- Locked quotes are immutable snapshots. A changed scope needs a new quote UUID.
create function public.cost_locked_quote_immutable() returns trigger language plpgsql set search_path='' as $$
begin
 if old.spec_revision is not null and old.status in ('locked','paid') and (to_jsonb(old)-'status') is distinct from (to_jsonb(new)-'status') then raise exception 'Locked credit quote is immutable'; end if;
 return new;
end; $$;
create trigger cost_locked_quote_immutable before update on public.quotes for each row execute function public.cost_locked_quote_immutable();
