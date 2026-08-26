-- Adds an `hr` domain (covers Careers: job postings, applicant/CV review)
-- and a new HR Admin role scoped to it. None of the 6 original domains
-- fit recruiting data — it isn't client billing data, negotiation,
-- finance, compliance, or system administration.

alter table public.role_domain_access drop constraint role_domain_access_domain_check;
alter table public.role_domain_access add constraint role_domain_access_domain_check
  check (domain in (
    'ai_pipeline', 'client_data', 'negotiation', 'finance', 'compliance', 'system', 'hr'
  ));

insert into public.roles (name, description) values
  ('HR Admin', 'Manages job postings and reviews applicant submissions; no access to customer, financial, or system data');

-- HR Admin: full on hr, none everywhere else
insert into public.role_domain_access (role_id, domain, access_level)
select r.id, d.domain, d.access_level
from public.roles r
join (values
  ('hr',           'full'),
  ('ai_pipeline',  'none'),
  ('client_data',  'none'),
  ('negotiation',  'none'),
  ('finance',      'none'),
  ('compliance',   'none'),
  ('system',       'none')
) as d(domain, access_level) on true
where r.name = 'HR Admin';

-- Super Admin: full on the new domain too, same as every other domain
insert into public.role_domain_access (role_id, domain, access_level)
select r.id, 'hr', 'full' from public.roles r where r.name = 'Super Admin';

-- Every other existing role: explicit 'none' on hr, for the same reason
-- every role has an explicit row per domain rather than relying on
-- get_domain_access()'s default-to-'none' fallback — keeps the grid
-- fully enumerated and auditable rather than implicit.
insert into public.role_domain_access (role_id, domain, access_level)
select r.id, 'hr', 'none'
from public.roles r
where r.name in (
  'AI Oversight', 'Finance Admin', 'Negotiation Admin',
  'Support Admin', 'Compliance Admin', 'Contractor', 'System Admin'
);
