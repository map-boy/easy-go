/**
 * IncomingOrderModal.tsx
 *
 * Full-screen incoming order alert for motaris.
 * Shows order details, 30-second countdown, Accept/Decline buttons.
 * Countdown is calculated from expires_at so it's always accurate.
 */

import { useEffect, useState, useRef } from 'react';
import { RiderAlert } from '../../lib/riderAlert';

interface IncomingOrderModalProps {
  order: {
    id: string;
    sender_location: string;
    receiver_location: string;
    predicted_price: number;
    expires_at?: string;
  };
  onAccept:  () => void;
  onDecline: () => void;
  accepting?: boolean;
}

const TIMEOUT_SEC = 30;

function getInitialCountdown(expires_at?: string): number {
  if (!expires_at) return TIMEOUT_SEC;
  const remaining = Math.floor((new Date(expires_at).getTime() - Date.now()) / 1000);
  // Clamp between 1 and TIMEOUT_SEC
  return Math.min(TIMEOUT_SEC, Math.max(1, remaining));
}

export function IncomingOrderModal({
  order,
  onAccept,
  onDecline,
  accepting = false,
}: IncomingOrderModalProps) {
  const [countdown, setCountdown] = useState(() => getInitialCountdown(order.expires_at));
  const alertRef    = useRef<RiderAlert | null>(null);
  const declinedRef = useRef(false);

  // Start alert on mount, stop on unmount
  useEffect(() => {
    declinedRef.current = false;
    const alert = new RiderAlert();
    alertRef.current = alert;
    alert.start();
    return () => { alert.stop(); };
  }, []);

  // Recalculate initial countdown whenever order changes
  useEffect(() => {
    setCountdown(getInitialCountdown(order.expires_at));
    declinedRef.current = false;
  }, [order.id]);

  // Countdown timer — auto-decline at 0
  useEffect(() => {
    if (countdown <= 0) {
      if (!declinedRef.current) {
        declinedRef.current = true;
        alertRef.current?.stop();
        onDecline();
      }
      return;
    }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  function handleAccept() {
    if (accepting) return;
    alertRef.current?.stop();
    onAccept();
  }

  function handleDecline() {
    if (declinedRef.current) return;
    declinedRef.current = true;
    alertRef.current?.stop();
    onDecline();
  }

  const pct        = (countdown / TIMEOUT_SEC) * 100;
  const urgentColor = countdown <= 10 ? '#ef4444' : countdown <= 20 ? '#f97316' : '#f5c518';
  const earnings    = Math.round((order.predicted_price || 0) * 0.7);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      background: 'rgba(0,0,0,0.92)',
      backdropFilter: 'blur(10px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px',
      animation: countdown <= 5 ? 'screenUrgent 0.5s ease infinite alternate' : undefined,
    }}>
      <style>{`
        @keyframes ringBounce   { 0%,100%{transform:scale(1) rotate(-8deg)} 50%{transform:scale(1.18) rotate(8deg)} }
        @keyframes screenUrgent { from{background:rgba(0,0,0,0.92)} to{background:rgba(80,0,0,0.92)} }
        @keyframes fadeSlideUp  { from{opacity:0;transform:translateY(30px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulseRing    { 0%{box-shadow:0 0 0 0 rgba(245,197,24,0.6)} 70%{box-shadow:0 0 0 20px rgba(245,197,24,0)} 100%{box-shadow:0 0 0 0 rgba(245,197,24,0)} }
      `}</style>

      <div style={{
        background: 'linear-gradient(160deg, #0d1e35 0%, #0a0a14 100%)',
        border: `2px solid ${urgentColor}`,
        borderRadius: '24px',
        padding: '28px 24px',
        width: '100%',
        maxWidth: '380px',
        textAlign: 'center',
        animation: 'fadeSlideUp 0.3s ease',
        boxShadow: `0 0 40px ${urgentColor}44`,
      }}>

        {/* Animated icon */}
        <div style={{
          fontSize: '60px', marginBottom: '10px',
          display: 'inline-block',
          animation: 'ringBounce 0.6s ease infinite',
          filter: 'drop-shadow(0 0 12px rgba(245,197,24,0.6))',
        }}>🏍️</div>

        <p style={{
          fontFamily: 'Space Grotesk, sans-serif', fontWeight: 900,
          fontSize: '24px', color: '#f5c518', marginBottom: '4px',
          letterSpacing: '-0.02em',
        }}>New Order!</p>

        {/* Countdown */}
        <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '20px' }}>
          Accept within{' '}
          <strong style={{ color: urgentColor, fontSize: '20px', fontFamily: 'Space Grotesk, sans-serif' }}>
            {countdown}s
          </strong>
        </p>

        {/* Order details */}
        <div style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '14px', padding: '14px',
          marginBottom: '18px', textAlign: 'left',
        }}>
          {[
            { label: 'FROM', value: order.sender_location,   color: '#f59e0b' },
            { label: 'TO',   value: order.receiver_location, color: '#22c55e' },
          ].map(row => (
            <div key={row.label} style={{ display: 'flex', gap: '10px', marginBottom: '10px', alignItems: 'flex-start' }}>
              <span style={{
                fontSize: '10px', fontWeight: 800, color: row.color,
                background: `${row.color}18`, border: `1px solid ${row.color}33`,
                borderRadius: '5px', padding: '2px 6px',
                letterSpacing: '.06em', flexShrink: 0, marginTop: '1px',
              }}>{row.label}</span>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#e8edf5', lineHeight: 1.4 }}>
                {row.value}
              </span>
            </div>
          ))}

          {/* Earnings */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 14px',
            background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)',
            borderRadius: '10px', marginTop: '4px',
          }}>
            <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>Your earnings (70%)</span>
            <span style={{ fontSize: '22px', fontWeight: 900, color: '#22c55e', fontFamily: 'Space Grotesk, sans-serif' }}>
              {earnings.toLocaleString()} <span style={{ fontSize: '12px' }}>RWF</span>
            </span>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{
          height: '6px', background: 'rgba(255,255,255,0.07)',
          borderRadius: '6px', overflow: 'hidden', marginBottom: '20px',
        }}>
          <div style={{
            height: '100%', width: `${pct}%`,
            background: urgentColor, borderRadius: '6px',
            transition: 'width 1s linear, background 0.3s',
            boxShadow: `0 0 8px ${urgentColor}88`,
          }} />
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={handleDecline}
            disabled={accepting}
            style={{
              flex: 1, padding: '15px',
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.35)',
              borderRadius: '14px', color: '#ef4444',
              fontWeight: 800, fontSize: '15px', cursor: 'pointer',
              fontFamily: 'Space Grotesk, sans-serif',
              opacity: accepting ? 0.4 : 1,
            }}
          >✕ Decline</button>

          <button
            onClick={handleAccept}
            disabled={accepting}
            style={{
              flex: 2, padding: '15px',
              background: accepting ? 'rgba(34,197,94,0.5)' : 'linear-gradient(135deg, #22c55e, #16a34a)',
              border: 'none', borderRadius: '14px',
              color: '#fff', fontWeight: 900, fontSize: '16px',
              cursor: accepting ? 'not-allowed' : 'pointer',
              fontFamily: 'Space Grotesk, sans-serif',
              boxShadow: accepting ? 'none' : '0 4px 20px rgba(34,197,94,0.45)',
              animation: accepting ? 'none' : 'pulseRing 1.5s ease infinite',
            }}
          >
            {accepting ? '⏳ Accepting...' : '✓ Accept Order'}
          </button>
        </div>

        {countdown <= 10 && (
          <p style={{ fontSize: '11px', color: '#ef4444', marginTop: '12px', fontWeight: 700, letterSpacing: '.03em' }}>
            ⚡ Order moves to next rider in {countdown}s
          </p>
        )}
      </div>
    </div>
  );
}