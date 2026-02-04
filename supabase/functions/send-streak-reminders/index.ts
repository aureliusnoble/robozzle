/**
 * Supabase Edge Function: send-streak-reminders
 *
 * This function is called hourly by a cron job. It sends push notifications
 * to users who:
 * 1. Have an active streak (current_streak > 0)
 * 2. Have push subscriptions registered
 * 3. Haven't completed today's daily puzzle yet (in their timezone)
 * 4. It's currently 7pm (19:00) in their timezone
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Web Push library for Deno
import webpush from 'npm:web-push@3.6.7';

interface PushSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface UserWithSubscriptions {
  id: string;
  current_streak: number;
  last_daily_date: string | null;
  timezone: string | null;
  push_subscriptions: PushSubscription[];
}

/**
 * Get current hour (0-23) in a specific timezone
 */
function getHourInTimezone(timezone: string): number {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    });
    return parseInt(formatter.format(new Date()), 10);
  } catch {
    // Invalid timezone, return -1 to skip
    return -1;
  }
}

/**
 * Get today's date (YYYY-MM-DD) in a specific timezone
 */
function getTodayInTimezone(timezone: string): string {
  try {
    return new Date().toLocaleDateString('en-CA', { timeZone: timezone });
  } catch {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'UTC' });
  }
}

serve(async (req) => {
  // CORS headers for preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      },
    });
  }

  // Verify authorization (cron job should include the service role key or a secret)
  const authHeader = req.headers.get('Authorization');
  const cronSecret = Deno.env.get('CRON_SECRET');

  // Allow either service role key or cron secret
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const isAuthorized =
    authHeader === `Bearer ${cronSecret}` ||
    authHeader === `Bearer ${supabaseServiceKey}`;

  if (!isAuthorized) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Initialize Supabase client
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey!);

  // Set up web-push with VAPID credentials
  const vapidSubject = Deno.env.get('VAPID_SUBJECT');
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');

  if (!vapidSubject || !vapidPublicKey || !vapidPrivateKey) {
    return new Response(JSON.stringify({ error: 'VAPID keys not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  // Get all users with active streaks who have push subscriptions
  const { data: users, error: fetchError } = await supabase
    .from('profiles')
    .select(`
      id,
      current_streak,
      last_daily_date,
      timezone,
      push_subscriptions(endpoint, p256dh, auth)
    `)
    .gt('current_streak', 0);

  if (fetchError) {
    console.error('Error fetching users:', fetchError);
    return new Response(JSON.stringify({ error: 'Failed to fetch users' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let sentCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const user of (users as UserWithSubscriptions[]) || []) {
    // Skip users without push subscriptions
    if (!user.push_subscriptions || user.push_subscriptions.length === 0) {
      skippedCount++;
      continue;
    }

    const timezone = user.timezone || 'UTC';
    const currentHour = getHourInTimezone(timezone);

    // Only send if it's 7pm (19:00) in user's timezone
    if (currentHour !== 19) {
      skippedCount++;
      continue;
    }

    // Only send if user hasn't completed today's daily puzzle
    const todayLocal = getTodayInTimezone(timezone);
    if (user.last_daily_date === todayLocal) {
      skippedCount++;
      continue;
    }

    // Send notification to all of this user's subscriptions
    for (const sub of user.push_subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          JSON.stringify({
            title: "Don't lose your streak!",
            body: `You have a ${user.current_streak}-day streak. Complete today's puzzle!`,
            url: '/robozzle/daily',
          })
        );
        sentCount++;
      } catch (err: unknown) {
        const error = err as { statusCode?: number };
        console.error('Error sending notification:', error);

        // Remove invalid subscriptions (410 = subscription expired, 404 = not found)
        if (error.statusCode === 410 || error.statusCode === 404) {
          await supabase
            .from('push_subscriptions')
            .delete()
            .eq('endpoint', sub.endpoint);
        }
        errorCount++;
      }
    }
  }

  return new Response(
    JSON.stringify({
      sent: sentCount,
      skipped: skippedCount,
      errors: errorCount,
      timestamp: new Date().toISOString(),
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    }
  );
});
