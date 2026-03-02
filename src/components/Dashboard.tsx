import { useState } from 'react';
import { HomeTab }        from './tabs/HomeTab';
import { SenderOrderTab } from './tabs/SenderOrderTab';
import { TrackTab }       from './tabs/TrackTab';
import { ProfileTab }     from './tabs/ProfileTab';
import { DriverTab }      from './tabs/DriverTab';
import { ReceiverTab }    from './tabs/ReceiverTab';
import { useAuth }        from '../contexts/AuthContext';

type TabType = 'home' | 'order' | 'track' | 'profile';

export function Dashboard() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('home');

  const isDriver   = profile?.user_category === 'motari'   || profile?.role === 'driver';
  const isReceiver = profile?.user_category === 'receiver' || profile?.role === 'receiver';

  // Tab configs per role
  const tabs = isReceiver ? [
    { id: 'home'    as TabType, label: 'Home',       emoji: '🏠' },
    { id: 'track'   as TabType, label: 'My Parcels', emoji: '📥' },
    { id: 'profile' as TabType, label: 'Profile',    emoji: '👤' },
  ] : isDriver ? [
    { id: 'home'    as TabType, label: 'Home',    emoji: '🏠' },
    { id: 'order'   as TabType, label: 'Orders',  emoji: '🏍️' },
    { id: 'track'   as TabType, label: 'Track',   emoji: '📍' },
    { id: 'profile' as TabType, label: 'Profile', emoji: '👤' },
  ] : [
    { id: 'home'    as TabType, label: 'Home',    emoji: '🏠' },
    { id: 'order'   as TabType, label: 'Send',    emoji: '📦' },
    { id: 'track'   as TabType, label: 'Track',   emoji: '📍' },
    { id: 'profile' as TabType, label: 'Profile', emoji: '👤' },
  ];

  function renderTab() {
    if (activeTab === 'home') return <HomeTab />;

    if (activeTab === 'track') {
      if (isReceiver) return <ReceiverTab />;
      return <TrackTab />;
    }

    if (activeTab === 'order') {
      if (isDriver)   return <DriverTab />;
      if (isReceiver) return null;
      return <SenderOrderTab />;
    }

    if (activeTab === 'profile') return <ProfileTab />;

    return null;
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: '70px' }}>
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
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
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
                {isActive && (
                  <div style={{
                    position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
                    width: '28px', height: '2px', borderRadius: '2px',
                    background: 'var(--yellow)',
                  }} />
                )}
                <span style={{
                  fontSize: '22px', lineHeight: 1, marginBottom: '3px',
                  opacity: isActive ? 1 : 0.4,
                  filter: isActive ? 'none' : 'grayscale(1)',
                }}>
                  {tab.emoji}
                </span>
                <span style={{
                  fontSize: '10px', fontWeight: 700,
                  color: isActive ? 'var(--yellow)' : 'var(--text3)',
                  letterSpacing: '.02em',
                }}>
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
