// src/lib/pushNotifications.ts
// Easy GO Push Notifications — Web Push API

// ── IMPORTANT: Replace with your actual VAPID public key from Step 1 ─────────
// Run: npx web-push generate-vapid-keys
// Then paste your public key below:
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw     = window.atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

export async function registerPush(userId: string, supabase: any): Promise<boolean> {
  try {
    if (!('serviceWorker' in navigator)) {
      console.log('Service workers not supported');
      return false;
    }
    if (!('PushManager' in window)) {
      console.log('Push notifications not supported');
      return false;
    }
    if (!VAPID_PUBLIC_KEY) {
      console.warn('VAPID public key not set — add VITE_VAPID_PUBLIC_KEY to .env');
      return false;
    }

    // Register service worker
    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;

    // Check existing permission
    if (Notification.permission === 'denied') return false;

    // Ask permission if not yet granted
    if (Notification.permission !== 'granted') {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return false;
    }

    // Subscribe to push
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly:      true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    const json = sub.toJSON();
    const keys = json.keys as { p256dh: string; auth: string };

    // Save subscription to Supabase
    const { error } = await supabase.from('push_subscriptions').upsert({
      user_id:    userId,
      endpoint:   json.endpoint,
      p256dh:     keys.p256dh,
      auth:       keys.auth,
      user_agent: navigator.userAgent.slice(0, 200),
    }, { onConflict: 'user_id,endpoint' });

    if (error) {
      console.error('Failed to save push subscription:', error);
      return false;
    }

    console.log('✅ Push notifications enabled');
    return true;
  } catch (err) {
    console.error('Push registration failed:', err);
    return false;
  }
}

export async function unregisterPush(userId: string, supabase: any) {
  try {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js');
    if (!reg) return;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await sub.unsubscribe();
      await supabase.from('push_subscriptions').delete()
        .eq('user_id', userId).eq('endpoint', sub.endpoint);
    }
  } catch (err) {
    console.error('Unregister push failed:', err);
  }
}

export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window;
}

export function isPushGranted(): boolean {
  return Notification.permission === 'granted';
}