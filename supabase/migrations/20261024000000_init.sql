-- Buildwise core schema.
-- Users only read their own rows. Every write goes through the server with the service role,
-- so there are deliberately no insert, update or delete policies for any user-facing role.

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text not null,
  role text not null default 'user' check (role in ('user', 'operator', 'admin')),
  created_at timestamptz not null default now()
);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email) values (new.id, coalesce(new.email, ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('operator', 'admin')
  );
$$;

-- ---------------------------------------------------------------------------
-- Intake
-- ---------------------------------------------------------------------------
create table public.ideas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  text text not null check (char_length(text) between 50 and 2000),
  links text[] not null default '{}',
  status text not null default 'submitted'
    check (status in ('submitted', 'in_intake', 'spec_ready', 'failed')),
  created_at timestamptz not null default now()
);

create table public.intake_messages (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references public.ideas on delete cascade,
  role text not null check (role in ('agent', 'user')),
  content text not null,
  created_at timestamptz not null default now()
);

create table public.specs (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references public.ideas on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  version int not null default 1,
  spec jsonb not null,
  flag_reasons text[] not null default '{}',
  operator_status text not null default 'not_needed'
    check (operator_status in ('not_needed', 'pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  unique (idea_id, version)
);

-- ---------------------------------------------------------------------------
-- Quotes and payments
-- ---------------------------------------------------------------------------
create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  spec_id uuid not null references public.specs on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  selected_features jsonb not null default '{}',
  cost_usd numeric(10, 2) not null,
  low_usd numeric(10, 2) not null,
  high_usd numeric(10, 2) not null,
  hours numeric(6, 2) not null,
  model_budget_usd numeric(10, 4) not null,
  amount_inr numeric(12, 2),
  fx_rate numeric(10, 4),
  weights_version text not null,
  status text not null default 'draft' check (status in ('draft', 'locked', 'paid', 'expired')),
  share_slug text not null unique,
  locked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  provider text not null,
  provider_order_id text not null unique,
  amount_minor bigint not null,
  currency text not null,
  status text not null default 'created' check (status in ('created', 'paid', 'failed')),
  raw_event jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Builds, deployments, audits
-- ---------------------------------------------------------------------------
create table public.builds (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  mode text not null default 'buildwise' check (mode in ('buildwise', 'control')),
  status text not null default 'queued' check (status in (
    'queued', 'running', 'paused_budget', 'building_fix', 'deploying', 'auditing', 'released', 'failed'
  )),
  budget_usd numeric(10, 4) not null,
  spent_usd numeric(10, 4) not null default 0,
  tokens_in bigint not null default 0,
  tokens_out bigint not null default 0,
  retries int not null default 0,
  claimed_by text,
  heartbeat_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.build_events (
  id bigint generated always as identity primary key,
  build_id uuid not null references public.builds on delete cascade,
  ts timestamptz not null default now(),
  type text not null,
  payload jsonb not null default '{}'
);
create index build_events_build_id_ts on public.build_events (build_id, ts);

create table public.deployments (
  id uuid primary key default gen_random_uuid(),
  build_id uuid not null references public.builds on delete cascade,
  vercel_project_id text,
  url text,
  supabase_project_ref text,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table public.audits (
  id uuid primary key default gen_random_uuid(),
  deployment_id uuid not null references public.deployments on delete cascade,
  attempt int not null default 1,
  results jsonb not null default '[]',
  passed boolean not null default false,
  overridden boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Human-in-the-loop queue and the Supabase project pool
-- ---------------------------------------------------------------------------
create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('flagged_spec', 'budget_overrun', 'audit_override')),
  subject_id uuid not null,
  requested_at timestamptz not null default now(),
  decided_by uuid references auth.users,
  decided_at timestamptz,
  decision text check (decision in ('approved', 'rejected')),
  note text
);

create table public.supabase_pool (
  project_ref text primary key,
  api_url text not null,
  anon_key text not null,
  service_key_secret_ref text not null,
  assigned_build_id uuid references public.builds,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.ideas enable row level security;
alter table public.intake_messages enable row level security;
alter table public.specs enable row level security;
alter table public.quotes enable row level security;
alter table public.payments enable row level security;
alter table public.builds enable row level security;
alter table public.build_events enable row level security;
alter table public.deployments enable row level security;
alter table public.audits enable row level security;
alter table public.approvals enable row level security;
alter table public.supabase_pool enable row level security;

create policy "own or staff" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_staff()));

create policy "own or staff" on public.ideas for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_staff()));
create policy "own or staff" on public.specs for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_staff()));
create policy "own or staff" on public.quotes for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_staff()));
create policy "own or staff" on public.payments for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_staff()));
create policy "own or staff" on public.builds for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_staff()));

create policy "own or staff" on public.intake_messages for select to authenticated
  using (
    exists (select 1 from public.ideas i where i.id = idea_id and i.user_id = (select auth.uid()))
    or (select public.is_staff())
  );
create policy "own or staff" on public.build_events for select to authenticated
  using (
    exists (select 1 from public.builds b where b.id = build_id and b.user_id = (select auth.uid()))
    or (select public.is_staff())
  );
create policy "own or staff" on public.deployments for select to authenticated
  using (
    exists (select 1 from public.builds b where b.id = build_id and b.user_id = (select auth.uid()))
    or (select public.is_staff())
  );
create policy "own or staff" on public.audits for select to authenticated
  using (
    exists (
      select 1 from public.deployments d join public.builds b on b.id = d.build_id
      where d.id = deployment_id and b.user_id = (select auth.uid())
    )
    or (select public.is_staff())
  );

create policy "staff only" on public.approvals for select to authenticated
  using ((select public.is_staff()));

-- supabase_pool: RLS on, no policies. Service role only.

-- ---------------------------------------------------------------------------
-- The deployed URL is never readable directly; it is released through released_url().
-- ---------------------------------------------------------------------------
revoke select on public.deployments from anon, authenticated;
grant select (id, build_id, vercel_project_id, supabase_project_ref, status, created_at)
  on public.deployments to authenticated;

create function public.released_url(p_build_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select d.url
  from public.deployments d
  join public.builds b on b.id = d.build_id
  where d.build_id = p_build_id
    and b.user_id = auth.uid()
    and b.status = 'released'
  order by d.created_at desc
  limit 1;
$$;

revoke execute on function public.released_url(uuid) from public, anon;
grant execute on function public.released_url(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime for live build logs (RLS still applies to subscribers).
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.build_events;
