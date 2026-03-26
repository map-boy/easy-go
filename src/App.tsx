import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { Welcome } from './components/Welcome';
import { Auth } from './components/Auth';
import { Dashboard } from './components/Dashboard';
import { PermissionsScreen } from './components/PermissionsScreen';

// Safe splash screen helper — only runs on native Capacitor, ignored on web
async function hideSplash() {
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return;
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide();
  } catch (_) { /* not on native — silently ignore */ }
}

function AppContent() {
  const [showAuth, setShowAuth] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const { user, profile, loading, permissionsShown, setPermissionsShown } = useAuth();

  useEffect(() => {
    if (!loading) hideSplash();
    const timer = setTimeout(() => hideSplash(), 4000);
    return () => clearTimeout(timer);
  }, [loading]);

  if (loading) {
    return (
      <div style={{ background: '#0a0a0a', height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
        <div style={{ fontSize: '48px' }}>🛵</div>
        <p style={{ color: '#f5c518', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 800, fontSize: '20px' }}>Easy GO</p>
        <div style={{ width: '40px', height: '3px', background: 'rgba(245,197,24,0.2)', borderRadius: '2px', overflow: 'hidden' }}>
          <div style={{ height: '100%', background: '#f5c518', borderRadius: '2px', animation: 'loadBar 1.5s ease infinite' }} />
        </div>
        <style>{`@keyframes loadBar { 0%{width:0%} 100%{width:100%} }`}</style>
      </div>
    );
  }

  // Logged in but permissions not shown yet — show permissions screen first
  if (user && profile && !permissionsShown) {
    return (
      <PermissionsScreen onDone={() => setPermissionsShown(true)} />
    );
  }

  if (user && profile) return <Dashboard />;
  if (demoMode) return <Dashboard demo onExitDemo={() => setDemoMode(false)} />;
  if (showAuth) return <Auth onBack={() => setShowAuth(false)} onDemo={() => setDemoMode(true)} />;

  return <Welcome onGetStarted={() => setShowAuth(true)} onDemo={() => setDemoMode(true)} />;
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  );
}