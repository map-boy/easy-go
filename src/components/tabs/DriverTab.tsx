import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { CheckCircle, XCircle, Navigation, Phone, Package } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { createNotification } from '../../lib/notifications';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const makeIcon = (emoji: string, color: string, size = 36) => L.divIcon({
  className: '',
  html: `<div style="width:${size}px;height:${size}px;background:${color};border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:${size * 0.5}px;border:3px solid #ffffff;box-shadow:0 0 12px ${color}88;">${emoji}</div>`,
  iconSize: [size, size],
  iconAnchor: [size / 2, size / 2],
});

const myIcon       = makeIcon('🏍️', '#f5c518', 42);
const senderIcon   = makeIcon('📤', '#22c55e', 34);
const receiverIcon = makeIcon('📥', '#ef4444', 34);

const MAP_STYLES = [
  { label: '🗺️ Street',    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png' },
  { label: '🛰️ Satellite', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}' },
  { label: '🌙 Dark',      url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png' },
];

function MapFollower({ pos }: { pos: [number, number] }) {
  const map = useMap();
  useEffect(() => { map.setView(pos, map.getZoom(), { animate: true }); }, [pos]);
  return null;
}

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

const KIGALI: [number, number] = [-1.9441, 30.0619];

export function DriverTab() {
  const { profile, refreshProfile } = useAuth();
  const [driverInfo, setDriverInfo]     = useState<any>(null);
  const [pendingOrders, setPendingOrders] = useState<any[]>([]);
  const [activeOrder, setActiveOrder]   = useState<any>(null);
  const [myLocation, setMyLocation]     = useState<[number, number] | null>(null);
  const [routeToSender, setRouteToSender]     = useState<any>(null);
  const [routeToReceiver, setRouteToReceiver] = useState<any>(null);
  const [mapStyle, setMapStyle]         = useState(0);
  const [showPicker, setShowPicker]     = useState(false);
  const [msg, setMsg]                   = useState('');
  const [loading, setLoading]           = useState(true);

  useEffect(() => {
    loadDriverData();
    startGPS();

    const channel = supabase.channel('driver-orders')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, () => loadPendingOrders())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, () => loadDriverData())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profile]);

  function startGPS() {
    if (!navigator.geolocation) return;
    navigator.geolocation.watchPosition(
      (pos) => setMyLocation([pos.coords.latitude, pos.coords.longitude]),
      () => {},
      { enableHighAccuracy: true, maximumAge: 3000 }
    );
  }

  async function loadDriverData() {
    if (!profile) return;
    const { data: driver } = await supabase
      .from('drivers')
      .select('*')
      .eq('user_id', profile.id)
      .single();
    setDriverInfo(driver);

    // Load active order (one they already accepted)
    const { data: active } = await supabase
      .from('orders')
      .select('*, profiles:sender_id(full_name, phone_number), receiver:receiver_id(full_name, phone_number)')
      .eq('driver_id', driver?.id)
      .in('status', ['accepted', 'paid', 'in_transit'])
      .single();
    setActiveOrder(active || null);

    await loadPendingOrders();
    setLoading(false);
  }

  async function loadPendingOrders() {
    const { data } = await supabase
      .from('orders')
      .select('*, profiles:sender_id(full_name, phone_number, latitude, longitude), receiver:receiver_id(full_name, phone_number, latitude, longitude)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    setPendingOrders(data || []);
  }

  // Load route when active order or my location changes
  useEffect(() => {
    if (!activeOrder || !myLocation) return;
    const senderPos   = activeOrder.profiles?.latitude && activeOrder.profiles?.longitude
      ? [activeOrder.profiles.latitude, activeOrder.profiles.longitude] as [number, number] : null;
    const receiverPos = activeOrder.receiver?.latitude && activeOrder.receiver?.longitude
      ? [activeOrder.receiver.latitude, activeOrder.receiver.longitude] as [number, number] : null;

    if (senderPos)   fetchRoute(myLocation, senderPos).then(setRouteToSender);
    if (senderPos && receiverPos) fetchRoute(senderPos, receiverPos).then(setRouteToReceiver);
  }, [activeOrder, myLocation]);

  function notify(m: string) {
    setMsg(m); setTimeout(() => setMsg(''), 3000);
  }

  async function toggleDuty() {
    if (!driverInfo) return;
    const newDuty = !driverInfo.is_on_duty;
    await supabase.from('drivers').update({
      is_on_duty:    newDuty,
      is_available:  newDuty,
      on_duty_since: newDuty ? new Date().toISOString() : null,
    }).eq('id', driverInfo.id);
    setDriverInfo({ ...driverInfo, is_on_duty: newDuty, is_available: newDuty });
    notify(newDuty ? '✅ You are now ON DUTY — orders will appear' : '🔴 You are OFF DUTY');
  }

  async function acceptOrder(order: any) {
    if (!driverInfo) return;
    const { error } = await supabase.from('orders').update({
      driver_id:  driverInfo.id,
      status:     'accepted',
      updated_at: new Date().toISOString(),
    }).eq('id', order.id);

    if (error) { notify('❌ Failed to accept order'); return; }

    // Notify sender
    await createNotification(
      order.sender_id,
      '🏍️ Driver Accepted Your Order!',
      `Your driver is on the way to pick up your package from ${order.sender_location}`,
      'order_accepted',
      order.id
    );
    // Notify receiver
    if (order.receiver_id) {
      await createNotification(
        order.receiver_id,
        '📦 Your Package is Coming!',
        `A driver has accepted delivery to ${order.receiver_location}`,
        'order_accepted',
        order.id
      );
    }

    notify('✅ Order accepted! Sender and receiver notified.');
    loadDriverData();
  }

  async function markPickedUp() {
    if (!activeOrder) return;
    await supabase.from('orders').update({ status: 'in_transit', updated_at: new Date().toISOString() }).eq('id', activeOrder.id);

    await createNotification(
      activeOrder.sender_id,
      '📦 Package Picked Up!',
      `Your package has been collected and is now in transit to ${activeOrder.receiver_location}`,
      'in_transit',
      activeOrder.id
    );
    if (activeOrder.receiver_id) {
      await createNotification(
        activeOrder.receiver_id,
        '🚀 Package In Transit!',
        `Your package is on its way — arriving at ${activeOrder.receiver_location}`,
        'in_transit',
        activeOrder.id
      );
    }
    notify('📦 Marked as picked up — in transit!');
    loadDriverData();
  }

  async function markDelivered() {
    if (!activeOrder) return;
    await supabase.from('orders').update({
      status:           'delivered',
      driver_confirmed: true,
      updated_at:       new Date().toISOString(),
    }).eq('id', activeOrder.id);

    await createNotification(
      activeOrder.sender_id,
      '✅ Package Delivered!',
      `Your package has been delivered to ${activeOrder.receiver_location}`,
      'delivered',
      activeOrder.id
    );
    if (activeOrder.receiver_id) {
      await createNotification(
        activeOrder.receiver_id,
        '🎉 Package Arrived!',
        `Your package has been delivered. Please confirm receipt.`,
        'delivered',
        activeOrder.id
      );
    }
    setRouteToSender(null);
    setRouteToReceiver(null);
    notify('🎉 Delivered! Great job!');
    loadDriverData();
  }

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '60px 0' }}>
      <div className="spinner" />
    </div>
  );

  const mapCenter: [number, number] = myLocation || KIGALI;
  const senderPos   = activeOrder?.profiles?.latitude  ? [activeOrder.profiles.latitude,  activeOrder.profiles.longitude]  as [number, number] : null;
  const receiverPos = activeOrder?.receiver?.latitude  ? [activeOrder.receiver.latitude,   activeOrder.receiver.longitude]  as [number, number] : null;

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100%' }}>

      <style>{`
        @keyframes pdot { 0%,100%{opacity:1;transform:scale(1);}50%{opacity:.4;transform:scale(.65);} }
        @keyframes ripple { 0%{transform:scale(1);opacity:.6;}100%{transform:scale(2.8);opacity:0;} }
      `}</style>

      {/* ── DUTY TOGGLE — BIG PROMINENT BUTTON ── */}
      <div style={{ padding: '16px', background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>
        {msg && (
          <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '10px', padding: '10px 14px', marginBottom: '12px', fontSize: '13px', fontWeight: 600, color: 'var(--green)' }}>
            {msg}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div>
            <p style={{ fontWeight: 800, fontSize: '18px', color: 'var(--text)', marginBottom: '2px' }}>
              {driverInfo?.is_on_duty ? '🟢 On Duty' : '🔴 Off Duty'}
            </p>
            <p style={{ fontSize: '12px', color: 'var(--text3)' }}>
              {driverInfo?.is_on_duty
                ? `Since ${driverInfo.on_duty_since ? new Date(driverInfo.on_duty_since).toLocaleTimeString() : 'now'}`
                : 'Go on duty to receive orders'}
            </p>
          </div>

          {/* Big duty toggle */}
          <button
            onClick={toggleDuty}
            style={{
              width: '72px', height: '38px',
              background: driverInfo?.is_on_duty ? '#22c55e' : 'var(--border2)',
              borderRadius: '20px', border: 'none', cursor: 'pointer',
              position: 'relative', transition: 'background .25s',
              boxShadow: driverInfo?.is_on_duty ? '0 0 16px rgba(34,197,94,0.4)' : 'none',
            }}
          >
            <div style={{
              position: 'absolute', top: '4px',
              left: driverInfo?.is_on_duty ? '38px' : '4px',
              width: '30px', height: '30px',
              background: '#ffffff', borderRadius: '50%',
              transition: 'left .25s',
              boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '14px',
            }}>
              {driverInfo?.is_on_duty ? '🟢' : '🔴'}
            </div>
          </button>
        </div>

        {/* Driver info */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <div style={{ flex: 1, background: 'var(--bg3)', borderRadius: '10px', padding: '10px', textAlign: 'center' }}>
            <p style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '4px' }}>Plate</p>
            <p style={{ fontSize: '14px', fontWeight: 800, color: 'var(--yellow)' }}>{driverInfo?.plate_number || '—'}</p>
          </div>
          <div style={{ flex: 1, background: 'var(--bg3)', borderRadius: '10px', padding: '10px', textAlign: 'center' }}>
            <p style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '4px' }}>Status</p>
            <p style={{ fontSize: '14px', fontWeight: 800, color: driverInfo?.is_on_duty ? 'var(--green)' : 'var(--text3)' }}>
              {driverInfo?.is_on_duty ? 'Available' : 'Offline'}
            </p>
          </div>
          <div style={{ flex: 1, background: 'var(--bg3)', borderRadius: '10px', padding: '10px', textAlign: 'center' }}>
            <p style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '4px' }}>GPS</p>
            <p style={{ fontSize: '14px', fontWeight: 800, color: myLocation ? 'var(--green)' : 'var(--red)' }}>
              {myLocation ? 'Live' : 'Off'}
            </p>
          </div>
        </div>
      </div>

      {/* ── LIVE MAP ── */}
      <div style={{ position: 'relative', height: '250px' }}>
        <MapContainer center={mapCenter} zoom={15} style={{ height: '100%', width: '100%' }} zoomControl={false} scrollWheelZoom={false} attributionControl={false}>
          <TileLayer url={MAP_STYLES[mapStyle].url} maxZoom={19} />
          {myLocation && (
            <>
              <MapFollower pos={myLocation} />
              <Marker position={myLocation} icon={myIcon}><Popup>🏍️ You are here</Popup></Marker>
            </>
          )}
          {senderPos && <Marker position={senderPos} icon={senderIcon}><Popup>📤 Pickup point</Popup></Marker>}
          {receiverPos && <Marker position={receiverPos} icon={receiverIcon}><Popup>📥 Dropoff point</Popup></Marker>}
          {routeToSender && <Polyline positions={routeToSender.points} color="#f5c518" weight={4} opacity={0.9} />}
          {routeToReceiver && <Polyline positions={routeToReceiver.points} color="#22c55e" weight={4} opacity={0.9} />}
        </MapContainer>

        {/* LIVE badge */}
        <div style={{ position: 'absolute', top: '10px', left: '10px', zIndex: 999, background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)', borderRadius: '20px', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '5px', border: '1px solid rgba(34,197,94,0.4)', boxShadow: '0 2px 6px rgba(0,0,0,0.1)' }}>
          <div style={{ width: '6px', height: '6px', background: '#22c55e', borderRadius: '50%', animation: 'pdot 1.6s ease infinite' }} />
          <span style={{ fontSize: '10px', color: '#111', fontWeight: 700 }}>LIVE GPS</span>
        </div>

        {/* Map style */}
        <div style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 999 }}>
          <button onClick={() => setShowPicker(!showPicker)} style={{ background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)', border: '1px solid rgba(0,0,0,0.15)', borderRadius: '8px', padding: '4px 10px', cursor: 'pointer', fontSize: '11px', fontWeight: 700, color: '#111', fontFamily: 'Space Grotesk, sans-serif', display: 'flex', alignItems: 'center', gap: '4px' }}>
            {MAP_STYLES[mapStyle].label} ▾
          </button>
          {showPicker && (
            <div style={{ position: 'absolute', top: '32px', right: 0, background: 'rgba(255,255,255,0.97)', border: '1px solid rgba(0,0,0,0.12)', borderRadius: '12px', padding: '6px', minWidth: '140px', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 9999 }}>
              {MAP_STYLES.map((s, i) => (
                <button key={s.label} onClick={() => { setMapStyle(i); setShowPicker(false); }} style={{ background: mapStyle === i ? '#f5c518' : 'transparent', border: 'none', borderRadius: '8px', padding: '7px 10px', cursor: 'pointer', fontSize: '11px', fontWeight: 700, color: mapStyle === i ? '#0a0a0a' : '#333', width: '100%', textAlign: 'left', fontFamily: 'Space Grotesk, sans-serif' }}>
                  {s.label}{mapStyle === i && ' ✓'}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Route distances on map */}
        {(routeToSender || routeToReceiver) && (
          <div style={{ position: 'absolute', bottom: '10px', left: '10px', zIndex: 999, background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)', borderRadius: '10px', padding: '8px 12px', boxShadow: '0 2px 6px rgba(0,0,0,0.1)' }}>
            {routeToSender && <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}><div style={{ width: '16px', height: '3px', background: '#f5c518', borderRadius: '2px' }} /><span style={{ fontSize: '10px', fontWeight: 700, color: '#333' }}>To pickup: {routeToSender.distanceKm}km · {routeToSender.durationMin}min</span></div>}
            {routeToReceiver && <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '16px', height: '3px', background: '#22c55e', borderRadius: '2px' }} /><span style={{ fontSize: '10px', fontWeight: 700, color: '#333' }}>To dropoff: {routeToReceiver.distanceKm}km · {routeToReceiver.durationMin}min</span></div>}
          </div>
        )}
      </div>

      <div style={{ padding: '16px' }}>

        {/* ── ACTIVE ORDER ── */}
        {activeOrder && (
          <div style={{ background: 'rgba(34,197,94,0.06)', border: '2px solid rgba(34,197,94,0.3)', borderRadius: '14px', padding: '16px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <p style={{ fontWeight: 800, fontSize: '15px', color: 'var(--green)' }}>🚀 Active Order</p>
              <span className={`badge ${activeOrder.status === 'in_transit' ? 'badge-blue' : 'badge-green'}`}>{activeOrder.status}</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
              <div style={{ background: 'var(--bg2)', borderRadius: '10px', padding: '10px' }}>
                <p style={{ fontSize: '10px', color: 'var(--text3)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '.06em', marginBottom: '4px' }}>📤 Pickup</p>
                <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', marginBottom: '2px' }}>{activeOrder.profiles?.full_name}</p>
                <p style={{ fontSize: '11px', color: 'var(--text3)' }}>{activeOrder.sender_location}</p>
                <p style={{ fontSize: '11px', color: 'var(--blue)', display: 'flex', alignItems: 'center', gap: '3px', marginTop: '4px' }}><Phone size={9} />{activeOrder.profiles?.phone_number}</p>
                {routeToSender && <p style={{ fontSize: '11px', color: 'var(--yellow)', fontWeight: 700, marginTop: '4px' }}>📍 {routeToSender.distanceKm}km · ~{routeToSender.durationMin}min</p>}
              </div>
              <div style={{ background: 'var(--bg2)', borderRadius: '10px', padding: '10px' }}>
                <p style={{ fontSize: '10px', color: 'var(--text3)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '.06em', marginBottom: '4px' }}>📥 Dropoff</p>
                <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', marginBottom: '2px' }}>{activeOrder.receiver?.full_name}</p>
                <p style={{ fontSize: '11px', color: 'var(--text3)' }}>{activeOrder.receiver_location}</p>
                <p style={{ fontSize: '11px', color: 'var(--blue)', display: 'flex', alignItems: 'center', gap: '3px', marginTop: '4px' }}><Phone size={9} />{activeOrder.receiver?.phone_number}</p>
                {routeToReceiver && <p style={{ fontSize: '11px', color: 'var(--green)', fontWeight: 700, marginTop: '4px' }}>📍 {routeToReceiver.distanceKm}km · ~{routeToReceiver.durationMin}min</p>}
              </div>
            </div>

            <div style={{ background: 'var(--bg2)', borderRadius: '10px', padding: '10px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ fontSize: '12px', color: 'var(--text3)' }}><Package size={11} style={{ display: 'inline', marginRight: '5px' }} />{activeOrder.package_size} · {activeOrder.package_weight}</p>
              <p style={{ fontSize: '15px', fontWeight: 800, color: 'var(--yellow)' }}>{(activeOrder.predicted_price || 0).toLocaleString()} RWF</p>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '8px' }}>
              {activeOrder.status === 'paid' && (
                <button onClick={markPickedUp} style={{ flex: 1, background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: '10px', padding: '12px', color: 'var(--blue)', cursor: 'pointer', fontWeight: 700, fontSize: '13px', fontFamily: 'Space Grotesk, sans-serif' }}>
                  📦 Mark Picked Up
                </button>
              )}
              {activeOrder.status === 'in_transit' && (
                <button onClick={markDelivered} style={{ flex: 1, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '10px', padding: '12px', color: 'var(--green)', cursor: 'pointer', fontWeight: 700, fontSize: '13px', fontFamily: 'Space Grotesk, sans-serif' }}>
                  ✅ Mark Delivered
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── PENDING ORDERS LIST ── */}
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
                <p style={{ color: 'var(--text3)', fontSize: '12px', marginTop: '4px' }}>New orders will appear here automatically</p>
              </div>
            ) : pendingOrders.map(order => (
              <div key={order.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '14px', padding: '14px', marginBottom: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                  <div>
                    <p style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: 'monospace', marginBottom: '2px' }}>#{order.id.slice(0, 8)}</p>
                    <p style={{ fontSize: '12px', color: 'var(--text3)' }}>{new Date(order.created_at).toLocaleString()}</p>
                  </div>
                  <p style={{ fontWeight: 800, fontSize: '16px', color: 'var(--yellow)' }}>{(order.predicted_price || 0).toLocaleString()} RWF</p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                  <div style={{ background: 'var(--bg3)', borderRadius: '8px', padding: '10px' }}>
                    <p style={{ fontSize: '10px', color: 'var(--text3)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '.06em', marginBottom: '4px' }}>📤 From</p>
                    <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', marginBottom: '2px' }}>{order.sender_name}</p>
                    <p style={{ fontSize: '11px', color: 'var(--text3)' }}>{order.sender_location}</p>
                  </div>
                  <div style={{ background: 'var(--bg3)', borderRadius: '8px', padding: '10px' }}>
                    <p style={{ fontSize: '10px', color: 'var(--text3)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '.06em', marginBottom: '4px' }}>📥 To</p>
                    <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', marginBottom: '2px' }}>{order.receiver_name}</p>
                    <p style={{ fontSize: '11px', color: 'var(--text3)' }}>{order.receiver_location}</p>
                  </div>
                </div>

                <p style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '12px' }}>
                  <Package size={11} style={{ display: 'inline', marginRight: '4px' }} />
                  {order.package_size} · {order.package_weight}
                </p>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => acceptOrder(order)}
                    style={{ flex: 1, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '10px', padding: '12px', color: 'var(--green)', cursor: 'pointer', fontWeight: 800, fontSize: '14px', fontFamily: 'Space Grotesk, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  >
                    <CheckCircle size={15} /> Accept Order
                  </button>
                  <button
                    style={{ width: '48px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
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