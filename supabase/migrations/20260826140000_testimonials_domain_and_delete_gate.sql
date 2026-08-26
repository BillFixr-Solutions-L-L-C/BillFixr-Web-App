-- Fix 1: Testimonials didn't map to any domain. Unlike Careers (genuinely
-- distinct HR/recruiting data, hence its own domain), testimonials are
-- customer-submitted content tied to profiles — moderating them is a
-- client_data action, not a new functional area. Documenting that
-- decision on the table rather than adding an 8th domain.
comment on table public.testimonials is 'Moderation (approve/reject) is gated by the client_data domain — testimonials are customer-submitted content, not a distinct functional area like hr/finance/etc.';

-- Fix 2: client_data: full doesn't distinguish ordinary account
-- management (Suspend, which is reversible — a normal support action)
-- from Delete (irreversible). Support Admin should keep Suspend as part
-- of client_data: full, but Delete needs a higher bar. Adding a
-- dedicated flag rather than a new domain/access-level, since this is a
-- single specific capability, not a graded spectrum like the domain grid.
alter table public.roles add column can_delete_accounts boolean not null default false;

update public.roles set can_delete_accounts = true where name = 'Super Admin';

create function public.can_delete_accounts()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (
      select r.can_delete_accounts
      from public.profiles p
      join public.roles r on r.id = p.role_id
      where p.id = auth.uid()
    ),
    false
  );
$$;
