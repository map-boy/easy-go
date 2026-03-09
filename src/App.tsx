import { useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { Welcome } from './components/Welcome';
import { Auth } from './components/Auth';
import { Dashboard } from './components/Dashboard';

function AppContent() {
  const [showAuth, setShowAuth] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0a0a0a 0%, #111111 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          background: '#141414', borderRadius: '16px',
          padding: '32px 40px', textAlign: 'center',
          border: '1px solid #222',
        }}>
          <p style={{ fontSize: '28px', marginBottom: '12px' }}>🚀</p>
          <div style={{ width: '28px', height: '28px', border: '3px solid #222', borderTopColor: '#f5c518', borderRadius: '50%', animation: 'spin .7s linear infinite', margin: '0 auto 12px' }} />
          <p style={{ fontWeight: 700, fontSize: '16px', color: '#f0f0f0' }}>Loading Easy GO...</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Logged in — show real dashboard
  if (user && profile) return <Dashboard />;

  // Demo mode — show dashboard with demo flag
  if (demoMode) return <Dashboard demo onExitDemo={() => setDemoMode(false)} />;

  // Auth screen
  if (showAuth) return (
    <Auth
      onBack={() => setShowAuth(false)}
      onDemo={() => { setShowAuth(false); setDemoMode(true); }}
    />
  );

  // Welcome / landing
  return (
    <Welcome
      onGetStarted={() => setShowAuth(true)}
      onDemo={() => setDemoMode(true)}
    />
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;