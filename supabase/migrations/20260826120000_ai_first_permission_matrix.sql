-- Replaces the placeholder permissions/role_permissions catalog with the
-- real permission model: 8 roles x 6 domains, each cell a graded access
-- level (not a simple has/doesn't-have flag) — per the AI-First Admin
-- Permission Table spec. Nothing depends on the placeholder data yet
-- (no admin accounts exist), so this is a clean replacement, not a
-- backward-compatible migration.

drop function if exists public.has_permission(text);
drop table if exists public.role_permissions;
drop table if exists public.permissions;
drop table if exists public.role_domain_access;
delete from public.roles;

create table public.role_domain_access (
  role_id uuid not null references public.roles (id) on delete cascade,
  domain text not null check (domain in (
    'ai_pipeline', 'client_data', 'negotiation', 'finance', 'compliance', 'system'
  )),
  access_level text not null check (access_level in (
    'full', 'none', 'limited', 'flagged_only', 'read_only', 'assigned_only'
  )),
  primary key (role_id, domain)
);

comment on table public.role_domain_access is 'AI-First Admin Permission Table: per-role access level for each of the 6 domains. Levels are not linearly ordered (e.g. "flagged_only" vs "limited" are distinct modes, not degrees) — the app interprets each level contextually per domain/feature rather than treating this as a simple hierarchy.';

-- helper: returns this user's access level for a domain, or 'none' if
-- they hold no admin role (customers, or an admin role missing a row).
create function public.get_domain_access(p_domain text)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (
      select rda.access_level
      from public.profiles p
      join public.role_domain_access rda on rda.role_id = p.role_id
      where p.id = auth.uid() and rda.domain = p_domain
    ),
    'none'
  );
$$;

-- seed roles
insert into public.roles (name, description) values
  ('Super Admin', 'Full access across every domain'),
  ('AI Oversight', 'Monitors and audits the AI/OCR pipeline and compliance posture'),
  ('Finance Admin', 'Manages payments and billing; no negotiation or compliance access'),
  ('Negotiation Admin', 'Runs the negotiation/appeal workflow; no finance or compliance access'),
  ('Support Admin', 'Front-line customer support; full client data access, limited elsewhere'),
  ('Compliance Admin', 'Compliance and system oversight, read-only into negotiation'),
  ('Contractor', 'External/temporary staff, scoped to assigned clients and cases only'),
  ('System Admin', 'Infrastructure/system and compliance access; no client, negotiation, or finance access');

-- seed the access matrix
insert into public.role_domain_access (role_id, domain, access_level)
select r.id, d.domain, d.access_level
from public.roles r
join (values
  ('Super Admin',       'ai_pipeline', 'full'),
  ('Super Admin',       'client_data', 'full'),
  ('Super Admin',       'negotiation', 'full'),
  ('Super Admin',       'finance',     'full'),
  ('Super Admin',       'compliance',  'full'),
  ('Super Admin',       'system',      'full'),

  ('AI Oversight',      'ai_pipeline', 'full'),
  ('AI Oversight',      'client_data', 'limited'),
  ('AI Oversight',      'negotiation', 'flagged_only'),
  ('AI Oversight',      'finance',     'none'),
  ('AI Oversight',      'compliance',  'full'),
  ('AI Oversight',      'system',      'limited'),

  ('Finance Admin',     'ai_pipeline', 'limited'),
  ('Finance Admin',     'client_data', 'limited'),
  ('Finance Admin',     'negotiation', 'none'),
  ('Finance Admin',     'finance',     'full'),
  ('Finance Admin',     'compliance',  'none'),
  ('Finance Admin',     'system',      'none'),

  ('Negotiation Admin', 'ai_pipeline', 'flagged_only'),
  ('Negotiation Admin', 'client_data', 'limited'),
  ('Negotiation Admin', 'negotiation', 'full'),
  ('Negotiation Admin', 'finance',     'none'),
  ('Negotiation Admin', 'compliance',  'none'),
  ('Negotiation Admin', 'system',      'none'),

  ('Support Admin',     'ai_pipeline', 'limited'),
  ('Support Admin',     'client_data', 'full'),
  ('Support Admin',     'negotiation', 'limited'),
  ('Support Admin',     'finance',     'none'),
  ('Support Admin',     'compliance',  'none'),
  ('Support Admin',     'system',      'none'),

  ('Compliance Admin',  'ai_pipeline', 'full'),
  ('Compliance Admin',  'client_data', 'limited'),
  ('Compliance Admin',  'negotiation', 'read_only'),
  ('Compliance Admin',  'finance',     'none'),
  ('Compliance Admin',  'compliance',  'full'),
  ('Compliance Admin',  'system',      'full'),

  ('Contractor',        'ai_pipeline', 'limited'),
  ('Contractor',        'client_data', 'assigned_only'),
  ('Contractor',        'negotiation', 'assigned_only'),
  ('Contractor',        'finance',     'none'),
  ('Contractor',        'compliance',  'none'),
  ('Contractor',        'system',      'none'),

  ('System Admin',      'ai_pipeline', 'full'),
  ('System Admin',      'client_data', 'none'),
  ('System Admin',      'negotiation', 'none'),
  ('System Admin',      'finance',     'none'),
  ('System Admin',      'compliance',  'full'),
  ('System Admin',      'system',      'full')
) as d(role_name, domain, access_level) on d.role_name = r.name;

-- RLS for the new table (role_domain_access enabled already via table
-- creation above needing it explicitly; role_permissions/permissions RLS
-- policies were dropped along with their tables)
alter table public.role_domain_access enable row level security;

create policy "role_domain_access_select_admin" on public.role_domain_access
  for select using (public.is_admin());
create policy "role_domain_access_write_admin" on public.role_domain_access
  for all using (public.is_admin()) with check (public.is_admin());
