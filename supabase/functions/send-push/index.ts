// supabase/functions/send-push/index.ts
// Deploy: supabase functions deploy send-push

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// @deno-types="npm:@types/web-push"
import webpush from 'npm:web-push';

const VAPID_PUBLIC_KEY     = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY    = Deno.env.get('VAPID_PRIVATE_KEY')!;
const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

webpush.setVapidDetails(
  'mailto:wandaatech@gmail.com',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

serve(async (req) => {
  // Allow CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } });
  }

  try {
    const { user_ids, title, body, url, icon, tag } = await req.json();

    if (!user_ids?.length) {
      return new Response(JSON.stringify({ error: 'No user_ids provided' }), { status: 400 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Get all push subscriptions for these users
    const { data: subs, error } = await supabase
      .from('push_subscriptions')
      .select('*')
      .in('user_id', user_ids);

    if (error) throw error;
    if (!subs?.length) {
      return new Response(JSON.stringify({ sent: 0, message: 'No subscribers found' }), { status: 200 });
    }

    const payload = JSON.stringify({
      title: title || 'Easy GO',
      body:  body  || 'You have a new notification',
      url:   url   || '/',
      icon:  icon  || '/icon-192.png',
      tag:   tag   || 'easygo',
    });

    let sent = 0, failed = 0;
    const staleIds: string[] = [];

    await Promise.allSettled(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload
          );
          sent++;
        } catch (err: any) {
          failed++;
          // 410 Gone or 404 = subscription expired, remove it
          if (err.statusCode === 410 || err.statusCode === 404) {
            staleIds.push(sub.id);
          }
        }
      })
    );

    // Clean up expired subscriptions
    if (staleIds.length > 0) {
      await supabase.from('push_subscriptions').delete().in('id', staleIds);
    }

    return new Response(
      JSON.stringify({ sent, failed, stale_removed: staleIds.length }),
      { headers: { 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    console.error('send-push error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});