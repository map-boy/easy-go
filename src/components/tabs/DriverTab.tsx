import { useEffect, useState } from 'react';
import L from 'leaflet';
import { CheckCircle, XCircle, Navigation, Phone, Package, MapPin, Clock } from 'lucide-react';
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
  const [driverInfo, setDriverInfo]           = useState<any>(null);
  const [pendingOrders, setPendingOrders]     = useState<any[]>([]);
  const [activeOrder, setActiveOrder]         = useState<any>(null);
  const [myLocation, setMyLocation]           = useState<[number, number] | null>(null);
  const [routeToSender, setRouteToSender]     = useState<any>(null);
  const [routeToReceiver, setRouteToReceiver] = useState<any>(null);
  const [msg, setMsg]                         = useState('');
  const [msgType, setMsgType]                 = useState<'success' | 'error'>('success');
  const [loading, setLoading]                 = useState(true);
  const [acceptingId, setAcceptingId]         = useState<string | null>(null);

  useEffect(() => {
    loadDriverData();
    startGPS();
    const channel = supabase.channel('driver-orders')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, () => loadPendingOrders())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, () => { loadPendingOrders(); loadDriverData(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile]);

  function startGPS() {
    if (!navigator.geolocation) return;
    navigator.geolocation.watchPosition(
      (pos) => {
        const loc: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setMyLocation(loc);
        // Push live position to DB so TrackTab can show it
        if (profile?.id) {
          supabase.from('drivers')
            .update({ latitude: loc[0], longitude: loc[1] })
            .eq('user_id', profile.id)
            .then(() => {});
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 3000 }
    );
  }

  async function loadDriverData() {
    if (!profile) return;
    const { data: driver } = await supabase
      .from('drivers').select('*').eq('user_id', profile.id).single();
    setDriverInfo(driver);

    if (driver) {
      const { data: active } = await supabase
        .from('orders')
        .select('*, profiles:sender_id(full_name, phone_number, latitude, longitude), receiver:receiver_id(full_name, phone_number, latitude, longitude)')
        .eq('driver_id', driver.id)
        .in('status', ['accepted', 'in_transit'])
        .maybeSingle();
      setActiveOrder(active || null);
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

  // Compute distances when active order or GPS changes
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
    notify('✅ Order accepted! Check the Track tab to navigate.');
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
    await supabase.from('orders').update({
      status: 'delivered', driver_confirmed: true, updated_at: new Date().toISOString(),
    }).eq('id', activeOrder.id);
    await createNotification(activeOrder.sender_id, '✅ Package Delivered!',
      `Your package has been delivered to ${activeOrder.receiver_location}`, 'delivered', activeOrder.id);
    if (activeOrder.receiver_id) {
      await createNotification(activeOrder.receiver_id, '🎉 Package Arrived!',
        `Your package has been delivered. Please confirm receipt.`, 'delivered', activeOrder.id);
    }
    setRouteToSender(null); setRouteToReceiver(null); setActiveOrder(null);
    notify('🎉 Delivered! Great job!');
    loadDriverData();
  }

  if (loading) return <div style={{ textAlign: 'center', padding: '60px 0' }}><div className="spinner" /></div>;

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
            { label: 'Plate',  value: driverInfo?.plate_number || '—',               color: 'var(--yellow)' },
            { label: 'Status', value: driverInfo?.is_on_duty ? 'Available' : 'Offline', color: driverInfo?.is_on_duty ? 'var(--green)' : 'var(--text3)' },
            { label: 'GPS',    value: myLocation ? 'Live' : 'Off',                   color: myLocation ? 'var(--green)' : 'var(--red)' },
          ].map(item => (
            <div key={item.label} style={{ flex: 1, background: 'var(--bg3)', borderRadius: '10px', padding: '10px', textAlign: 'center' }}>
              <p style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '4px' }}>{item.label}</p>
              <p style={{ fontSize: '14px', fontWeight: 800, color: item.color }}>{item.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: '16px' }}>

        {/* ── ACTIVE ORDER CARD ── */}
        {activeOrder && (
          <div style={{ background: 'rgba(59,130,246,0.06)', border: '2px solid rgba(59,130,246,0.3)', borderRadius: '14px', padding: '14px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <p style={{ fontWeight: 800, fontSize: '14px', color: 'var(--blue)' }}>🚀 Active Order in Progress</p>
              <span className={`badge ${activeOrder.status === 'in_transit' ? 'badge-blue' : 'badge-green'}`}>{activeOrder.status}</span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '10px' }}>{activeOrder.sender_location} → {activeOrder.receiver_location}</p>

            {/* Distance info */}
            {(routeToSender || routeToReceiver) && (
              <div style={{ background: 'var(--bg2)', borderRadius: '8px', padding: '8px 10px', marginBottom: '10px' }}>
                {routeToSender   && <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--yellow)', marginBottom: routeToReceiver ? '4px' : 0 }}>🟡 You → Pickup: {routeToSender.distanceKm} km · ~{routeToSender.durationMin} min</p>}
                {routeToReceiver && <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--green)' }}>🟢 Pickup → Dropoff: {routeToReceiver.distanceKm} km · ~{routeToReceiver.durationMin} min</p>}
              </div>
            )}

            {/* Sender / Receiver detail */}
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
                  ✅ Mark as Delivered
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── AVAILABLE ORDERS ── */}
        {driverInfo?.is_on_duty ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text)' }}>
                📋 Available Orders ({pendingOrders.length})
              </h3>
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
                  <p style={{ fontWeight: 800, fontSize: '16px', color: 'var(--yellow)' }}>{(order.predicted_price || 0).toLocaleString()} RWF</p>
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
                  <button
                    onClick={() => acceptOrder(order)}
                    disabled={acceptingId === order.id || order.status === 'awaiting_payment'}
                    style={{ flex: 1, background: order.status === 'awaiting_payment' ? 'rgba(249,115,22,0.08)' : 'rgba(34,197,94,0.1)', border: `1px solid ${order.status === 'awaiting_payment' ? 'rgba(249,115,22,0.3)' : 'rgba(34,197,94,0.3)'}`, borderRadius: '10px', padding: '12px', color: order.status === 'awaiting_payment' ? '#f97316' : 'var(--green)', cursor: order.status === 'awaiting_payment' ? 'not-allowed' : 'pointer', fontWeight: 800, fontSize: '14px', fontFamily: 'Space Grotesk, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', opacity: acceptingId === order.id ? 0.5 : 1 }}
                  >
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