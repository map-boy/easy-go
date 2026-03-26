// src/components/Dashboard.tsx
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { HomeTab }        from './tabs/HomeTab';
import { SenderOrderTab } from './tabs/SenderOrderTab';
import { TrackTab }       from './tabs/TrackTab';
import { ProfileTab }     from './tabs/ProfileTab';
import { DriverTab }      from './tabs/DriverTab';
import { DriverShopTab }  from './tabs/DriverShopTab';
import { ReceiverTab }    from './tabs/ReceiverTab';
import { MyParcelTab }    from './tabs/MyParcelTab';
import { useAuth }        from '../contexts/AuthContext';
import { Header }         from './Header';
import { IncomingOrderModal } from './tabs/IncomingOrderModal';
import { registerPush, setupPushListeners, showLocalNotification } from '../lib/pushNotifications';
import { Capacitor } from '@capacitor/core';

type TabType = 'home' | 'order' | 'track' | 'profile' | 'shop';

interface DashboardProps {
  demo?: boolean;
  onExitDemo?: () => void;
}

const DEMO_PROFILE = {
  id:            'demo',
  full_name:     'Demo User',
  phone_number:  '+250780000000',
  district:      'Gasabo',
  location:      'Kigali, Rwanda',
  user_category: 'sender' as const,
  role:          'sender'  as const,
  is_active:     true,
};

