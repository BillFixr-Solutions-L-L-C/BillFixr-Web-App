-- The automation engine owns a negotiation as its own record and hands
-- back an id. Without somewhere to keep that id, a negotiation could be
-- started and then never looked up again — the case would have no way to
-- ask the engine how it was going.
--
-- Nullable: only a case whose negotiation has actually been started has
-- one. Unique so a second start cannot quietly attach a new negotiation
-- to a case that already has one, which would strand the first (and the
-- letters it has already sent to the provider).
--
-- Written only by the server, through the service role, after the engine
-- confirms the start. Customers have no UPDATE on cases.

alter table public.cases
  add column if not exists negotiation_id text;

create unique index if not exists cases_negotiation_id_key
  on public.cases (negotiation_id)
  where negotiation_id is not null;

comment on column public.cases.negotiation_id is
  'The automation engine''s id for this case''s negotiation. Null until one is started. Unique: a case has at most one, and a negotiation belongs to one case.';
