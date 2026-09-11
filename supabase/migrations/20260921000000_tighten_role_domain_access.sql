-- Least-privilege review, user request (2026-09-11): "review each admin
-- role and remove unnecessary permissions." Four grants in the domain
-- matrix exceeded what each role's own seeded description says it needs
-- (see 20260826120000_ai_first_permission_matrix.sql /
-- 20260826130000_add_hr_domain_and_role.sql for the original grants).
--
-- Note: role_domain_access / get_domain_access() are not wired into any
-- real authorization check in the app today (confirmed by grep — only
-- read for the "domains granted" count on admin/user-management and
-- admin/settings). This migration corrects the declared/displayed policy
-- so it's accurate and least-privilege ahead of that ever being enforced,
-- not a change in any live runtime behavior. Super Admin (full access
-- everywhere) and the three actually-enforced booleans
-- (can_delete_accounts/can_delete_bills/can_issue_refunds) were reviewed
-- too and found already correctly minimal — untouched here.

-- Contractor: "External/temporary staff, scoped to assigned clients and
-- cases only" — no stated need for any AI/OCR pipeline access at all.
update public.role_domain_access
set access_level = 'none'
where domain = 'ai_pipeline'
  and role_id = (select id from public.roles where name = 'Contractor');

-- Finance Admin: "Manages payments and billing" — billing has no
-- relationship to the AI/OCR pipeline.
update public.role_domain_access
set access_level = 'none'
where domain = 'ai_pipeline'
  and role_id = (select id from public.roles where name = 'Finance Admin');

-- Compliance Admin: "Compliance and system oversight, read-only into
-- negotiation" — its own description frames this role as read-only/
-- oversight everywhere else; full operational access to the pipeline is
-- inconsistent with that, and unnecessary for an oversight function.
update public.role_domain_access
set access_level = 'read_only'
where domain = 'ai_pipeline'
  and role_id = (select id from public.roles where name = 'Compliance Admin');

-- AI Oversight: "Monitors and audits the AI/OCR pipeline and compliance
-- posture" — no stated need to see negotiation/appeal data, even
-- flagged-only.
update public.role_domain_access
set access_level = 'none'
where domain = 'negotiation'
  and role_id = (select id from public.roles where name = 'AI Oversight');
