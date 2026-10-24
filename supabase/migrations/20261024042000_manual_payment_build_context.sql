-- Navigation context only. Build preparation revalidates ownership, review and pricing.
alter table public.manual_credit_payments
 add column build_session uuid,
 add column build_revision integer,
 add constraint manual_build_context check (
  (build_session is null and build_revision is null) or
  (build_session is not null and build_revision is not null and build_revision > 0)
 );
