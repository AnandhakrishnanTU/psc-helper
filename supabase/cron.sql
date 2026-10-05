-- Schedules the PSC check every 3 hours. Run once in Supabase > SQL Editor,
-- after replacing YOUR_CRON_SECRET with the CRON_SECRET value set in Vercel.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove an older copy of the job if this script is run again
select cron.unschedule(jobid) from cron.job where jobname = 'govjoli-check';

select cron.schedule(
  'govjoli-check',
  '15 */3 * * *', -- minute 15 of every 3rd hour (UTC)
  $$
  select net.http_post(
    url := 'https://govjoli.codemure.com/api/cron/check',
    headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET', 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  );
  $$
);

-- To see recent runs:  select * from cron.job_run_details order by start_time desc limit 10;
-- To see responses:    select status_code, content from net._http_response order by created desc limit 10;
