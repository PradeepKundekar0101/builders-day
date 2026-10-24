-- approvals.subject_id points at different tables by kind, so it cannot carry a foreign key.
-- Remove a flagged_spec approval with its spec, so the operator queue never shows orphans.
create function public.delete_spec_approvals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.approvals where kind = 'flagged_spec' and subject_id = old.id;
  return old;
end;
$$;

revoke execute on function public.delete_spec_approvals() from public, anon, authenticated;

create trigger on_spec_deleted
  after delete on public.specs
  for each row execute function public.delete_spec_approvals();

create index approvals_subject_id on public.approvals (subject_id);

-- Clear any orphans left before this trigger existed.
delete from public.approvals a
where a.kind = 'flagged_spec'
  and not exists (select 1 from public.specs s where s.id = a.subject_id);
