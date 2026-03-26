import { NotificationBell } from './NotificationBell';

export function Header() {
  return (
    <header style={{
      height: '48px',
      background: 'var(--bg)',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 16px',
      width: '100%',
      boxSizing: 'border-box',
    }}>
      {/* Logo — left edge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ fontSize: '18px', lineHeight: 1 }}>🛵</span>
        <span style={{
          color: 'var(--yellow)',
          fontWeight: 900,
          fontSize: '15px',
          fontFamily: 'Space Grotesk, sans-serif',
          letterSpacing: '-0.01em',
        }}>
          Easy GO
        </span>
      </div>

      {/* Bell — right edge */}
      <NotificationBell />
    </header>
  );
}