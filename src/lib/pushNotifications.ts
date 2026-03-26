// src/lib/pushNotifications.ts
// Easy GO Push Notifications — Capacitor Native (Android/iOS) + Web Push fallback

import { Capacitor } from '@capacitor/core';

// ─── Native Push (Android / iOS via Firebase FCM) ────────────────────────────
async function registerNativePush(userId: string, supabase: any): Promise<boolean> {
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');

    // Request permission
    const permResult = await PushNotifications.requestPermissions();
    if (permResult.receive !== 'granted') {
      console.warn('Push permission denied');
      return false;
    }

    // Register with FCM
    await PushNotifications.register();

    // Get FCM token — fires via 'registration' event
    return new Promise((resolve) => {
      // Timeout after 10s
      const timeout = setTimeout(() => resolve(false), 10_000);

      PushNotifications.addListener('registration', async (token) => {
        clearTimeout(timeout);
        console.log('✅ FCM Token:', token.value);

        // Save FCM token to Supabase
        const { error } = await supabase.from('push_subscriptions').upsert({
          user_id:    userId,
          endpoint:   token.value,   // FCM token stored as endpoint
          p256dh:     'fcm',         // marker so backend knows it's FCM
          auth:       'fcm',
          user_agent: `Android FCM ${Capacitor.getPlatform()}`,
        }, { onConflict: 'user_id,endpoint' });

        if (error) {
          console.error('Failed to save FCM token:', error);
          resolve(false);
        } else {
          resolve(true);
        }
      });

      PushNotifications.addListener('registrationError', (err) => {
        clearTimeout(timeout);
        console.error('FCM registration error:', err);
        resolve(false);
      });
    });
  } catch (err) {
    console.error('Native push registration failed:', err);
    return false;
  }
}

// ─── Web Push fallback (browser only) ────────────────────────────────────────
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw     = window.atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

async function registerWebPush(userId: string, supabase: any): Promise<boolean> {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
    if (!VAPID_PUBLIC_KEY) return false;

    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;

    if (Notification.permission === 'denied') return false;
    if (Notification.permission !== 'granted') {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return false;
    }

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly:      true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    const json = sub.toJSON();
    const keys = json.keys as { p256dh: string; auth: string };

    const { error } = await supabase.from('push_subscriptions').upsert({
      user_id:    userId,
      endpoint:   json.endpoint,
      p256dh:     keys.p256dh,
      auth:       keys.auth,
      user_agent: navigator.userAgent.slice(0, 200),
    }, { onConflict: 'user_id,endpoint' });

    if (error) { console.error('Failed to save web push subscription:', error); return false; }
    console.log('✅ Web push notifications enabled');
    return true;
  } catch (err) {
    console.error('Web push registration failed:', err);
    return false;
  }
}

// ─── Main export: auto-picks native or web ───────────────────────────────────
export async function registerPush(userId: string, supabase: any): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    return registerNativePush(userId, supabase);
  }
  return registerWebPush(userId, supabase);
}

// ─── Local notification (shows even when app is open) ────────────────────────
export async function showLocalNotification(title: string, body: string, extra?: any) {
  try {
    if (Capacitor.isNativePlatform()) {
      const { LocalNotifications } = await import('@capacitor/local-notifications');

      // Create high-priority notification channel (Android 8+)
      await LocalNotifications.createChannel({
        id:          'order_alerts',
        name:        'Order Alerts',
        description: 'Incoming order notifications for drivers',
        importance:  5,          // IMPORTANCE_HIGH — shows as heads-up banner
        visibility:  1,          // VISIBILITY_PUBLIC — shows on lock screen
        sound:       'default',
        vibration:   true,
        lights:      true,
        lightColor:  '#f5c518',
      });

      await LocalNotifications.schedule({
        notifications: [{
          id:        Math.floor(Math.random() * 100000),
          title,
          body,
          channelId: 'order_alerts',
          extra,
          // Show on lock screen and over other apps
          visibility:       1,
          ongoing:          false,
          autoCancel:       true,
          largeIcon:        'ic_launcher',
          smallIcon:        'ic_stat_notify',
          actionTypeId:     'ORDER_ACTION',
        }],
      });
    } else {
      // Browser fallback
      if (Notification.permission === 'granted') {
        new Notification(title, { body, icon: '/icon-192.png' });
      }
    }
  } catch (err) {
    console.error('Local notification failed:', err);
  }
}

// ─── Setup incoming push listeners (call once on app start) ──────────────────
export async function setupPushListeners(onOrderReceived: (data: any) => void) {
  if (!Capacitor.isNativePlatform()) return;

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const { LocalNotifications } = await import('@capacitor/local-notifications');

    // Handle push received while app is OPEN (foreground)
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('Push received (foreground):', notification);
      const data = notification.data;

      // If it's an order notification, trigger the in-app popup
      if (data?.type === 'new_order' || data?.order_id) {
        onOrderReceived(data);
      }

      // Also show a local heads-up banner
      showLocalNotification(notification.title || '🏍️ New Order!', notification.body || 'Tap to view');
    });

    // Handle push tapped while app is in BACKGROUND or CLOSED
    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      console.log('Push tapped:', action);
      const data = action.notification.data;
      if (data?.type === 'new_order' || data?.order_id) {
        onOrderReceived(data);
      }
    });

    // Handle local notification tapped
    LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
      console.log('Local notification tapped:', action);
      if (action.notification.extra) {
        onOrderReceived(action.notification.extra);
      }
    });
  } catch (err) {
    console.error('Push listener setup failed:', err);
  }
}

// ─── Vibration helper ─────────────────────────────────────────────────────────
export function vibrateDevice(pattern: number[] = [500, 300, 500, 300, 500]) {
  try {
    if (navigator.vibrate) navigator.vibrate(pattern);
  } catch (_) {}
}

export function stopVibration() {
  try {
    if (navigator.vibrate) navigator.vibrate(0);
  } catch (_) {}
}

// ─── Unregister ───────────────────────────────────────────────────────────────
export async function unregisterPush(userId: string, supabase: any) {
  try {
    if (Capacitor.isNativePlatform()) {
      const { PushNotifications } = await import('@capacitor/push-notifications');
      await PushNotifications.removeAllListeners();
    } else {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js');
      if (!reg) return;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
        await supabase.from('push_subscriptions').delete()
          .eq('user_id', userId).eq('endpoint', sub.endpoint);
      }
    }
  } catch (err) {
    console.error('Unregister push failed:', err);
  }
}

export function isPushSupported(): boolean {
  return Capacitor.isNativePlatform() || ('serviceWorker' in navigator && 'PushManager' in window);
}

export function isPushGranted(): boolean {
  if (Capacitor.isNativePlatform()) return true; // handled natively
  return Notification.permission === 'granted';
}