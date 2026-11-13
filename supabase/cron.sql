-- ============================================================
-- One Thing — notification schedule
-- Run this AFTER the "notify" function is deployed.
-- Replace the two placeholders below first:
--   YOUR-PROJECT-REF  → the id in your project URL (https://YOUR-PROJECT-REF.supabase.co)
--   YOUR-CRON-SECRET  → the same CRON_SECRET you saved in Edge Function secrets
--
-- It runs every 5 minutes; the function decides when it's 7 a.m. or 7 p.m. (once a day each)
-- in your time zone, so daylight-saving changes are handled automatically.
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove an older copy of the job if you're re-running this.
select cron.unschedule(jobid) from cron.job where jobname = 'one-thing-hourly';

select cron.schedule(
  'one-thing-hourly',
  '*/5 * * * *',
  $$
  select net.http_post(
    url     := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/notify',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-cron-secret', 'YOUR-CRON-SECRET'),
    body    := '{"event":"tick"}'::jsonb
  );
  $$
);
