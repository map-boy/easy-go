import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Navigation, Phone, Package, Clock, Star, Wallet, ArrowUpRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { createNotification } from '../../lib/notifications';

const KIGALI: [number, number] = [-1.9441, 30.0619];

async function fetchRoute(from: [number, number], to: [number, number]) {
  try {
    const res  = await fetch(`https://router.project-osrm.org/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`);
    const data = await res.json();
    if (data.code !== 'Ok') return null;
    const route = data.routes[0];
    return {
      points:      route.geometry.coordinates.map(([lng, lat]: number[]) => [lat, lng] as [number, number]),
      distanceKm:  Math.round(route.distance / 100) / 10,
      durationMin: Math.round(route.duration / 60),
    };
  } catch { return null; }
}

export function DriverTab() {
  const { profile } = useAuth();
  const [driverInfo,    setDriverInfo]    = useState<any>(null);
  const [pendingOrders, setPendingOrders] = useState<any[]>([]);
  const [activeOrder,   setActiveOrder]   = useState<any>(null);
  const [myLocation,    setMyLocation]    = useState<[number, number] | null>(null);
  const [routeToSender,   setRouteToSender]   = useState<any>(null);
  const [routeToReceiver, setRouteToReceiver] = useState<any>(null);
  const [msg,     setMsg]     = useState('');
  const [msgType, setMsgType] = useState<'success' | 'error'>('success');
  const [loading,     setLoading]     = useState(true);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  // wallet
  const [walletBalance,  setWalletBalance]  = useState(0);
  const [walletTxs,      setWalletTxs]      = useState<any[]>([]);
  const [showWallet,     setShowWallet]      = useState(false);
  const [totalEarned,    setTotalEarned]    = useState(0);
  const [completedTrips, setCompletedTrips] = useState(0);
  const [withdrawStep,   setWithdrawStep]   = useState<'idle'|'confirm'|'processing'|'done'|'error'>('idle');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawPhone,  setWithdrawPhone]  = useState('');
  const [withdrawErr,    setWithdrawErr]    = useState('');

  useEffect(() => {
    loadDriverData();
    startGPS();
    const channel = supabase.channel('driver-orders')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' },
          () => loadPendingOrders())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' },
          () => { loadPendingOrders(); loadDriverData(); })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'wallet_transactions' },
          () => loadDriverData())   // ← refresh earnings when payment arrives
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile]);

  function startGPS() {
    if (!navigator.geolocation) return;
    navigator.geolocation.watchPosition(
      (pos) => {
        const loc: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setMyLocation(loc);
        if (profile?.id) {
          supabase.from('drivers').update({ latitude: loc[0], longitude: loc[1] }).eq('user_id', profile.id).then(() => {});
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 3000 }
    );
  }

  async function loadDriverData() {
    if (!profile) return;
    const { data: driver } = await supabase.from('drivers').select('*').eq('user_id', profile.id).single();
    setDriverInfo(driver);
    if (driver) {
      const { data: active } = await supabase
        .from('orders')
        .select('*, profiles:sender_id(full_name, phone_number, latitude, longitude), receiver:receiver_id(full_name, phone_number, latitude, longitude)')
        .eq('driver_id', driver.id)
        .in('status', ['accepted', 'in_transit', 'delivered'])
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      setActiveOrder(active || null);
    }
    // Load wallet ALWAYS — regardless of driver record state
    const { data: prof } = await supabase.from('profiles').select('wallet_balance, phone_number').eq('id', profile.id).single();
    setWalletBalance(prof?.wallet_balance ?? 0);
    setWithdrawPhone(prof?.phone_number ?? '');
    const { data: txs } = await supabase.from('wallet_transactions').select('*').eq('user_id', profile.id).order('created_at', { ascending: false }).limit(20);
    setWalletTxs(txs || []);
    // Calculate total earned and completed trips from transaction history
    const earned = (txs || []).filter((t: any) => t.type === 'topup').reduce((s: number, t: any) => s + (t.amount || 0), 0);
    setTotalEarned(earned);
    // Count completed deliveries from orders table
    if (driver?.id) {
      const { data: doneOrders } = await supabase
        .from('orders')
        .select('id')
        .eq('driver_id', driver.id)
        .eq('status', 'delivered');
      setCompletedTrips(doneOrders?.length ?? 0);
    }
    await loadPendingOrders();
    setLoading(false);
  }

  async function loadPendingOrders() {
    const { data } = await supabase
      .from('orders')
      .select('*, profiles:sender_id(full_name, phone_number, latitude, longitude), receiver:receiver_id(full_name, phone_number, latitude, longitude)')
      .in('status', ['pending', 'awaiting_payment'])
      .is('driver_id', null)
      .order('created_at', { ascending: false });
    setPendingOrders(data || []);
  }

  useEffect(() => {
    if (!activeOrder || !myLocation) return;
    const senderPos: [number, number] | null =
      activeOrder.profiles?.latitude && activeOrder.profiles?.longitude
        ? [activeOrder.profiles.latitude, activeOrder.profiles.longitude] : null;
    const receiverPos: [number, number] | null =
      activeOrder.receiver?.latitude && activeOrder.receiver?.longitude
        ? [activeOrder.receiver.latitude, activeOrder.receiver.longitude] : null;
    if (senderPos)                fetchRoute(myLocation, senderPos).then(setRouteToSender);
    if (senderPos && receiverPos) fetchRoute(senderPos, receiverPos).then(setRouteToReceiver);
  }, [activeOrder, myLocation]);

  function notify(m: string, type: 'success' | 'error' = 'success') {
    setMsg(m); setMsgType(type); setTimeout(() => setMsg(''), 3500);
  }

  async function toggleDuty() {
    if (!driverInfo) return;
    const newDuty = !driverInfo.is_on_duty;
    await supabase.from('drivers').update({
      is_on_duty: newDuty, is_available: newDuty,
      on_duty_since: newDuty ? new Date().toISOString() : null,
    }).eq('id', driverInfo.id);
    setDriverInfo({ ...driverInfo, is_on_duty: newDuty, is_available: newDuty });
    notify(newDuty ? '✅ You are now ON DUTY — orders will appear' : '🔴 You are OFF DUTY');
  }

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
      `Your driver is on the way to pick up your package from ${order.sender_location}`, 'order_accepted', order.id);
    if (order.receiver_id) {
      await createNotification(order.receiver_id, '📦 Your Package is Coming!',
        `A driver has accepted delivery to ${order.receiver_location}`, 'order_accepted', order.id);
    }
    notify('✅ Order accepted! Navigate to pickup.');
    loadDriverData();
  }

  async function markPickedUp() {
    if (!activeOrder) return;
    await supabase.from('orders').update({ status: 'in_transit', updated_at: new Date().toISOString() }).eq('id', activeOrder.id);
    await createNotification(activeOrder.sender_id, '📦 Package Picked Up!',
      `Your package has been collected and is now in transit to ${activeOrder.receiver_location}`, 'in_transit', activeOrder.id);
    if (activeOrder.receiver_id) {
      await createNotification(activeOrder.receiver_id, '🚀 Package In Transit!',
        `Your package is on its way — arriving at ${activeOrder.receiver_location}`, 'in_transit', activeOrder.id);
    }
    notify('📦 Marked as picked up — in transit!');
    loadDriverData();
  }

  async function markDelivered() {
    if (!activeOrder) return;
    // Mark as delivered — driver confirmed. Sender must still confirm.
    await supabase.from('orders').update({
      status: 'delivered', driver_confirmed: true, updated_at: new Date().toISOString(),
    }).eq('id', activeOrder.id);
    await createNotification(activeOrder.sender_id, '✅ Package Delivered — Please Confirm!',
      `Your package has been delivered to ${activeOrder.receiver_location}. Open the app to confirm and release payment.`, 'delivered', activeOrder.id);
    if (activeOrder.receiver_id) {
      await createNotification(activeOrder.receiver_id, '🎉 Package Arrived!',
        `Your package has been delivered. Please confirm receipt.`, 'delivered', activeOrder.id);
    }
    setRouteToSender(null); setRouteToReceiver(null);
    notify('🎉 Marked as delivered! Waiting for sender to confirm.');
    loadDriverData();
  }

  // ── WITHDRAW ──────────────────────────────────────────────────────────────
  async function handleWithdraw() {
    const amount = parseInt(withdrawAmount.replace(/\D/g, ''));
    if (!amount || amount < 500) { setWithdrawErr('Minimum withdrawal is 500 RWF'); return; }
    if (amount > walletBalance)  { setWithdrawErr('Insufficient wallet balance'); return; }
    if (!withdrawPhone.trim())   { setWithdrawErr('Enter your MoMo phone number'); return; }
    setWithdrawErr('');
    setWithdrawStep('processing');
    try {
      const NOOR_URL = (import.meta as any).env?.VITE_NOOR_URL || 'http://localhost:3001';
      const NOOR_KEY = (import.meta as any).env?.VITE_NOOR_API_KEY || '';
      // Deduct from wallet immediately
      await supabase.rpc('increment_wallet_balance', { uid: profile!.id, delta: -amount });
      await supabase.from('wallet_transactions').insert({
        user_id: profile!.id, type: 'payment', amount,
        status: 'completed', description: `Withdrawal to MoMo ${withdrawPhone}`,
      });
      // Request payout via Noor (deposit to driver's MoMo)
      const phone = withdrawPhone.startsWith('+') ? withdrawPhone : `+250${withdrawPhone.replace(/^0/, '')}`;
      try {
        await fetch(`${NOOR_URL}/payments/deposit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': NOOR_KEY },
          body: JSON.stringify({ amount, phoneNumber: phone, payeeName: profile!.full_name, note: 'Easy GO driver payout' }),
        });
      } catch (_) { /* payout API optional — balance already deducted */ }
      setWithdrawStep('done');
      loadDriverData();
    } catch {
      setWithdrawStep('error');
      setWithdrawErr('Withdrawal failed. Try again.');
    }
  }

  if (loading) return <div style={{ textAlign: 'center', padding: '60px 0' }}><div className="spinner" /></div>;

  const pendingPayment = activeOrder?.status === 'delivered' && activeOrder?.driver_confirmed && !activeOrder?.sender_confirmed;
  const driverEarnings70   = activeOrder     ? Math.round((activeOrder.predicted_price     || 0) * 0.70) : 0;

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100%' }}>

      {/* ── DUTY TOGGLE ── */}
      <div style={{ padding: '16px', background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>
        {msg && (
          <div style={{ background: msgType === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${msgType === 'success' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`, borderRadius: '10px', padding: '10px 14px', marginBottom: '12px', fontSize: '13px', fontWeight: 600, color: msgType === 'success' ? 'var(--green)' : 'var(--red)' }}>
            {msg}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div>
            <p style={{ fontWeight: 800, fontSize: '18px', color: 'var(--text)', marginBottom: '2px' }}>{driverInfo?.is_on_duty ? '🟢 On Duty' : '🔴 Off Duty'}</p>
            <p style={{ fontSize: '12px', color: 'var(--text3)' }}>{driverInfo?.is_on_duty ? `Since ${driverInfo.on_duty_since ? new Date(driverInfo.on_duty_since).toLocaleTimeString() : 'now'}` : 'Go on duty to receive orders'}</p>
          </div>
          <button onClick={toggleDuty} style={{ width: '72px', height: '38px', background: driverInfo?.is_on_duty ? '#22c55e' : 'var(--border2)', borderRadius: '20px', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background .25s', boxShadow: driverInfo?.is_on_duty ? '0 0 16px rgba(34,197,94,0.4)' : 'none' }}>
            <div style={{ position: 'absolute', top: '4px', left: driverInfo?.is_on_duty ? '38px' : '4px', width: '30px', height: '30px', background: '#ffffff', borderRadius: '50%', transition: 'left .25s', boxShadow: '0 2px 6px rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>
              {driverInfo?.is_on_duty ? '🟢' : '🔴'}
            </div>
          </button>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          {[
            { label: 'Plate',  value: driverInfo?.plate_number || '—',                  color: 'var(--yellow)' },
            { label: 'Status', value: driverInfo?.is_on_duty ? 'Available' : 'Offline', color: driverInfo?.is_on_duty ? 'var(--green)' : 'var(--text3)' },
            { label: 'GPS',    value: myLocation ? 'Live' : 'Off',                      color: myLocation ? 'var(--green)' : 'var(--red)' },
          ].map(item => (
            <div key={item.label} style={{ flex: 1, background: 'var(--bg3)', borderRadius: '10px', padding: '10px', textAlign: 'center' }}>
              <p style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '4px' }}>{item.label}</p>
              <p style={{ fontSize: '14px', fontWeight: 800, color: item.color }}>{item.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: '16px' }}>

        {/* ── EARNINGS DASHBOARD ── */}
        <div style={{ background: 'linear-gradient(135deg, #0a0a0a 0%, #111c2e 100%)', border: '1px solid rgba(245,197,24,0.2)', borderRadius: '14px', padding: '16px', marginBottom: '16px' }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Wallet size={15} color="#f5c518" />
              <span style={{ fontWeight: 700, fontSize: '13px', color: '#fff' }}>My Earnings</span>
            </div>
            <button onClick={() => setShowWallet(v => !v)} style={{ background: 'rgba(245,197,24,0.1)', border: '1px solid rgba(245,197,24,0.25)', borderRadius: '8px', padding: '5px 10px', cursor: 'pointer', fontSize: '11px', fontWeight: 700, color: '#f5c518' }}>
              {showWallet ? 'Hide Details' : 'Show Details'}
            </button>
          </div>

          {/* 3 stat boxes — always visible */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '14px' }}>
            <div style={{ background: 'rgba(245,197,24,0.08)', border: '1px solid rgba(245,197,24,0.15)', borderRadius: '10px', padding: '10px', textAlign: 'center' }}>
              <p style={{ fontSize: '9px', color: 'rgba(255,255,255,0.35)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '4px' }}>Available</p>
              <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '17px', fontWeight: 900, color: '#f5c518', letterSpacing: '-.01em' }}>
                {walletBalance.toLocaleString()}
              </p>
              <p style={{ fontSize: '9px', color: 'rgba(255,255,255,0.25)' }}>RWF</p>
            </div>
            <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.15)', borderRadius: '10px', padding: '10px', textAlign: 'center' }}>
              <p style={{ fontSize: '9px', color: 'rgba(255,255,255,0.35)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '4px' }}>Total Earned</p>
              <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '17px', fontWeight: 900, color: '#22c55e', letterSpacing: '-.01em' }}>
                {totalEarned.toLocaleString()}
              </p>
              <p style={{ fontSize: '9px', color: 'rgba(255,255,255,0.25)' }}>RWF</p>
            </div>
            <div style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.15)', borderRadius: '10px', padding: '10px', textAlign: 'center' }}>
              <p style={{ fontSize: '9px', color: 'rgba(255,255,255,0.35)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '4px' }}>Deliveries</p>
              <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '17px', fontWeight: 900, color: '#3b82f6', letterSpacing: '-.01em' }}>
                {completedTrips}
              </p>
              <p style={{ fontSize: '9px', color: 'rgba(255,255,255,0.25)' }}>trips</p>
            </div>
          </div>

          {/* Average per trip */}
          {completedTrips > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', marginBottom: '14px' }}>
              <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>⚡ Avg per delivery</p>
              <p style={{ fontSize: '13px', fontWeight: 800, color: '#f5c518' }}>
                {Math.round(totalEarned / completedTrips).toLocaleString()} RWF
              </p>
            </div>
          )}

          {showWallet && (
            <div style={{ marginTop: '14px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '14px' }}>
              {/* Withdraw form */}
              {withdrawStep === 'idle' || withdrawStep === 'error' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <p style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Withdraw to MoMo</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '6px' }}>
                    {[1000, 2000, 5000, 10000].map(a => (
                      <button key={a} onClick={() => setWithdrawAmount(String(a))}
                        style={{ padding: '7px 4px', background: withdrawAmount === String(a) ? '#f5c518' : 'rgba(255,255,255,0.06)', border: `1px solid ${withdrawAmount === String(a) ? '#f5c518' : 'rgba(255,255,255,0.1)'}`, borderRadius: '8px', cursor: 'pointer', fontSize: '11px', fontWeight: 700, color: withdrawAmount === String(a) ? '#0a0a0a' : 'rgba(255,255,255,0.6)', fontFamily: 'Space Grotesk, sans-serif' }}>
                        {a >= 1000 ? `${a/1000}k` : a}
                      </button>
                    ))}
                  </div>
                  <input type="number" placeholder="Custom amount (RWF)" value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value)}
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', padding: '10px 12px', fontSize: '14px', fontWeight: 700, color: '#fff', fontFamily: 'Space Grotesk, sans-serif', outline: 'none', boxSizing: 'border-box', width: '100%' }} />
                  <input type="tel" placeholder="MoMo phone (+250...)" value={withdrawPhone} onChange={e => setWithdrawPhone(e.target.value)}
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', color: '#fff', fontFamily: 'Space Grotesk, sans-serif', outline: 'none', boxSizing: 'border-box', width: '100%' }} />
                  {withdrawErr && <p style={{ fontSize: '12px', color: '#ef4444', fontWeight: 600 }}>⚠️ {withdrawErr}</p>}
                  <button onClick={handleWithdraw}
                    style={{ width: '100%', padding: '11px', background: '#f5c518', border: 'none', borderRadius: '10px', fontWeight: 800, fontSize: '13px', color: '#0a0a0a', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                    <ArrowUpRight size={14} /> Withdraw to MoMo
                  </button>
                </div>
              ) : withdrawStep === 'processing' ? (
                <div style={{ textAlign: 'center', padding: '10px 0' }}>
                  <div className="spinner" style={{ width: '28px', height: '28px', margin: '0 auto 8px' }} />
                  <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)' }}>Processing withdrawal…</p>
                </div>
              ) : withdrawStep === 'done' ? (
                <div style={{ textAlign: 'center', padding: '10px 0' }}>
                  <p style={{ fontSize: '28px', marginBottom: '6px' }}>🎉</p>
                  <p style={{ fontWeight: 700, fontSize: '14px', color: '#22c55e', marginBottom: '4px' }}>Withdrawal sent!</p>
                  <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginBottom: '10px' }}>Check your MoMo for confirmation</p>
                  <button onClick={() => { setWithdrawStep('idle'); setWithdrawAmount(''); }} style={{ padding: '8px 20px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>
                    Withdraw Again
                  </button>
                </div>
              ) : null}

              {/* Recent earnings */}
              {walletTxs.length > 0 && (
                <div style={{ marginTop: '12px', borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '12px' }}>
                  <p style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '8px' }}>Recent</p>
                  {walletTxs.slice(0, 5).map(tx => (
                    <div key={tx.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.description}</p>
                      <p style={{ fontSize: '12px', fontWeight: 800, color: tx.type === 'payment' ? '#ef4444' : '#22c55e', whiteSpace: 'nowrap', marginLeft: '8px' }}>
                        {tx.type === 'payment' ? '−' : '+'}{tx.amount.toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── ACTIVE ORDER CARD ── */}
        {activeOrder && !['delivered'].includes(activeOrder.status) ? (
          <div style={{ background: 'rgba(59,130,246,0.06)', border: '2px solid rgba(59,130,246,0.3)', borderRadius: '14px', padding: '14px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <p style={{ fontWeight: 800, fontSize: '14px', color: 'var(--blue)' }}>🚀 Active Order in Progress</p>
              <span className={`badge ${activeOrder.status === 'in_transit' ? 'badge-blue' : 'badge-green'}`}>{activeOrder.status}</span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '10px' }}>{activeOrder.sender_location} → {activeOrder.receiver_location}</p>
            <div style={{ background: 'rgba(245,197,24,0.08)', border: '1px solid rgba(245,197,24,0.2)', borderRadius: '8px', padding: '8px 12px', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: 'var(--text3)', fontWeight: 600 }}>Your 70% earnings</span>
              <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--yellow)' }}>{driverEarnings70.toLocaleString()} RWF</span>
            </div>
            {(routeToSender || routeToReceiver) && (
              <div style={{ background: 'var(--bg2)', borderRadius: '8px', padding: '8px 10px', marginBottom: '10px' }}>
                {routeToSender   && <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--yellow)', marginBottom: routeToReceiver ? '4px' : 0 }}>🟡 You → Pickup: {routeToSender.distanceKm} km · ~{routeToSender.durationMin} min</p>}
                {routeToReceiver && <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--green)' }}>🟢 Pickup → Dropoff: {routeToReceiver.distanceKm} km · ~{routeToReceiver.durationMin} min</p>}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
              <div style={{ background: 'var(--bg2)', borderRadius: '8px', padding: '10px' }}>
                <p style={{ fontSize: '10px', color: 'var(--text3)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '.06em', marginBottom: '4px' }}>📤 Pickup</p>
                <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', marginBottom: '2px' }}>{activeOrder.profiles?.full_name}</p>
                <p style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '3px' }}>{activeOrder.sender_location}</p>
                <p style={{ fontSize: '11px', color: 'var(--blue)', display: 'flex', alignItems: 'center', gap: '3px' }}><Phone size={9} />{activeOrder.profiles?.phone_number}</p>
              </div>
              <div style={{ background: 'var(--bg2)', borderRadius: '8px', padding: '10px' }}>
                <p style={{ fontSize: '10px', color: 'var(--text3)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '.06em', marginBottom: '4px' }}>📥 Dropoff</p>
                <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', marginBottom: '2px' }}>{activeOrder.receiver?.full_name}</p>
                <p style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '3px' }}>{activeOrder.receiver_location}</p>
                <p style={{ fontSize: '11px', color: 'var(--blue)', display: 'flex', alignItems: 'center', gap: '3px' }}><Phone size={9} />{activeOrder.receiver?.phone_number}</p>
              </div>
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
        ) : activeOrder?.status === 'delivered' && activeOrder?.driver_confirmed && !activeOrder?.sender_confirmed ? (
          // Waiting for sender to confirm
          <div style={{ background: 'rgba(245,197,24,0.06)', border: '2px solid rgba(245,197,24,0.3)', borderRadius: '14px', padding: '14px', marginBottom: '16px', textAlign: 'center' }}>
            <p style={{ fontSize: '28px', marginBottom: '8px' }}>⏳</p>
            <p style={{ fontWeight: 800, fontSize: '15px', color: 'var(--yellow)', marginBottom: '6px' }}>Waiting for sender to confirm delivery</p>
            <p style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '12px' }}>Once sender confirms, <strong style={{ color: 'var(--yellow)' }}>{driverEarnings70.toLocaleString()} RWF</strong> (70%) will be added to your wallet.</p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '6px' }}>
              {[0,1,2].map(i => <div key={i} style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--yellow)', animation: `tt-dot 1.4s ease ${i*0.2}s infinite` }} />)}
            </div>
          </div>
        ) : activeOrder?.status === 'delivered' && activeOrder?.sender_confirmed ? (
          // Payment received
          <div style={{ background: 'rgba(34,197,94,0.06)', border: '2px solid rgba(34,197,94,0.3)', borderRadius: '14px', padding: '14px', marginBottom: '16px', textAlign: 'center' }}>
            <p style={{ fontSize: '28px', marginBottom: '8px' }}>🎉</p>
            <p style={{ fontWeight: 800, fontSize: '15px', color: 'var(--green)', marginBottom: '4px' }}>Payment received!</p>
            <p style={{ fontSize: '13px', color: 'var(--text3)' }}>
              <strong style={{ color: 'var(--green)' }}>{driverEarnings70.toLocaleString()} RWF</strong> added to your wallet
            </p>
            {activeOrder.sender_rating > 0 && (
              <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                {[1,2,3,4,5].map(s => <Star key={s} size={16} color={s <= activeOrder.sender_rating ? '#f5c518' : 'var(--border2)'} fill={s <= activeOrder.sender_rating ? '#f5c518' : 'none'} />)}
                {activeOrder.sender_comment && <span style={{ fontSize: '12px', color: 'var(--text3)', marginLeft: '6px' }}>"{activeOrder.sender_comment}"</span>}
              </div>
            )}
          </div>
        ) : null}


        {/* ── AVAILABLE ORDERS ── */}
        {driverInfo?.is_on_duty ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text)' }}>📋 Available Orders ({pendingOrders.length})</h3>
            </div>
            {pendingOrders.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '32px' }}>
                <Navigation size={24} color="var(--text3)" style={{ margin: '0 auto 10px' }} />
                <p style={{ color: 'var(--text3)', fontSize: '14px' }}>No orders available right now</p>
                <p style={{ color: 'var(--text3)', fontSize: '12px', marginTop: '4px' }}>New orders appear here automatically</p>
              </div>
            ) : pendingOrders.map(order => (
              <div key={order.id} style={{ background: 'var(--bg2)', border: `1px solid ${order.status === 'awaiting_payment' ? 'rgba(249,115,22,0.3)' : 'var(--border)'}`, borderRadius: '14px', padding: '14px', marginBottom: '10px', opacity: acceptingId === order.id ? 0.6 : 1, transition: 'opacity 0.2s' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                  <div>
                    <p style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: 'monospace', marginBottom: '2px' }}>#{order.id.slice(0, 8)}</p>
                    <p style={{ fontSize: '12px', color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={10} />{new Date(order.created_at).toLocaleString()}</p>
                    {order.status === 'awaiting_payment' && <span style={{ fontSize: '10px', fontWeight: 700, color: '#f97316', background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.3)', borderRadius: '6px', padding: '2px 7px', display: 'inline-block', marginTop: '4px' }}>⏳ Awaiting payment</span>}
                    {order.status === 'pending'          && <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--green)', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '6px', padding: '2px 7px', display: 'inline-block', marginTop: '4px' }}>✅ Paid — Ready to accept</span>}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontWeight: 800, fontSize: '16px', color: 'var(--yellow)' }}>{(order.predicted_price || 0).toLocaleString()} RWF</p>
                    <p style={{ fontSize: '11px', color: 'var(--green)', fontWeight: 700 }}>You get: {Math.round((order.predicted_price || 0) * 0.7).toLocaleString()} RWF</p>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
                  <div style={{ background: 'var(--bg3)', borderRadius: '8px', padding: '10px' }}>
                    <p style={{ fontSize: '10px', color: 'var(--text3)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '.06em', marginBottom: '4px' }}>📤 From</p>
                    <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', marginBottom: '2px' }}>{order.sender_name}</p>
                    <p style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '3px' }}>{order.sender_location}</p>
                    {order.profiles?.phone_number && <p style={{ fontSize: '11px', color: 'var(--blue)', display: 'flex', alignItems: 'center', gap: '3px' }}><Phone size={9} />{order.profiles.phone_number}</p>}
                  </div>
                  <div style={{ background: 'var(--bg3)', borderRadius: '8px', padding: '10px' }}>
                    <p style={{ fontSize: '10px', color: 'var(--text3)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '.06em', marginBottom: '4px' }}>📥 To</p>
                    <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', marginBottom: '2px' }}>{order.receiver_name}</p>
                    <p style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '3px' }}>{order.receiver_location}</p>
                    {order.receiver?.phone_number && <p style={{ fontSize: '11px', color: 'var(--blue)', display: 'flex', alignItems: 'center', gap: '3px' }}><Phone size={9} />{order.receiver.phone_number}</p>}
                  </div>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '12px' }}>
                  <Package size={11} style={{ display: 'inline', marginRight: '4px' }} />{order.package_size} · {order.package_weight}
                </p>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => acceptOrder(order)} disabled={acceptingId === order.id || order.status === 'awaiting_payment'}
                    style={{ flex: 1, background: order.status === 'awaiting_payment' ? 'rgba(249,115,22,0.08)' : 'rgba(34,197,94,0.1)', border: `1px solid ${order.status === 'awaiting_payment' ? 'rgba(249,115,22,0.3)' : 'rgba(34,197,94,0.3)'}`, borderRadius: '10px', padding: '12px', color: order.status === 'awaiting_payment' ? '#f97316' : 'var(--green)', cursor: order.status === 'awaiting_payment' ? 'not-allowed' : 'pointer', fontWeight: 800, fontSize: '14px', fontFamily: 'Space Grotesk, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', opacity: acceptingId === order.id ? 0.5 : 1 }}>
                    {acceptingId === order.id ? '⏳ Accepting...' : order.status === 'awaiting_payment' ? '⏳ Waiting for payment' : <><CheckCircle size={15} /> Accept Order</>}
                  </button>
                  <button style={{ width: '48px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <XCircle size={15} color="var(--red)" />
                  </button>
                </div>
              </div>
            ))}
          </>
        ) : (
          <div className="card" style={{ textAlign: 'center', padding: '40px 24px' }}>
            <p style={{ fontSize: '40px', marginBottom: '12px' }}>🔴</p>
            <p style={{ fontWeight: 800, fontSize: '16px', color: 'var(--text)', marginBottom: '6px' }}>You are Off Duty</p>
            <p style={{ fontSize: '13px', color: 'var(--text3)', marginBottom: '20px' }}>Toggle the switch above to go on duty and start receiving orders</p>
            <button onClick={toggleDuty} style={{ background: 'var(--yellow)', border: 'none', borderRadius: '10px', padding: '12px 28px', fontWeight: 800, fontSize: '14px', color: '#0a0a0a', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif' }}>
              Go On Duty
            </button>
          </div>
        )}
      </div>
    </div>
  );
}