export function Dashboard({ demo = false, onExitDemo }: DashboardProps) {
  const { profile: realProfile } = useAuth();
  const profile = demo ? DEMO_PROFILE : realProfile;

  const [activeTab, setActiveTab]       = useState<TabType>('home');
  const [showDemoLock, setShowDemoLock] = useState(false);
  const LOCKED_TABS_DEMO: TabType[]     = ['profile'];

  // ── GLOBAL incoming order state (lives here so modal shows on ANY tab) ──
  const [incomingOrder, setIncomingOrder] = useState<any>(null);
  const [acceptingOrder, setAcceptingOrder] = useState(false);
  const driverInfoRef = useRef<any>(null); // cache driver row for accept action

  const isInBackground = useRef(false);
  const reconnectTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const isDriver   = profile?.user_category === 'motari'   || profile?.role === 'driver';
  const isReceiver = profile?.user_category === 'receiver' || profile?.role === 'receiver';

  useEffect(() => {
    if (demo)            setActiveTab('home');
    else if (isReceiver) setActiveTab('order');
    else                 setActiveTab('home');
  }, [demo, isDriver, isReceiver]);

  // ── Load driver info once so we can accept orders from any tab ──────────
  useEffect(() => {
    if (!isDriver || !profile?.id || demo) return;
    supabase.from('drivers').select('*').eq('user_id', profile.id).single()
      .then(({ data }) => { if (data) driverInfoRef.current = data; });
  }, [isDriver, profile?.id, demo]);

  // ── GLOBAL dispatch listener — fires regardless of active tab ───────────
  useEffect(() => {
    if (!isDriver || !profile?.id || demo) return;

    const dispatchCh = supabase.channel('global-dispatch-' + profile.id)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'order_dispatches',
        filter: `driver_user_id=eq.${profile.id}`,
      }, async (payload: any) => {
        const dispatch = payload.new;
        if (dispatch.status !== 'pending') return;

        const { data: order } = await supabase
          .from('orders').select('*').eq('id', dispatch.order_id).single();

        if (order && order.status === 'pending') {
          // Show modal regardless of which tab is active
          setIncomingOrder({ ...order, expires_at: dispatch.expires_at });
          setAcceptingOrder(false);

          // Haptic feedback
          try {
            if (Capacitor.isNativePlatform()) {
              const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
              Haptics.impact({ style: ImpactStyle.Heavy });
            }
          } catch {}
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(dispatchCh); };
  }, [isDriver, profile?.id, demo]);

  // ── Accept incoming order (called from modal) ────────────────────────────
  async function acceptIncoming() {
    if (!incomingOrder) return;
    const driver = driverInfoRef.current;
    if (!driver) {
      // Try to fetch driver info if not cached yet
      const { data } = await supabase.from('drivers').select('*').eq('user_id', profile!.id).single();
      if (!data) return;
      driverInfoRef.current = data;
    }

    setAcceptingOrder(true);
    const { error } = await supabase.from('orders').update({
      driver_id: driverInfoRef.current.id,
      status: 'accepted',
      updated_at: new Date().toISOString(),
    }).eq('id', incomingOrder.id).eq('status', 'pending');

    if (!error) {
      // Navigate to orders tab so driver sees active order immediately
      setActiveTab('order');
    }
    setIncomingOrder(null);
    setAcceptingOrder(false);
  }

  // ── PUSH NOTIFICATIONS SETUP ─────────────────────────────────────────────
  useEffect(() => {
    if (demo || !profile?.id) return;

    registerPush(profile.id, supabase).then(ok => {
      if (ok) console.log('✅ Push notifications registered');
      else    console.warn('⚠️ Push notifications not registered');
    });

    setupPushListeners((data) => {
      console.log('📦 Order notification received via push:', data);
      if (isDriver) setActiveTab('order');
    });
  }, [profile?.id, demo]);

  // ── APP STATE LISTENERS (pause / resume) ─────────────────────────────────
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let appPlugin: any = null;

    const setupAppListeners = async () => {
      try {
        const { App } = await import('@capacitor/app');
        appPlugin = App;

        App.addListener('appStateChange', ({ isActive }: { isActive: boolean }) => {
          if (!isActive) {
            isInBackground.current = true;
            console.log('📱 App backgrounded — keeping Supabase alive');

            if (reconnectTimer.current) clearInterval(reconnectTimer.current);
            reconnectTimer.current = setInterval(async () => {
              if (!isInBackground.current) return;
              try {
                await supabase.from('profiles').select('id').limit(1);
                console.log('🔄 Background ping OK');
              } catch (_) {
                console.warn('⚠️ Background ping failed — reconnecting');
                supabase.realtime.connect();
              }
            }, 25_000);

          } else {
            isInBackground.current = false;
            console.log('📱 App foregrounded — reconnecting Supabase');

            if (reconnectTimer.current) {
              clearInterval(reconnectTimer.current);
              reconnectTimer.current = null;
            }
            try { supabase.realtime.connect(); } catch (_) {}
          }
        });

        App.addListener('appUrlOpen', (data: any) => {
          console.log('App opened via URL:', data);
          if (isDriver) setActiveTab('order');
        });

      } catch (err) {
        console.error('App state listener setup failed:', err);
      }
    };

    setupAppListeners();

    return () => {
      if (reconnectTimer.current) clearInterval(reconnectTimer.current);
      if (appPlugin) appPlugin.removeAllListeners?.();
    };
  }, [isDriver]);

  // ── KEEP SUPABASE REALTIME ALIVE ON WEB ──────────────────────────────────
  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        try { supabase.realtime.connect(); } catch (_) {}
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // ── Local notification when app is backgrounded ──────────────────────────
  useEffect(() => {
    if (!isDriver || demo || !profile?.id) return;

    const channel = supabase
      .channel('dashboard-order-watch-' + profile.id)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        async (payload: any) => {
          const order = payload.new;
          if (order.status !== 'pending') return;

          const isBackground = isInBackground.current || document.visibilityState !== 'visible';
          if (isBackground) {
            await showLocalNotification(
              '🏍️ New Order Available!',
              `${order.sender_location} → ${order.receiver_location}`,
              { type: 'new_order', order_id: order.id }
            );
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [isDriver, profile?.id, demo]);

  // ─────────────────────────────────────────────────────────────────────────

  const tabs = isReceiver ? [
    { id: 'order'   as TabType, label: 'Order',      emoji: '🛒' },
    { id: 'track'   as TabType, label: 'My Parcels', emoji: '📥' },
    { id: 'profile' as TabType, label: 'Profile',    emoji: '👤' },
  ] : isDriver ? [
    { id: 'home'    as TabType, label: 'Home',    emoji: '🏠' },
    { id: 'order'   as TabType, label: 'Orders',  emoji: '🏍️' },
    { id: 'shop'    as TabType, label: 'Shop',    emoji: '🛍️' },
    { id: 'track'   as TabType, label: 'Track',   emoji: '📍' },
    { id: 'profile' as TabType, label: 'Profile', emoji: '👤' },
  ] : [
    { id: 'home'    as TabType, label: 'Home',    emoji: '🏠' },
    { id: 'order'   as TabType, label: 'Send',    emoji: '📦' },
    { id: 'track'   as TabType, label: 'Track',   emoji: '📍' },
    { id: 'profile' as TabType, label: 'Profile', emoji: '👤' },
  ];

  function handleTabClick(id: TabType) {
    if (demo && LOCKED_TABS_DEMO.includes(id)) {
      setShowDemoLock(true);
      return;
    }
    setShowDemoLock(false);
    setActiveTab(id);
  }

  function renderTab() {
    if (activeTab === 'profile') return <ProfileTab />;
    if (activeTab === 'track') {
      if (isReceiver) return <MyParcelTab />;
      return <TrackTab />;
    }
    if (activeTab === 'order') {
      if (isReceiver) return <ReceiverTab />;
      // Pass a callback so DriverTab does NOT manage its own incoming modal
      if (isDriver)   return <DriverTab onIncomingOrder={setIncomingOrder} />;
      return <SenderOrderTab />;
    }
    if (activeTab === 'shop') return <DriverShopTab />;
    if (activeTab === 'home') return <HomeTab />;
    return null;
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: '70px' }}>

      {/* ── GLOBAL INCOMING ORDER MODAL — renders over everything ── */}
      {incomingOrder && (
        <IncomingOrderModal
          order={incomingOrder}
          accepting={acceptingOrder}
          onAccept={acceptIncoming}
          onDecline={() => {
            setIncomingOrder(null);
            setAcceptingOrder(false);
          }}
        />
      )}

      {/* ── HEADER ── */}
      <div style={{ width: '100%', position: 'sticky', top: 0, zIndex: 1500 }}>
        <Header />
      </div>

      {/* ── DEMO BANNER ── */}
      {demo && (
        <div style={{
          position: 'sticky', top: 0, zIndex: 2000,
          background: 'linear-gradient(90deg, #f5c842, #e8a020)',
          padding: '8px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '16px' }}>🎮</span>
            <div>
              <p style={{ fontSize: '12px', fontWeight: 800, color: '#080c14', margin: 0 }}>DEMO MODE</p>
              <p style={{ fontSize: '10px', color: '#3a2800', margin: 0 }}>Exploring Easy GO — some features locked</p>
            </div>
          </div>
          <button
            onClick={onExitDemo}
            style={{ background: 'rgba(0,0,0,0.15)', border: 'none', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: 700, color: '#080c14', fontFamily: 'Space Grotesk, sans-serif' }}
          >
            Sign Up / Login →
          </button>
        </div>
      )}

      {/* ── DEMO LOCK MODAL ── */}
      {demo && showDemoLock && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
          onClick={() => setShowDemoLock(false)}
        >
          <div
            style={{ background: '#0f1923', border: '1px solid #1e2a3a', borderRadius: '20px', padding: '32px 24px', maxWidth: '320px', width: '100%', textAlign: 'center' }}
            onClick={e => e.stopPropagation()}
          >
            <p style={{ fontSize: '40px', marginBottom: '12px' }}>🔒</p>
            <h3 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '18px', fontWeight: 800, color: '#e8edf5', marginBottom: '8px' }}>Sign up to unlock</h3>
            <p style={{ fontSize: '13px', color: '#5a6a80', marginBottom: '24px' }}>Create a free account to place orders, track deliveries, and manage your profile.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button onClick={onExitDemo} style={{ padding: '13px', background: '#f5c842', border: 'none', borderRadius: '12px', fontWeight: 800, fontSize: '14px', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', color: '#080c14' }}>
                Create Account →
              </button>
              <button onClick={() => setShowDemoLock(false)} style={{ padding: '10px', background: 'transparent', border: '1px solid #1e2a3a', borderRadius: '12px', fontWeight: 600, fontSize: '13px', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', color: '#5a6a80' }}>
                Keep Exploring
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ maxWidth: '480px', margin: '0 auto' }}>
        {renderTab()}
      </div>

      {/* ── BOTTOM NAV ── */}
      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'var(--nav-bg, rgba(10,10,10,0.96))',
        backdropFilter: 'blur(16px)',
        borderTop: '1px solid var(--border)',
        zIndex: 1000,
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}>
        <div style={{ maxWidth: '480px', margin: '0 auto', display: 'flex', justifyContent: 'space-around' }}>
          {tabs.map(tab => {
            const isActive = activeTab === tab.id;
            const isLocked = demo && LOCKED_TABS_DEMO.includes(tab.id);
            return (
              <button
                key={tab.id}
                onClick={() => handleTabClick(tab.id)}
                style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 4px 8px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', transition: 'opacity .15s', position: 'relative' }}
              >
                {isActive && !isLocked && (
                  <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: '28px', height: '2px', borderRadius: '2px', background: 'var(--yellow)' }} />
                )}
                <span style={{ fontSize: '22px', lineHeight: 1, marginBottom: '3px', opacity: isActive ? 1 : 0.4, filter: isActive ? 'none' : 'grayscale(1)', position: 'relative' }}>
                  {tab.emoji}
                  {isLocked && <span style={{ position: 'absolute', top: '-4px', right: '-6px', fontSize: '10px' }}>🔒</span>}
                </span>
                <span style={{ fontSize: '10px', fontWeight: 700, color: isActive ? 'var(--yellow)' : 'var(--text3)', letterSpacing: '.02em' }}>
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}