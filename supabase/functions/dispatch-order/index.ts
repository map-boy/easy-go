// supabase/functions/dispatch-order/index.ts
// Smart order dispatch — rings motaris one by one, 30 seconds each

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push';

const VAPID_PUBLIC_KEY     = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY    = Deno.env.get('VAPID_PRIVATE_KEY')!;
const FIREBASE_SA_JSON     = Deno.env.get('FIREBASE_SERVICE_ACCOUNT') || '';
const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails('mailto:wandaatech@gmail.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

async function getFCMAccessToken(sa: any): Promise<string | null> {
  try {
    const now = Math.floor(Date.now() / 1000);
    const header  = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const payload = btoa(JSON.stringify({
      iss: sa.client_email, sub: sa.client_email,
      aud: 'https://oauth2.googleapis.com/token',
      iat: now, exp: now + 3600,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
    }));
    const keyData = sa.private_key.replace('-----BEGIN PRIVATE KEY-----', '').replace('-----END PRIVATE KEY-----', '').replace(/\\n/g, '').trim();
    const binaryKey = Uint8Array.from(atob(keyData), c => c.charCodeAt(0));
    const cryptoKey = await crypto.subtle.importKey('pkcs8', binaryKey, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    const signingInput = `${header}.${payload}`;
    const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(signingInput));
    const jwt = `${signingInput}.${btoa(String.fromCharCode(...new Uint8Array(signature)))}`;
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    });
    const tokenData = await tokenRes.json();
    return tokenData.access_token || null;
  } catch { return null; }
}

async function sendPushToUser(
  supabase: any,
  userId: string,
  title: string,
  body: string,
  tag: string,
  fcmToken: string | null,
  sa: any
): Promise<boolean> {
  // Get all subscriptions for this user
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('*')
    .eq('user_id', userId);

  if (!subs?.length) return false;

  let sent = false;
  const payload = JSON.stringify({ title, body, url: '/', tag, urgent: true });

  for (const sub of subs) {
    const isFCM = sub.p256dh === 'fcm' || sub.auth === 'fcm';
    if (isFCM && fcmToken && sa) {
      try {
        const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${fcmToken}` },
          body: JSON.stringify({
            message: {
              token: sub.endpoint,
              notification: { title, body },
              data: { url: '/', tag },
              android: { priority: 'high', notification: { sound: 'default', channel_id: 'orders' } },
              apns: { payload: { aps: { sound: 'default', badge: 1 } } },
            },
          }),
        });
        if (res.ok) sent = true;
      } catch {}
    } else if (!isFCM) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
        sent = true;
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id);
        }
      }
    }
  }
  return sent;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { order_id, sender_location, receiver_location, predicted_price } = await req.json();
    if (!order_id) return new Response(JSON.stringify({ error: 'No order_id' }), { status: 400, headers: corsHeaders });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Parse Firebase service account
    let sa: any = null;
    let fcmToken: string | null = null;
    if (FIREBASE_SA_JSON) {
      try {
        sa = JSON.parse(FIREBASE_SA_JSON);
        fcmToken = await getFCMAccessToken(sa);
      } catch {}
    }

    // Get all on-duty motaris ordered by last_dispatch_at (least recently notified first)
    const { data: drivers } = await supabase
      .from('drivers')
      .select('id, user_id, last_dispatch_at')
      .eq('is_on_duty', true)
      .eq('is_available', true)
      .order('last_dispatch_at', { ascending: true, nullsFirst: true });

    if (!drivers?.length) {
      // No drivers available — update order status
      await supabase.from('orders').update({
        status: 'no_driver',
        updated_at: new Date().toISOString(),
      }).eq('id', order_id);
      return new Response(JSON.stringify({ dispatched: false, reason: 'No drivers on duty' }), { headers: corsHeaders });
    }

    const title = '🏍️ New Order — Accept Now!';
    const body  = `${sender_location} → ${receiver_location} · ${(predicted_price || 0).toLocaleString()} RWF`;

    // Dispatch one by one — ring each motari for 30 seconds
    for (const driver of drivers) {
      // Check order is still pending (not accepted by another driver)
      const { data: order } = await supabase
        .from('orders')
        .select('status, driver_id')
        .eq('id', order_id)
        .single();

      if (!order || order.status !== 'pending') break; // Already accepted

      // Mark this driver as last dispatched
      await supabase.from('drivers').update({
        last_dispatch_at: new Date().toISOString(),
      }).eq('id', driver.id);

      // Send push notification to this driver
      await sendPushToUser(supabase, driver.user_id, title, body, `order-${order_id}`, fcmToken, sa);

      // Also save to dispatch_log so DriverTab can show the ringing UI
      await supabase.from('order_dispatches').upsert({
        order_id,
        driver_id:    driver.id,
        driver_user_id: driver.user_id,
        dispatched_at: new Date().toISOString(),
        expires_at:    new Date(Date.now() + 30000).toISOString(),
        status:        'pending',
      }, { onConflict: 'order_id,driver_id' });

      // Wait 30 seconds then check if accepted
      await new Promise(r => setTimeout(r, 30000));

      // Check if this driver accepted
      const { data: updatedOrder } = await supabase
        .from('orders')
        .select('status, driver_id')
        .eq('id', order_id)
        .single();

      if (updatedOrder?.status !== 'pending') break; // Accepted — stop dispatching

      // Mark dispatch as expired
      await supabase.from('order_dispatches').update({ status: 'expired' })
        .eq('order_id', order_id).eq('driver_id', driver.id);
    }

    // Final check — if still pending after all drivers, mark no_driver
    const { data: finalOrder } = await supabase
      .from('orders').select('status').eq('id', order_id).single();

    if (finalOrder?.status === 'pending') {
      await supabase.from('orders').update({
        status: 'no_driver',
        updated_at: new Date().toISOString(),
      }).eq('id', order_id);
      return new Response(JSON.stringify({ dispatched: false, reason: 'All drivers declined or timed out' }), { headers: corsHeaders });
    }

    return new Response(JSON.stringify({ dispatched: true }), { headers: corsHeaders });

  } catch (err: any) {
    console.error('dispatch error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});