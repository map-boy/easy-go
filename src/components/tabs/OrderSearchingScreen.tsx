/**
 * OrderSearchingScreen.tsx
 *
 * Shown to the SENDER after placing an order.
 * Subscribes to Supabase Realtime on the order row and shows
 * live status: searching → notifying → accepted / no driver.
 *
 * Props:
 *   orderId  — UUID of the placed order
 *   onDone   — called when order is accepted or fails
 */

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

interface Props {
  orderId: string;
  onDone: (status: 'accepted' | 'no_driver') => void;
}

type Stage =
  | 'searching'      // initial
  | 'notifying'      // dispatch started
  | 'accepted'       // driver accepted
  | 'no_driver';     // all riders declined

const STAGE_CONTENT: Record<Stage, { emoji: string; title: string; sub: string; color: string }> = {
  searching:  { emoji: '🔍', title: 'Searching for riders…',      sub: 'Finding the nearest motari',           color: '#f5c518' },
  notifying:  { emoji: '🏍️', title: 'Notifying nearby riders…',  sub: 'Riders are being alerted one by one',  color: '#60a5fa' },
  accepted:   { emoji: '🎉', title: 'Rider accepted!',             sub: 'Your package is being picked up soon', color: '#22c55e' },
  no_driver:  { emoji: '😔', title: 'No riders available',         sub: 'Please try again in a few minutes',    color: '#ef4444' },
};

