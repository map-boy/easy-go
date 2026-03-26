// supabase/functions/send-push/index.ts
// Web Push (browser) + FCM V1 API (Android/iOS native)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push';

const VAPID_PUBLIC_KEY      = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY     = Deno.env.get('VAPID_PRIVATE_KEY')!;
const FIREBASE_SA_JSON      = Deno.env.get('FIREBASE_SERVICE_ACCOUNT') || '';
const SUPABASE_URL          = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails('mailto:wandaatech@gmail.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

// Get FCM V1 access token using service account
async function getFCMAccessToken(serviceAccount: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
  }));

  // Import private key
  const privateKey = serviceAccount.private_key;
  const keyData = privateKey
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\n/g, '')
    .trim();

  const binaryKey = Uint8Array.from(atob(keyData), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );

  const signingInput = `${header}.${payload}`;
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );
  const jwt = `${signingInput}.${btoa(String.fromCharCode(...new Uint8Array(signature)))}`;

  // Exchange JWT for access token
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const tokenData = await tokenRes.json();
  return tokenData.access_token;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { user_ids, title, body, url, icon, tag } = await req.json();

    if (!user_ids?.length) {
      return new Response(JSON.stringify({ error: 'No user_ids' }), { status: 400, headers: corsHeaders });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('*')
      .in('user_id', user_ids);

    if (!subs?.length) {
      return new Response(JSON.stringify({ sent: 0, message: 'No subscribers' }), { status: 200, headers: corsHeaders });
    }

    const payload = {
      title: title || 'Easy GO',
      body:  body  || '',
      url:   url   || '/',
      icon:  icon  || '/icon-192.png',
      tag:   tag   || 'easygo',
    };

    // Parse service account if available
    let serviceAccount: any = null;
    let fcmAccessToken: string | null = null;
    if (FIREBASE_SA_JSON) {
      try {
        serviceAccount = JSON.parse(FIREBASE_SA_JSON);
        fcmAccessToken = await getFCMAccessToken(serviceAccount);
      } catch (e) {
        console.error('Failed to get FCM token:', e);
      }
    }

    let sent = 0, failed = 0;
    const staleIds: string[] = [];

    await Promise.allSettled(subs.map(async (sub) => {
      const isFCM = sub.p256dh === 'fcm' || sub.auth === 'fcm';

      if (isFCM) {
        // FCM V1 API
        if (!fcmAccessToken || !serviceAccount) { failed++; return; }
        try {
          const projectId = serviceAccount.project_id;
          const res = await fetch(
            `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${fcmAccessToken}`,
              },
              body: JSON.stringify({
                message: {
                  token: sub.endpoint,
                  notification: {
                    title: payload.title,
                    body:  payload.body,
                  },
                  data: { url: payload.url, tag: payload.tag },
                  android: {
                    priority: 'high',
                    notification: { sound: 'default', icon: 'ic_launcher' },
                  },
                  apns: {
                    payload: {
                      aps: { sound: 'default', badge: 1 },
                    },
                  },
                },
              }),
            }
          );
          const data = await res.json();
          if (res.ok) sent++;
          else {
            failed++;
            console.error('FCM error:', data);
            if (data?.error?.details?.[0]?.errorCode === 'UNREGISTERED') {
              staleIds.push(sub.id);
            }
          }
        } catch (e) { failed++; console.error('FCM send error:', e); }

      } else {
        // Web Push — browser
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify(payload)
          );
          sent++;
        } catch (err: any) {
          failed++;
          if (err.statusCode === 410 || err.statusCode === 404) staleIds.push(sub.id);
        }
      }
    }));

    if (staleIds.length > 0) {
      await supabase.from('push_subscriptions').delete().in('id', staleIds);
    }

    return new Response(
      JSON.stringify({ sent, failed, stale_removed: staleIds.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    console.error('send-push error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});