import { useEffect, useRef, useState } from 'react';
import { CheckCircle, Navigation, Phone, Package, Clock, Wallet, ArrowUpRight, RefreshCw, Star } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { createNotification } from '../../lib/notifications';
import { IncomingOrderModal } from './IncomingOrderModal';
import { Capacitor } from '@capacitor/core';

export function DriverTab({ onIncomingOrder }: { onIncomingOrder?: (order: any) => void }) {
  const { profile } = useAuth();

  const [driverInfo,    setDriverInfo]    = useState<any>(null);
  const [pendingOrders, setPendingOrders] = useState<any[]>([]);
  const [activeOrder,   setActiveOrder]   = useState<any>(null);
  const [loading,       setLoading]       = useState(true);
  const [msg,           setMsg]           = useState('');
  const [msgType,       setMsgType]       = useState<'success'|'error'>('success');
  const [acceptingId,   setAcceptingId]   = useState<string | null>(null);
  

  // wallet
  const [walletBalance,  setWalletBalance]  = useState(0);
  const [totalEarned,    setTotalEarned]    = useState(0);
  const [completedTrips, setCompletedTrips] = useState(0);

  // withdraw
  const [showWithdraw,   setShowWithdraw]   = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawPhone,  setWithdrawPhone]  = useState('');
  const [withdrawStep,   setWithdrawStep]   = useState<'idle'|'processing'|'done'|'error'>('idle');
  const [withdrawErr,    setWithdrawErr]    = useState('');

  const lastGpsWrite = useRef<{ loc: [number, number]; time: number } | null>(null);
  const gpsWatchRef  = useRef<number | null>(null);

  // ── helpers ────────────────────────────────────────────────────────────────
  function notify(m: string, type: 'success'|'error' = 'success') {
    setMsg(m); setMsgType(type);
    setTimeout(() => setMsg(''), 3500);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // ✅ FIX 1: query by user_id NOT by id
  //    Old code: .eq('id', profile?.id)  ← WRONG, profile.id is auth user id
  //    Fixed:    .eq('user_id', profile.id) ← matches how ProfileTab does it
  // ────────────────────────────────────────────────────────────────────────────
  async function loadDriverData() {
    if (!profile?.id) return;
    setLoading(true);
    try {
      const { data: driver } = await supabase
        .from('drivers')
        .select('*')
        .eq('user_id', profile.id)   // ✅ FIXED
        .single();

      setDriverInfo(driver || null);

      if (driver?.id) {
        const { data: active } = await supabase
          .from('orders')
          .select('*, profiles:sender_id(full_name, phone_number), receiver:receiver_id(full_name, phone_number)')
          .eq('driver_id', driver.id)
          .in('status', ['accepted', 'in_transit', 'delivered'])
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        setActiveOrder(active || null);

        const { data: doneOrders } = await supabase
          .from('orders').select('id')
          .eq('driver_id', driver.id).eq('status', 'delivered');
        setCompletedTrips(doneOrders?.length ?? 0);
      }

      const { data: pending } = await supabase
        .from('orders')
        .select('*, profiles:sender_id(full_name, phone_number)')
        .in('status', ['pending', 'awaiting_payment'])
        .is('driver_id', null)
        .order('created_at', { ascending: false });
      setPendingOrders(pending || []);

      const { data: prof } = await supabase
        .from('profiles').select('wallet_balance, phone_number')
        .eq('id', profile.id).single();
      setWalletBalance(prof?.wallet_balance ?? 0);
      if (prof?.phone_number) setWithdrawPhone(prof.phone_number);

      const { data: txs } = await supabase
        .from('wallet_transactions').select('amount, type').eq('user_id', profile.id);
      const earned = (txs || []).filter((t: any) => t.type === 'topup').reduce((s: number, t: any) => s + (t.amount || 0), 0);
      setTotalEarned(earned);

    } catch (e) {
      console.error('DriverTab loadDriverData error:', e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (profile?.id) loadDriverData();
  }, [profile?.id]);

  // ── Realtime subscriptions ─────────────────────────────────────────────────
  useEffect(() => {
    if (!profile?.id) return;

    const channel = supabase.channel('driver-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, () => loadDriverData())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, () => loadDriverData())
      .subscribe();

    // ✅ FIX 2: filter on driver_user_id (what dispatch-order function inserts)
    const dispatchCh = supabase.channel('dispatch-' + profile.id)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'order_dispatches',
        filter: `driver_user_id=eq.${profile.id}`,
      }, async (payload: any) => {
        const dispatch = payload.new;
        if (dispatch.status !== 'pending') return;
        const { data: order } = await supabase
          .from('orders').select('*').eq('id', dispatch.order_id).single();
        if (order && order.status === 'pending') {
          onIncomingOrder?.({ ...order, expires_at: dispatch.expires_at });
          try {
            if (Capacitor.isNativePlatform()) {
              const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
              Haptics.impact({ style: ImpactStyle.Heavy });
            }
          } catch {}
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(dispatchCh);
    };
  }, [profile?.id]);

  // ── GPS tracking — only while on duty ──────────────────────────────────────
  useEffect(() => {
    // ✅ FIX 3: reads is_on_duty from driverInfo (same field ProfileTab uses)
    if (!driverInfo?.is_on_duty || !profile?.id) {
      if (gpsWatchRef.current !== null) {
        navigator.geolocation.clearWatch(gpsWatchRef.current);
        gpsWatchRef.current = null;
      }
      return;
    }
    if (!navigator.geolocation) return;

    gpsWatchRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        const now  = Date.now();
        const last = lastGpsWrite.current;
        if (!last || haversineMeters([lat, lng], last.loc) > 15 || (now - last.time) / 1000 > 20) {
          lastGpsWrite.current = { loc: [lat, lng], time: now };
          await supabase.from('drivers')
            .update({ latitude: lat, longitude: lng, location_updated_at: new Date().toISOString() })
            .eq('user_id', profile.id);
        }
      },
      null,
      { enableHighAccuracy: true, timeout: 10000 }
    );

    return () => {
      if (gpsWatchRef.current !== null) {
        navigator.geolocation.clearWatch(gpsWatchRef.current);
        gpsWatchRef.current = null;
      }
    };
  }, [driverInfo?.is_on_duty, profile?.id]);

  // ────────────────────────────────────────────────────────────────────────────
  // ✅ FIX 4: toggleDuty uses is_on_duty + is_available (same as ProfileTab)
  //           and uses driverInfo.id (drivers PK), NOT profile.id
  // ────────────────────────────────────────────────────────────────────────────
  async function toggleDuty() {
    if (!driverInfo) return;
    const newDuty = !driverInfo.is_on_duty;
    await supabase.from('drivers').update({
      is_on_duty:    newDuty,
      is_available:  newDuty,
      on_duty_since: newDuty ? new Date().toISOString() : null,
    }).eq('id', driverInfo.id);              // ✅ driverInfo.id, not profile.id
    setDriverInfo({ ...driverInfo, is_on_duty: newDuty, is_available: newDuty });
    notify(newDuty ? '🟢 You are now On Duty — orders will appear' : '🔴 You are now Off Duty');
  }

  // ── Order actions ──────────────────────────────────────────────────────────
  async function acceptOrder(order: any) {
    if (!driverInfo) return;
    setAcceptingId(order.id);
    const { error } = await supabase.from('orders').update({
      driver_id: driverInfo.id, status: 'accepted', updated_at: new Date().toISOString(),
    }).eq('id', order.id);
    setAcceptingId(null);
    if (error) { notify('❌ Failed to accept order', 'error'); return; }
    setPendingOrders(prev => prev.filter(o => o.id !== order.id));
    await createNotification(order.sender_id, '🏍️ Driver Accepted Your Order!',
      `Your driver is on the way to ${order.sender_location}`, 'order_accepted', order.id);
    notify('✅ Order accepted! Navigate to pickup.');
    loadDriverData();
  }

  

  async function markPickedUp() {
    if (!activeOrder) return;
    await supabase.from('orders').update({ status: 'in_transit', updated_at: new Date().toISOString() }).eq('id', activeOrder.id);
    await createNotification(activeOrder.sender_id, '📦 Package Picked Up!',
      `Your package is in transit to ${activeOrder.receiver_location}`, 'in_transit', activeOrder.id);
    notify('📦 Marked as picked up!');
    loadDriverData();
  }

  async function markDelivered() {
    if (!activeOrder) return;
    await supabase.from('orders').update({
      status: 'delivered', driver_confirmed: true, updated_at: new Date().toISOString(),
    }).eq('id', activeOrder.id);
    await createNotification(activeOrder.sender_id, '✅ Package Delivered!',
      `Please confirm delivery to release payment.`, 'delivered', activeOrder.id);
    notify('🎉 Marked as delivered! Waiting for sender to confirm.');
    loadDriverData();
  }

  async function handleWithdraw() {
    const amount = parseInt(withdrawAmount.replace(/\D/g, ''));
    if (!amount || amount < 500) { setWithdrawErr('Minimum 500 RWF'); return; }
    if (amount > walletBalance)  { setWithdrawErr('Insufficient balance'); return; }
    if (!withdrawPhone.trim())   { setWithdrawErr('Enter MoMo phone number'); return; }
    setWithdrawErr('');
    setWithdrawStep('processing');
    try {
      await supabase.rpc('increment_wallet_balance', { uid: profile!.id, delta: -amount });
      await supabase.from('wallet_transactions').insert({
        user_id: profile!.id, type: 'payment', amount, status: 'completed',
        description: `Withdrawal to MoMo ${withdrawPhone}`,
      });
      setWithdrawStep('done');
      loadDriverData();
    } catch {
      setWithdrawStep('error');
      setWithdrawErr('Withdrawal failed. Try again.');
    }
  }

  // ── All hooks declared above — safe early return ───────────────────────────
  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px' }}>
        <div className="spinner" style={{ margin: '0 auto 12px' }} />
        <p style={{ color: 'var(--text3)', fontSize: '13px' }}>Syncing with server…</p>
      </div>
    );
  }

  const isOnDuty       = !!driverInfo?.is_on_duty;
  const driverEarnings = activeOrder ? Math.round((activeOrder.predicted_price || 0) * 0.70) : 0;

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100%', paddingBottom: '80px' }}>

      

      {/* ── TOAST ── */}
      {msg && (
        <div style={{
          position: 'fixed', top: '16px', left: '50%', transform: 'translateX(-50%)',
          zIndex: 4000,
          background: msgType === 'success' ? 'rgba(22,101,52,0.95)' : 'rgba(127,29,29,0.95)',
          border: `1px solid ${msgType === 'success' ? 'rgba(34,197,94,0.5)' : 'rgba(239,68,68,0.5)'}`,
          borderRadius: '10px', padding: '10px 18px',
          fontSize: '13px', fontWeight: 600,
          color: msgType === 'success' ? '#86efac' : '#fca5a5',
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          whiteSpace: 'nowrap', fontFamily: 'Space Grotesk, sans-serif',
        }}>
          {msg}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          HEADER — identity + GO ONLINE button + stats
      ═══════════════════════════════════════════════════════════════════ */}
      <div style={{
        background: 'var(--bg2)', borderBottom: '1px solid var(--border)',
        padding: '16px', position: 'sticky', top: 0, zIndex: 100,
      }}>
        {/* Title + button row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div>
            <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 900, fontSize: '20px', color: 'var(--text)', letterSpacing: '-0.02em', marginBottom: '2px' }}>
              Easy GO Driver
            </p>
            <p style={{ fontSize: '12px', color: isOnDuty ? 'var(--green)' : 'var(--text3)' }}>
              {isOnDuty
                ? `🟢 Online since ${driverInfo?.on_duty_since ? new Date(driverInfo.on_duty_since).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'now'}`
                : '🔴 Currently Offline'}
            </p>
          </div>

          {/* ─── GO ONLINE / OFFLINE BUTTON ─── */}
          <button
            onClick={toggleDuty}
            style={{
              padding: '11px 22px',
              borderRadius: '30px',
              border: isOnDuty ? '1px solid rgba(34,197,94,0.4)' : 'none',
              cursor: 'pointer',
              fontFamily: 'Space Grotesk, sans-serif',
              fontWeight: 800,
              fontSize: '13px',
              transition: 'all 0.25s',
              background: isOnDuty
                ? 'rgba(34,197,94,0.12)'
                : 'linear-gradient(135deg, #f5c518 0%, #e8a020 100%)',
              color: isOnDuty ? 'var(--green)' : '#0a0a0a',
              boxShadow: isOnDuty ? 'none' : '0 4px 16px rgba(245,197,24,0.45)',
              letterSpacing: '0.03em',
            }}
          >
            {isOnDuty ? '● ON DUTY' : '▶ GO ONLINE'}
          </button>
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
          {[
            { label: 'Wallet',     value: `${walletBalance.toLocaleString()} RWF`, color: 'var(--yellow)' },
            { label: 'Total Earned', value: `${totalEarned.toLocaleString()} RWF`, color: 'var(--green)'  },
            { label: 'Deliveries', value: String(completedTrips),                  color: 'var(--blue)'   },
          ].map(s => (
            <div key={s.label} style={{ background: 'var(--bg3)', borderRadius: '10px', padding: '10px', textAlign: 'center' }}>
              <p style={{ fontSize: '9px', color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '4px' }}>{s.label}</p>
              <p style={{ fontSize: '13px', fontWeight: 800, color: s.color, fontFamily: 'Space Grotesk, sans-serif' }}>{s.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

        {/* ── VEHICLE INFO BAR ── */}
        {driverInfo && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
            {[
              { label: 'Plate',   value: driverInfo.plate_number || '—',                color: 'var(--yellow)' },
              { label: 'Vehicle', value: driverInfo.vehicle_type || 'Motorcycle',        color: 'var(--text)'   },
              { label: 'Rating',  value: driverInfo.rating ? `⭐ ${driverInfo.rating}` : '⭐ 5.0', color: 'var(--text)' },
            ].map(item => (
              <div key={item.label} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '10px', padding: '10px', textAlign: 'center' }}>
                <p style={{ fontSize: '9px', color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '4px' }}>{item.label}</p>
                <p style={{ fontSize: '12px', fontWeight: 800, color: item.color }}>{item.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── ACTIVE ORDER ── */}
        {activeOrder && !['delivered'].includes(activeOrder.status) && (
          <div style={{ background: 'rgba(59,130,246,0.06)', border: '2px solid rgba(59,130,246,0.3)', borderRadius: '14px', padding: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <p style={{ fontWeight: 800, fontSize: '14px', color: 'var(--blue)' }}>🚀 Active Order</p>
              <span style={{
                fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '6px',
                color: activeOrder.status === 'in_transit' ? 'var(--blue)' : 'var(--green)',
                background: activeOrder.status === 'in_transit' ? 'rgba(59,130,246,0.12)' : 'rgba(34,197,94,0.1)',
                border: `1px solid ${activeOrder.status === 'in_transit' ? 'rgba(59,130,246,0.3)' : 'rgba(34,197,94,0.3)'}`,
              }}>{activeOrder.status.toUpperCase().replace('_',' ')}</span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '10px' }}>{activeOrder.sender_location} → {activeOrder.receiver_location}</p>
            <div style={{ background: 'rgba(245,197,24,0.08)', border: '1px solid rgba(245,197,24,0.2)', borderRadius: '8px', padding: '8px 12px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: 'var(--text3)', fontWeight: 600 }}>Your 70%</span>
              <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--yellow)' }}>{driverEarnings.toLocaleString()} RWF</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
              {[
                { label: '📤 Pickup',  name: activeOrder.profiles?.full_name,   loc: activeOrder.sender_location,   phone: activeOrder.profiles?.phone_number },
                { label: '📥 Dropoff', name: activeOrder.receiver?.full_name,   loc: activeOrder.receiver_location, phone: activeOrder.receiver?.phone_number  },
              ].map(c => (
                <div key={c.label} style={{ background: 'var(--bg2)', borderRadius: '8px', padding: '10px' }}>
                  <p style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '4px' }}>{c.label}</p>
                  <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', marginBottom: '2px' }}>{c.name}</p>
                  <p style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '4px' }}>{c.loc}</p>
                  {c.phone && <a href={`tel:${c.phone}`} style={{ fontSize: '11px', color: 'var(--blue)', display: 'flex', alignItems: 'center', gap: '3px', textDecoration: 'none' }}><Phone size={9} />{c.phone}</a>}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {activeOrder.status === 'accepted' && (
                <button onClick={markPickedUp} style={{ flex: 1, background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.35)', borderRadius: '10px', padding: '11px', color: 'var(--blue)', cursor: 'pointer', fontWeight: 800, fontSize: '13px', fontFamily: 'Space Grotesk, sans-serif' }}>
                  📦 Mark Picked Up
                </button>
              )}
              {activeOrder.status === 'in_transit' && (
                <button onClick={markDelivered} style={{ flex: 1, background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.35)', borderRadius: '10px', padding: '11px', color: 'var(--green)', cursor: 'pointer', fontWeight: 800, fontSize: '13px', fontFamily: 'Space Grotesk, sans-serif' }}>
                  ✅ Confirm Delivered
                </button>
              )}
            </div>
          </div>
        )}

        {/* Waiting for sender confirmation */}
        {activeOrder?.status === 'delivered' && activeOrder?.driver_confirmed && !activeOrder?.sender_confirmed && (
          <div style={{ background: 'rgba(245,197,24,0.06)', border: '2px solid rgba(245,197,24,0.3)', borderRadius: '14px', padding: '14px', textAlign: 'center' }}>
            <p style={{ fontSize: '28px', marginBottom: '8px' }}>⏳</p>
            <p style={{ fontWeight: 800, fontSize: '15px', color: 'var(--yellow)', marginBottom: '6px' }}>Waiting for sender to confirm</p>
            <p style={{ fontSize: '12px', color: 'var(--text3)' }}>Once confirmed, <strong style={{ color: 'var(--yellow)' }}>{driverEarnings.toLocaleString()} RWF</strong> will be added to your wallet.</p>
          </div>
        )}

        {/* Payment received */}
        {activeOrder?.status === 'delivered' && activeOrder?.sender_confirmed && (
          <div style={{ background: 'rgba(34,197,94,0.06)', border: '2px solid rgba(34,197,94,0.3)', borderRadius: '14px', padding: '14px', textAlign: 'center' }}>
            <p style={{ fontSize: '28px', marginBottom: '8px' }}>🎉</p>
            <p style={{ fontWeight: 800, fontSize: '15px', color: 'var(--green)', marginBottom: '4px' }}>Payment received!</p>
            <p style={{ fontSize: '13px', color: 'var(--text3)' }}><strong style={{ color: 'var(--green)' }}>{driverEarnings.toLocaleString()} RWF</strong> added to your wallet</p>
          </div>
        )}

        {/* ── WITHDRAW ── */}
        <button onClick={() => setShowWithdraw(v => !v)} style={{ width: '100%', padding: '12px', background: 'rgba(245,197,24,0.08)', border: '1px solid rgba(245,197,24,0.25)', borderRadius: '12px', fontWeight: 800, fontSize: '13px', color: 'var(--yellow)', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          <ArrowUpRight size={15} /> {showWithdraw ? 'Hide Withdraw' : 'Withdraw to MoMo'}
        </button>

        {showWithdraw && (
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '14px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Withdraw Earnings</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '6px' }}>
              {[1000,2000,5000,10000].map(a => (
                <button key={a} onClick={() => setWithdrawAmount(String(a))}
                  style={{ padding: '8px 4px', background: withdrawAmount === String(a) ? 'var(--yellow)' : 'var(--bg3)', border: `1px solid ${withdrawAmount === String(a) ? 'var(--yellow)' : 'var(--border)'}`, borderRadius: '8px', cursor: 'pointer', fontSize: '11px', fontWeight: 700, color: withdrawAmount === String(a) ? '#0a0a0a' : 'var(--text)', fontFamily: 'Space Grotesk, sans-serif' }}>
                  {a >= 1000 ? `${a/1000}k` : a}
                </button>
              ))}
            </div>
            <input type="number" placeholder="Custom amount (RWF)" value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value)}
              style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 12px', fontSize: '14px', fontWeight: 700, color: 'var(--text)', fontFamily: 'Space Grotesk, sans-serif', outline: 'none', boxSizing: 'border-box', width: '100%' }} />
            <input type="tel" placeholder="MoMo phone (+250...)" value={withdrawPhone} onChange={e => setWithdrawPhone(e.target.value)}
              style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', color: 'var(--text)', fontFamily: 'Space Grotesk, sans-serif', outline: 'none', boxSizing: 'border-box', width: '100%' }} />
            {withdrawErr && <p style={{ fontSize: '12px', color: 'var(--red)', fontWeight: 600 }}>⚠️ {withdrawErr}</p>}
            {withdrawStep === 'processing' ? (
              <div style={{ textAlign: 'center', padding: '8px 0' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
            ) : withdrawStep === 'done' ? (
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: '22px', marginBottom: '4px' }}>🎉</p>
                <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--green)', marginBottom: '8px' }}>Withdrawal sent!</p>
                <button onClick={() => { setWithdrawStep('idle'); setWithdrawAmount(''); setShowWithdraw(false); }}
                  style={{ padding: '8px 20px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 700, color: 'var(--text3)', fontFamily: 'Space Grotesk, sans-serif' }}>
                  Close
                </button>
              </div>
            ) : (
              <button onClick={handleWithdraw} style={{ width: '100%', padding: '11px', background: 'var(--yellow)', border: 'none', borderRadius: '10px', fontWeight: 800, fontSize: '13px', color: '#0a0a0a', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                <ArrowUpRight size={14} /> Withdraw to MoMo
              </button>
            )}
          </div>
        )}

        {/* ── AVAILABLE ORDERS ── */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text)' }}>📋 Available Orders ({pendingOrders.length})</h3>
            <button onClick={loadDriverData} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontFamily: 'Space Grotesk, sans-serif' }}>
              <RefreshCw size={13} /> Refresh
            </button>
          </div>

          {!isOnDuty ? (
            /* ── BIG "GO ONLINE" PROMPT when offline ── */
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '16px', textAlign: 'center', padding: '40px 24px' }}>
              <p style={{ fontSize: '40px', marginBottom: '12px' }}>🔴</p>
              <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 900, fontSize: '18px', color: 'var(--text)', marginBottom: '8px' }}>You are Offline</p>
              <p style={{ fontSize: '13px', color: 'var(--text3)', marginBottom: '24px', maxWidth: '220px', margin: '0 auto 24px', lineHeight: 1.5 }}>
                Tap the button below to go online and start receiving orders
              </p>
              <button
                onClick={toggleDuty}
                style={{
                  background: 'linear-gradient(135deg, #f5c518, #e8a020)',
                  border: 'none', borderRadius: '14px',
                  padding: '14px 32px',
                  fontFamily: 'Space Grotesk, sans-serif',
                  fontWeight: 900, fontSize: '15px',
                  color: '#0a0a0a', cursor: 'pointer',
                  boxShadow: '0 6px 20px rgba(245,197,24,0.45)',
                  letterSpacing: '0.02em',
                }}
              >
                ▶ Go Online Now
              </button>
            </div>
          ) : pendingOrders.length === 0 ? (
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '14px', textAlign: 'center', padding: '32px 24px' }}>
              <Navigation size={24} color="var(--text3)" style={{ margin: '0 auto 10px', display: 'block' }} />
              <p style={{ color: 'var(--text3)', fontSize: '14px', fontWeight: 600 }}>No orders right now</p>
              <p style={{ color: 'var(--text3)', fontSize: '12px', marginTop: '4px' }}>New orders appear here automatically</p>
            </div>
          ) : (
            pendingOrders.map(order => (
              <div key={order.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '14px', padding: '14px', marginBottom: '10px', opacity: acceptingId === order.id ? 0.6 : 1, transition: 'opacity 0.2s' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                  <div>
                    <p style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: 'monospace', marginBottom: '2px' }}>#{order.id.slice(0,8)}</p>
                    <p style={{ fontSize: '11px', color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={10} />{new Date(order.created_at).toLocaleString()}</p>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--green)', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '6px', padding: '2px 7px', display: 'inline-block', marginTop: '4px' }}>✅ Ready to accept</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontWeight: 800, fontSize: '16px', color: 'var(--yellow)' }}>{(order.predicted_price || 0).toLocaleString()} RWF</p>
                    <p style={{ fontSize: '11px', color: 'var(--green)', fontWeight: 700 }}>You get: {Math.round((order.predicted_price || 0) * 0.7).toLocaleString()} RWF</p>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
                  <div style={{ background: 'var(--bg3)', borderRadius: '8px', padding: '10px' }}>
                    <p style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '4px' }}>📤 From</p>
                    <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', marginBottom: '2px' }}>{order.sender_name}</p>
                    <p style={{ fontSize: '11px', color: 'var(--text3)' }}>{order.sender_location}</p>
                  </div>
                  <div style={{ background: 'var(--bg3)', borderRadius: '8px', padding: '10px' }}>
                    <p style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '4px' }}>📥 To</p>
                    <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', marginBottom: '2px' }}>{order.receiver_name}</p>
                    <p style={{ fontSize: '11px', color: 'var(--text3)' }}>{order.receiver_location}</p>
                  </div>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '12px' }}>
                  <Package size={11} style={{ display: 'inline', marginRight: '4px' }} />{order.package_size} · {order.package_weight}
                </p>
                <button onClick={() => acceptOrder(order)} disabled={!!acceptingId}
                  style={{ width: '100%', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '10px', padding: '12px', color: 'var(--green)', cursor: 'pointer', fontWeight: 800, fontSize: '14px', fontFamily: 'Space Grotesk, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', opacity: acceptingId ? 0.5 : 1 }}>
                  {acceptingId === order.id ? '⏳ Accepting...' : <><CheckCircle size={15} /> Accept Order</>}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function haversineMeters([lat1, lon1]: [number, number], [lat2, lon2]: [number, number]): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const a = Math.sin(toRad(lat2 - lat1) / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lon2 - lon1) / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}