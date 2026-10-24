create table public.manual_credit_payments (
 id uuid primary key,
 account_id uuid not null references auth.users,
 credits integer not null check(credits between 100 and 10000),
 reference text unique check(reference ~ '^[0-9]{12}$'),
 status text not null default 'pending' check(status in ('pending','credited','rejected')),
 created_at timestamptz not null default now(),
 reviewed_by uuid references auth.users,
 reviewed_at timestamptz
);
create unique index manual_one_pending_per_account on public.manual_credit_payments(account_id) where status='pending';
alter table public.manual_credit_payments enable row level security;
revoke all on public.manual_credit_payments from public,anon,authenticated;
grant select,insert on public.manual_credit_payments to service_role;
create function public.review_manual_credit_payment(p_id uuid,p_actor uuid,p_approve boolean,p_reference text) returns text
language plpgsql security definer set search_path='' as $$
declare p public.manual_credit_payments%rowtype; s jsonb; v bigint; amount bigint; command jsonb;
begin
 if not exists(select 1 from public.profiles where id=p_actor and role in ('admin','operator')) then raise exception 'Staff required'; end if;
 select * into p from public.manual_credit_payments where id=p_id for update;
 if not found then raise exception 'Not found'; end if;
 if p.status <> 'pending' then return p.status; end if;
 if p_approve then
  if p_reference is null or p_reference !~ '^[0-9]{12}$' then raise exception 'Verified receipt reference required'; end if;
  update public.manual_credit_payments set reference=p_reference where id=p_id;
  p.reference:=p_reference;
  perform public.cost_wallet_read(p.account_id);
  select state,version into s,v from public.cost_wallet_accounts where account_id=p.account_id for update;
  amount:=p.credits::bigint*10000;
  if (s->>'paidUnits')::bigint+amount>9000000000000 then raise exception 'Wallet limit exceeded'; end if;
  command:=jsonb_build_object('type','topup','id','manual:'||p.id::text,'units',amount,'paymentRef','upi:'||p.reference,'reviewedBy',p_actor::text);
  s:=jsonb_set(s,'{paidUnits}',to_jsonb((s->>'paidUnits')::bigint+amount));
  s:=jsonb_set(s,'{version}',to_jsonb(v+1));
  s:=jsonb_set(s,'{fundingRefs}',(s->'fundingRefs')||jsonb_build_array(jsonb_build_object('ref','upi:'||p.reference,'units',amount)));
  update public.cost_wallet_accounts set state=s,version=v+1,updated_at=now() where account_id=p.account_id;
  insert into public.cost_wallet_journal(account_id,version,command) values(p.account_id,v+1,command);
 end if;
 update public.manual_credit_payments set status=case when p_approve then 'credited' else 'rejected' end,reviewed_by=p_actor,reviewed_at=now() where id=p_id returning status into p.status;
 return p.status;
end; $$;
revoke all on function public.review_manual_credit_payment(uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.review_manual_credit_payment(uuid,uuid,boolean,text) to service_role;
