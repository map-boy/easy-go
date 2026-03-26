// src/components/PermissionsScreen.tsx
// Shows after login — asks user to allow GPS and notifications

import { useState } from 'react';

// Safe Capacitor check — never crashes on web even if package is missing
async function isNative(): Promise<boolean> {
  try {
    const { Capacitor } = await import('@capacitor/core');
    return Capacitor.isNativePlatform();
  } catch { return false; }
}

interface Props {
  onDone: () => void;
}

export function PermissionsScreen({ onDone }: Props) {
  const [step, setStep]       = useState<'intro' | 'gps' | 'notif' | 'done'>('intro');
  const [gpsStatus,   setGpsStatus]   = useState<'pending' | 'granted' | 'denied'>('pending');
  const [notifStatus, setNotifStatus] = useState<'pending' | 'granted' | 'denied'>('pending');
  const [loading, setLoading] = useState(false);

  async function requestGPS() {
    setLoading(true);
    try {
      if (await isNative()) {
        // Native — use Capacitor Geolocation (only runs on real device)
        const { Geolocation } = await import('@capacitor/geolocation');
        const perm = await Geolocation.requestPermissions();
        setGpsStatus(perm.location === 'granted' ? 'granted' : 'denied');
      } else {
        // Web browser — use standard navigator.geolocation
        if (!navigator.geolocation) { setGpsStatus('denied'); }
        else {
          await new Promise<void>((resolve) => {
            navigator.geolocation.getCurrentPosition(
              () => { setGpsStatus('granted'); resolve(); },
              () => { setGpsStatus('denied');  resolve(); },
              { timeout: 10000 }
            );
          });
        }
      }
    } catch {
      setGpsStatus('denied');
    }
    setLoading(false);
    setStep('notif');
  }

  async function requestNotifications() {
    setLoading(true);
    try {
      if (await isNative()) {
        // Native — use Capacitor PushNotifications (only runs on real device)
        const { PushNotifications } = await import('@capacitor/push-notifications');
        const perm = await PushNotifications.requestPermissions();
        setNotifStatus(perm.receive === 'granted' ? 'granted' : 'denied');
      } else {
        // Web browser — use standard Notification API
        if (!('Notification' in window)) { setNotifStatus('denied'); }
        else {
          const result = await Notification.requestPermission();
          setNotifStatus(result === 'granted' ? 'granted' : 'denied');
        }
      }
    } catch {
      setNotifStatus('denied');
    }
    setLoading(false);
    setStep('done');
  }

  function skip() {
    setStep(step === 'gps' ? 'notif' : 'done');
  }

  if (step === 'done') {
    // Auto-advance after showing done screen
    setTimeout(onDone, 1500);
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={{ fontSize: '64px', marginBottom: '16px' }}>🎉</div>
          <h2 style={styles.title}>You're all set!</h2>
          <p style={styles.subtitle}>Welcome to Easy GO</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>

        {/* Progress dots */}
        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', marginBottom: '32px' }}>
          {['gps', 'notif'].map((s, i) => (
            <div key={s} style={{
              width: step === s ? '20px' : '8px',
              height: '8px',
              borderRadius: '4px',
              background: step === s ? '#f5c518' : 'rgba(255,255,255,0.2)',
              transition: 'all 0.3s',
            }} />
          ))}
        </div>

        {step === 'intro' && (
          <>
            <div style={{ fontSize: '64px', marginBottom: '20px' }}>🛵</div>
            <h1 style={{ ...styles.title, fontSize: '24px', marginBottom: '8px' }}>Welcome to Easy GO</h1>
            <p style={styles.subtitle}>Rwanda's fastest delivery app</p>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', marginBottom: '32px', lineHeight: 1.6 }}>
              To give you the best experience, we need a couple of permissions
            </p>
            <button onClick={() => setStep('gps')} style={styles.btnPrimary}>
              Get Started →
            </button>
          </>
        )}

        {step === 'gps' && (
          <>
            <div style={{ fontSize: '64px', marginBottom: '20px' }}>📍</div>
            <h2 style={styles.title}>Allow Location Access</h2>
            <p style={styles.subtitle}>So we can find drivers near you</p>

            <div style={styles.reasonBox}>
              <div style={styles.reasonRow}>
                <span style={styles.reasonIcon}>🏍️</span>
                <p style={styles.reasonText}>Find the nearest motari to your location</p>
              </div>
              <div style={styles.reasonRow}>
                <span style={styles.reasonIcon}>📦</span>
                <p style={styles.reasonText}>Track your delivery in real time on the map</p>
              </div>
              <div style={styles.reasonRow}>
                <span style={styles.reasonIcon}>💰</span>
                <p style={styles.reasonText}>Calculate accurate delivery price</p>
              </div>
            </div>

            {gpsStatus === 'denied' && (
              <p style={{ fontSize: '12px', color: '#ef4444', marginBottom: '12px' }}>
                ⚠️ Location denied — you can enable it later in phone Settings
              </p>
            )}

            <button onClick={requestGPS} disabled={loading} style={styles.btnPrimary}>
              {loading ? '⏳ Requesting...' : '📍 Allow Location'}
            </button>
            <button onClick={skip} style={styles.btnSkip}>
              Skip for now
            </button>
          </>
        )}

        {step === 'notif' && (
          <>
            <div style={{ fontSize: '64px', marginBottom: '20px' }}>🔔</div>
            <h2 style={styles.title}>Allow Notifications</h2>
            <p style={styles.subtitle}>Stay updated on your orders</p>

            <div style={styles.reasonBox}>
              <div style={styles.reasonRow}>
                <span style={styles.reasonIcon}>🏍️</span>
                <p style={styles.reasonText}>Get notified when a driver accepts your order</p>
              </div>
              <div style={styles.reasonRow}>
                <span style={styles.reasonIcon}>📦</span>
                <p style={styles.reasonText}>Know when your package is picked up or delivered</p>
              </div>
              <div style={styles.reasonRow}>
                <span style={styles.reasonIcon}>💰</span>
                <p style={styles.reasonText}>Receive wallet top-up confirmations instantly</p>
              </div>
            </div>

            {notifStatus === 'denied' && (
              <p style={{ fontSize: '12px', color: '#ef4444', marginBottom: '12px' }}>
                ⚠️ Notifications denied — you can enable them later in phone Settings
              </p>
            )}

            <button onClick={requestNotifications} disabled={loading} style={styles.btnPrimary}>
              {loading ? '⏳ Requesting...' : '🔔 Allow Notifications'}
            </button>
            <button onClick={skip} style={styles.btnSkip}>
              Skip for now
            </button>
          </>
        )}

      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #080c14 0%, #0f1e35 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
  },
  card: {
    width: '100%',
    maxWidth: '380px',
    textAlign: 'center',
  },
  title: {
    fontFamily: 'Space Grotesk, sans-serif',
    fontWeight: 800,
    fontSize: '22px',
    color: '#f0f0f0',
    marginBottom: '8px',
  },
  subtitle: {
    fontSize: '14px',
    color: 'rgba(255,255,255,0.5)',
    marginBottom: '24px',
  },
  reasonBox: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '14px',
    padding: '16px',
    marginBottom: '24px',
    textAlign: 'left',
  },
  reasonRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '12px',
  },
  reasonIcon: {
    fontSize: '20px',
    flexShrink: 0,
  },
  reasonText: {
    fontSize: '13px',
    color: 'rgba(255,255,255,0.6)',
    lineHeight: 1.4,
    margin: 0,
  },
  btnPrimary: {
    width: '100%',
    padding: '15px',
    background: '#f5c518',
    border: 'none',
    borderRadius: '14px',
    fontWeight: 800,
    fontSize: '15px',
    color: '#080c14',
    cursor: 'pointer',
    fontFamily: 'Space Grotesk, sans-serif',
    marginBottom: '10px',
  },
  btnSkip: {
    width: '100%',
    padding: '12px',
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '14px',
    fontWeight: 600,
    fontSize: '13px',
    color: 'rgba(255,255,255,0.35)',
    cursor: 'pointer',
    fontFamily: 'Space Grotesk, sans-serif',
  },
};