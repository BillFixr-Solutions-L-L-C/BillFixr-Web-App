-- Tracks whether the post-confirmation welcome email has been sent, so
-- the /welcome landing page can be idempotent (a reload, a re-clicked
-- confirmation link, or a retried fetch shouldn't send it twice).
alter table public.profiles add column welcome_email_sent_at timestamptz;