export function OrderSearchingScreen({ orderId, onDone }: Props) {
  const [stage,       setStage]       = useState<Stage>('searching');
  const [driverName,  setDriverName]  = useState('');
  const [dotCount,    setDotCount]    = useState(0);
  const [elapsedSec,  setElapsedSec]  = useState(0);

  // Animated dots for "searching…"
  useEffect(() => {
    const t = setInterval(() => setDotCount(d => (d + 1) % 4), 500);
    return () => clearInterval(t);
  }, []);

  // Elapsed time counter
  useEffect(() => {
    const t = setInterval(() => setElapsedSec(s => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // After 3 seconds switch to "notifying" (dispatch function has fired)
  useEffect(() => {
    const t = setTimeout(() => setStage(s => s === 'searching' ? 'notifying' : s), 3000);
    return () => clearTimeout(t);
  }, []);

  // Supabase Realtime — watch the order row for status changes
  useEffect(() => {
    const channel = supabase
      .channel(`order-status-${orderId}`)
      .on(
        'postgres_changes',
        {
          event:  'UPDATE',
          schema: 'public',
          table:  'orders',
          filter: `id=eq.${orderId}`,
        },
        async (payload: any) => {
          const order = payload.new;

          if (order.status === 'accepted' || order.driver_id) {
            // Fetch driver name for display
            if (order.driver_id) {
              const { data: driver } = await supabase
                .from('drivers')
                .select('profiles:user_id(full_name)')
                .eq('id', order.driver_id)
                .single();
              const name = (driver as any)?.profiles?.full_name;
              if (name) setDriverName(name);
            }
            setStage('accepted');
            setTimeout(() => onDone('accepted'), 2500);
          }

          if (order.status === 'no_driver') {
            setStage('no_driver');
            setTimeout(() => onDone('no_driver'), 3000);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [orderId]);

  const content = STAGE_CONTENT[stage];
  const dots    = '.'.repeat(dotCount);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 5000,
      background: '#080c14',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '32px 24px',
      fontFamily: 'Space Grotesk, sans-serif',
    }}>
      <style>{`
        @keyframes spinRing {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes bounceIn {
          0%   { transform: scale(0.5); opacity: 0; }
          70%  { transform: scale(1.15); }
          100% { transform: scale(1);   opacity: 1; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
        @keyframes radiateRing {
          0%   { transform: scale(1);   opacity: 0.6; }
          100% { transform: scale(2.2); opacity: 0; }
        }
      `}</style>

      {/* Radiate rings behind icon */}
      <div style={{ position: 'relative', marginBottom: '32px' }}>
        {(stage === 'searching' || stage === 'notifying') && [0, 1, 2].map(i => (
          <div key={i} style={{
            position: 'absolute',
            inset: '-20px',
            borderRadius: '50%',
            border: `2px solid ${content.color}44`,
            animation: `radiateRing 2s ease ${i * 0.65}s infinite`,
          }} />
        ))}

        {/* Main icon circle */}
        <div style={{
          width: '96px', height: '96px',
          borderRadius: '50%',
          background: `${content.color}18`,
          border: `3px solid ${content.color}55`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '44px',
          animation: stage === 'accepted' ? 'bounceIn 0.5s ease' : undefined,
          position: 'relative',
        }}>
          {content.emoji}

          {/* Spinning ring for active states */}
          {(stage === 'searching' || stage === 'notifying') && (
            <div style={{
              position: 'absolute', inset: '-6px',
              borderRadius: '50%',
              border: `3px solid transparent`,
              borderTopColor: content.color,
              animation: 'spinRing 1s linear infinite',
            }} />
          )}
        </div>
      </div>

      {/* Status text */}
      <h2 style={{
        fontSize: '22px', fontWeight: 900,
        color: content.color,
        marginBottom: '8px', letterSpacing: '-0.02em',
        textAlign: 'center',
      }}>
        {content.title}{stage !== 'accepted' && stage !== 'no_driver' ? dots : ''}
      </h2>

      <p style={{ fontSize: '14px', color: '#5a6a80', textAlign: 'center', marginBottom: '32px', maxWidth: '260px', lineHeight: 1.5 }}>
        {stage === 'accepted' && driverName
          ? `${driverName} is on the way to pick up your package`
          : content.sub}
      </p>

      {/* Timeline steps */}
      <div style={{ width: '100%', maxWidth: '300px', display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '32px' }}>
        {([
          { key: 'searching', label: 'Order placed',          doneWhen: ['notifying','accepted','no_driver'] },
          { key: 'notifying', label: 'Notifying riders',       doneWhen: ['accepted','no_driver'] },
          { key: 'accepted',  label: 'Rider accepted',         doneWhen: ['accepted'] },
        ] as const).map(step => {
          const isDone    = step.doneWhen.includes(stage as any);
          const isActive  = stage === step.key;
          const isFailed  = stage === 'no_driver' && step.key === 'accepted';
          return (
            <div key={step.key} style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              padding: '10px 14px',
              background: isDone ? `${content.color}0f` : 'rgba(255,255,255,0.03)',
              border: `1px solid ${isDone ? content.color + '33' : '#1e2a3a'}`,
              borderRadius: '10px',
              transition: 'all 0.4s',
            }}>
              <div style={{
                width: '26px', height: '26px', borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: isDone ? content.color : isActive ? `${content.color}22` : 'rgba(255,255,255,0.04)',
                border: isActive ? `2px solid ${content.color}` : 'none',
                animation: isActive ? 'pulse 1s ease infinite' : 'none',
                fontSize: '12px',
              }}>
                {isFailed ? '✕' : isDone ? '✓' : isActive ? '●' : '○'}
              </div>
              <span style={{
                fontSize: '13px', fontWeight: 700,
                color: isDone ? content.color : isActive ? '#e8edf5' : '#334155',
              }}>
                {step.label}
              </span>
              {isActive && (
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '3px' }}>
                  {[0,1,2].map(i => (
                    <div key={i} style={{
                      width: '5px', height: '5px', borderRadius: '50%',
                      background: content.color,
                      animation: `pulse 1.2s ease ${i * 0.3}s infinite`,
                    }} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Elapsed time */}
      {stage !== 'accepted' && stage !== 'no_driver' && (
        <p style={{ fontSize: '11px', color: '#1e2a3a' }}>
          Searching for {elapsedSec}s…
        </p>
      )}

      {/* Cancel button — only while still searching */}
      {(stage === 'searching' || stage === 'notifying') && (
        <button
          onClick={() => onDone('no_driver')}
          style={{
            marginTop: '20px',
            padding: '10px 28px',
            background: 'transparent',
            border: '1px solid #1e2a3a',
            borderRadius: '10px',
            color: '#334155',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'Space Grotesk, sans-serif',
          }}
        >
          Cancel order
        </button>
      )}
    </div>
  );
}