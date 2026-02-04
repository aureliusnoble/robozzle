-- Schedule hourly cron job to send streak reminders
-- The function checks each user's timezone and only sends to those where it's 7pm local time

-- Enable pg_cron and pg_net extensions (required for scheduling HTTP calls)
-- Note: These extensions must be enabled in Supabase Dashboard > Database > Extensions

-- Schedule the streak reminder function to run every hour on the hour
-- This uses Supabase's built-in cron functionality via pg_cron
SELECT cron.schedule(
  'streak-reminder-hourly',         -- Job name
  '0 * * * *',                      -- Every hour on the hour
  $$
  SELECT net.http_post(
    url := 'https://kmfinqsnqghnnwuhfmxf.supabase.co/functions/v1/send-streak-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);

-- To view scheduled jobs:
-- SELECT * FROM cron.job;

-- To view job run history:
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;

-- To unschedule the job:
-- SELECT cron.unschedule('streak-reminder-hourly');
