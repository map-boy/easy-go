import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { HomeTab }        from './tabs/HomeTab';
import { SenderOrderTab } from './tabs/SenderOrderTab';
import { TrackTab }       from './tabs/TrackTab';
import { ProfileTab }     from './tabs/ProfileTab';
import { DriverTab }      from './tabs/DriverTab';
import { DriverShopTab } from './tabs/DriverShopTab';
import { ReceiverTab }    from './tabs/ReceiverTab';
import { MyParcelTab }    from './tabs/MyParcelTab';
import { useAuth }        from '../contexts/AuthContext';

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

  const [activeTab, setActiveTab] = useState<TabType>('order');
  const LOCKED_TABS_DEMO: TabType[] = ['order', 'profile'];
  const [showDemoLock, setShowDemoLock] = useState(false);

  // Register push notifications when user logs in (dynamic import — works even if file missing)
  useEffect(() => {
    if (profile?.id) {
      import('../lib/pushNotifications')
        .then(({ registerPush }) => registerPush(profile!.id, supabase))
        .catch(() => {});
    }
  }, [profile?.id]);

  const isDriver   = profile?.user_category === 'motari'   || profile?.role === 'driver';
  const isReceiver = profile?.user_category === 'receiver' || profile?.role === 'receiver';

  // Receiver: Order / My Parcels / Profile  (no Home tab)
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
      if (isDriver)   return <DriverTab />;
      return <SenderOrderTab />;
    }
    if (activeTab === 'shop') return <DriverShopTab />;
    if (activeTab === 'home') return <HomeTab />;
    return null;
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: '70px' }}>

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
        <div style={{
          position: 'fixed', inset: 0, zIndex: 3000,
          background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
        }}
          onClick={() => setShowDemoLock(false)}
        >
          <div
            style={{ background: '#0f1923', border: '1px solid #1e2a3a', borderRadius: '20px', padding: '32px 24px', maxWidth: '320px', width: '100%', textAlign: 'center' }}
            onClick={e => e.stopPropagation()}
          >
            <p style={{ fontSize: '40px', marginBottom: '12px' }}>🔒</p>
            <h3 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '18px', fontWeight: 800, color: '#e8edf5', marginBottom: '8px' }}>
              Sign up to unlock
            </h3>
            <p style={{ fontSize: '13px', color: '#5a6a80', marginBottom: '24px' }}>
              Create a free account to place orders, track deliveries, and manage your profile.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                onClick={onExitDemo}
                style={{ padding: '13px', background: '#f5c842', border: 'none', borderRadius: '12px', fontWeight: 800, fontSize: '14px', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', color: '#080c14' }}
              >
                Create Account →
              </button>
              <button
                onClick={() => setShowDemoLock(false)}
                style={{ padding: '10px', background: 'transparent', border: '1px solid #1e2a3a', borderRadius: '12px', fontWeight: 600, fontSize: '13px', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', color: '#5a6a80' }}
              >
                Keep Exploring
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ maxWidth: '480px', margin: '0 auto' }}>
        {renderTab()}
      </div>

      {/* Bottom nav */}
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
                style={{
                  flex: 1,
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  padding: '10px 4px 8px',
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontFamily: 'Space Grotesk, sans-serif',
                  transition: 'opacity .15s',
                  position: 'relative',
                }}
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