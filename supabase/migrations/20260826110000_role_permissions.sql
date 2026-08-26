-- Replaces the fixed admin_permission enum with real RBAC: a roles table
-- admins can manage dynamically, a permission catalog, and a many-to-many
-- join between them. profiles.role stays as the cheap customer/admin
-- top-level flag (used by is_admin() for RLS); profiles.role_id points at
-- which specific admin role (if any) a user holds.

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  created_at timestamptz not null default now()
);

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  description text
);

create table public.role_permissions (
  role_id uuid not null references public.roles (id) on delete cascade,
  permission_id uuid not null references public.permissions (id) on delete cascade,
  primary key (role_id, permission_id)
);

alter table public.profiles add column role_id uuid references public.roles (id);

alter table public.profiles drop column admin_permission;

comment on column public.profiles.role is 'Coarse customer/admin flag, used for cheap RLS checks. Null-safe default: customer.';
comment on column public.profiles.role_id is 'Which admin role this user holds (Admin, Analyst, Manager, etc.) — null for customers. Governs actual permissions via role_permissions.';

-- helper for app-level and future RLS permission checks
create function public.has_permission(permission_key text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles p
    join public.role_permissions rp on rp.role_id = p.role_id
    join public.permissions perm on perm.id = rp.permission_id
    where p.id = auth.uid() and perm.key = permission_key
  );
$$;

-- seed the initial permission catalog, matching capabilities implied by
-- the existing admin screens (user management, case overrides, payments,
-- content moderation, support, settings)
insert into public.permissions (key, description) values
  ('users.view', 'View customer and staff accounts'),
  ('users.edit', 'Edit account details'),
  ('users.suspend', 'Suspend or reactivate accounts'),
  ('users.delete', 'Delete accounts'),
  ('cases.view', 'View case details'),
  ('cases.approve', 'Manually approve a case'),
  ('cases.reject', 'Reject or escalate a case'),
  ('payments.view', 'View payment records'),
  ('payments.refund', 'Issue refunds'),
  ('content.manage', 'Manage job postings and testimonial approvals'),
  ('support.manage', 'Respond to and resolve support tickets'),
  ('settings.manage', 'Manage admin accounts and platform settings');

-- seed initial roles
insert into public.roles (name, description) values
  ('Super Admin', 'Full access to every area of the platform'),
  ('Support Agent', 'Handles support tickets and customer-facing case questions'),
  ('Analyst', 'Reviews cases and payment activity, read-heavy access'),
  ('Manager', 'Oversees staff accounts and content moderation');

-- Super Admin gets every permission
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.name = 'Super Admin';

-- Support Agent: support + case visibility, no destructive user/payment actions
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p
  on p.key in ('support.manage', 'cases.view', 'users.view')
where r.name = 'Support Agent';

-- Analyst: read-heavy across cases/payments/users
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p
  on p.key in ('cases.view', 'payments.view', 'users.view')
where r.name = 'Analyst';

-- Manager: staff/content oversight
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p
  on p.key in ('users.view', 'users.edit', 'users.suspend', 'content.manage', 'settings.manage')
where r.name = 'Manager';

-- RLS: admin-only management of the role system itself. Not gating this
-- behind a specific permission (e.g. "roles.manage") to avoid a bootstrap
-- problem — any admin can manage roles for now; can be tightened once a
-- first Super Admin exists to delegate from.
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;

create policy "roles_select_admin" on public.roles
  for select using (public.is_admin());
create policy "roles_write_admin" on public.roles
  for all using (public.is_admin()) with check (public.is_admin());

create policy "permissions_select_admin" on public.permissions
  for select using (public.is_admin());

create policy "role_permissions_select_admin" on public.role_permissions
  for select using (public.is_admin());
create policy "role_permissions_write_admin" on public.role_permissions
  for all using (public.is_admin()) with check (public.is_admin());
