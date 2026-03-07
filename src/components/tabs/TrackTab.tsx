import { useEffect, useState, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Package, CheckCircle, Clock, AlertCircle, Phone, Search, Filter, User, Truck, BarChart2, X, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

// ── Fix Leaflet default icon bug ─────────────────────────────────────────
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function isClearlyWrong(lat: number, lng: number) {
  return lat > 15 || lat < -20 || lng < 20 || lng > 52;
}

// ── Live pulsing dot for current user ────────────────────────────────────
const meIcon = L.divIcon({
  className: '',
  html: `
    <div style="position:relative;width:44px;height:44px;display:flex;align-items:center;justify-content:center;">
      <div style="position:absolute;width:44px;height:44px;background:rgba(59,130,246,0.15);border-radius:50%;animation:tt-ripple 2s ease infinite;"></div>
      <div style="position:absolute;width:28px;height:28px;background:rgba(59,130,246,0.25);border-radius:50%;animation:tt-ripple 2s ease infinite .5s;"></div>
      <div style="width:18px;height:18px;background:#2563eb;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 2px #2563eb,0 4px 12px rgba(37,99,235,0.6);position:relative;z-index:1;"></div>
    </div>`,
  iconSize: [44, 44], iconAnchor: [22, 22],
});

// ── Motari icon (yellow bike) ─────────────────────────────────────────────
const motariIcon = L.divIcon({
  className: '',
  html: `
    <div style="display:flex;flex-direction:column;align-items:center;">
      <div style="width:42px;height:42px;background:#f5c518;border-radius:50%;border:3px solid #fff;
        box-shadow:0 2px 12px rgba(245,197,24,0.7);display:flex;align-items:center;justify-content:center;font-size:20px;">
        🏍️
      </div>
      <div style="width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;
        border-top:9px solid #f5c518;margin-top:-1px;"></div>
    </div>`,
  iconSize: [42, 54], iconAnchor: [21, 54], popupAnchor: [0, -56],
});

const makePin = (color: string, emoji: string) => L.divIcon({
  className: '',
  html: `
    <div style="display:flex;flex-direction:column;align-items:center;">
      <div style="width:40px;height:40px;background:${color};border-radius:50%;border:3px solid #fff;
        box-shadow:0 2px 10px ${color}99;display:flex;align-items:center;justify-content:center;font-size:18px;">
        ${emoji}
      </div>
      <div style="width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;
        border-top:9px solid ${color};margin-top:-1px;"></div>
    </div>`,
  iconSize: [40, 52], iconAnchor: [20, 52], popupAnchor: [0, -54],
});

const senderIcon   = makePin('#f59e0b', '📤');
const receiverIcon = makePin('#22c55e', '📥');
const driverIcon   = makePin('#3b82f6', '🏍️');

const MAP_STYLES = [
  { label: '🗺️ Street',    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png' },
  { label: '🛰️ Satellite', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}' },
  { label: '🌙 Dark',      url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png' },
];

const KIGALI: [number, number] = [-1.9441, 30.0619];

function MapFollower({ pos }: { pos: [number, number] }) {
  const map = useMap();
  useEffect(() => { map.setView(pos, map.getZoom(), { animate: true }); }, [pos[0], pos[1]]);
  return null;
}

function MapBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length >= 2) {
      map.fitBounds(L.latLngBounds(positions), { padding: [56, 56], animate: true });
    } else if (positions.length === 1) {
      map.setView(positions[0], 15, { animate: true });
    }
  }, [positions.map(p => p.join(',')).join('|')]);
  return null;
}

async function fetchRoute(from: [number, number], to: [number, number]) {
  try {
    const res  = await fetch(`https://router.project-osrm.org/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`);
    const data = await res.json();
    if (!data.routes?.[0]) return null;
    const r = data.routes[0];
    return {
      points:      r.geometry.coordinates.map(([lng, lat]: number[]) => [lat, lng]) as [number, number][],
      distanceKm:  Math.round(r.distance / 100) / 10,
      durationMin: Math.round(r.duration / 60),
    };
  } catch { return null; }
}

async function geocode(loc: string, district?: string): Promise<[number, number] | null> {
  if (!loc?.trim()) return null;
  try {
    const q   = encodeURIComponent([loc.trim(), district, 'Rwanda'].filter(Boolean).join(', '));
    const res = await fetch(
      `https://photon.komoot.io/api/?q=${q}&limit=1&bbox=28.8,-2.9,30.9,-1.0&lang=en`
    );
    const d = await res.json();
    const f = d.features?.[0];
    return f ? [f.geometry.coordinates[1], f.geometry.coordinates[0]] : null;
  } catch { return null; }
}

const STATUS_COLOR = (s: string) =>
  s === 'delivered'        ? '#22c55e' :
  s === 'in_transit'       ? '#3b82f6' :
  s === 'accepted'         ? '#8b5cf6' :
  s === 'pending'          ? '#22c55e' :
  s === 'awaiting_payment' ? '#f59e0b' : '#6b7280';

const STATUS_LABEL = (s: string) =>
  s === 'awaiting_payment' ? '⏳ Awaiting Payment'     :
  s === 'pending'          ? '✅ Paid — Finding Driver' :
  s === 'accepted'         ? '🏍️ Driver Assigned'      :
  s === 'in_transit'       ? '🚀 On The Way!'           :
  s === 'delivered'        ? '✅ Delivered'              : s;

// ════════════════════════════════════════════════════════════════════════════
export function TrackTab() {
  const { profile } = useAuth();

  const [myLocation,   setMyLocation]   = useState<[number, number] | null>(null);
  const [locationName, setLocationName] = useState('Getting location…');
  const [accuracy,     setAccuracy]     = useState<number | null>(null);
  const watchRef = useRef<number | null>(null);

  const [mapStyle,   setMapStyle]   = useState(0);
  const [showPicker, setShowPicker] = useState(false);

  const [orders,    setOrders]    = useState<any[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [payStatus, setPayStatus] = useState<Record<string, string>>({});
  const [payingId,  setPayingId]  = useState<string | null>(null);

  // ── NEW: filters, search, selected order, active tab ──────────────────────
  const [searchQ,       setSearchQ]       = useState('');
  const [filterStatus,  setFilterStatus]  = useState('all');
  const [filterDriver,  setFilterDriver]  = useState('all');
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [activeTab,     setActiveTab]     = useState<'map'|'deliveries'|'drivers'|'stats'>('map');
  const [showFilters,   setShowFilters]   = useState(false);
  const [drivers,       setDrivers]       = useState<any[]>([]);

  // Routes for active order
  const [routeM2S, setRouteM2S] = useState<any>(null); // motari → sender
  const [routeS2R, setRouteS2R] = useState<any>(null); // sender → receiver
  const [routeM2R, setRouteM2R] = useState<any>(null); // motari → receiver (in_transit)

  const isMotari = (profile as any)?.user_category === 'motari' || (profile as any)?.role === 'driver';

  // ── GPS ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!navigator.geolocation) { setLocationName('GPS not supported'); return; }
    navigator.geolocation.getCurrentPosition(
      pos => handlePosition(pos), () => {},
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
    );
    watchRef.current = navigator.geolocation.watchPosition(
      pos => handlePosition(pos), () => {},
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
    );
    return () => { if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current); };
  }, []);

  function handlePosition(pos: GeolocationPosition) {
    const { latitude, longitude, accuracy: acc } = pos.coords;
    if (isClearlyWrong(latitude, longitude)) return;
    setMyLocation([latitude, longitude]);
    setAccuracy(Math.round(acc));
    reverseGeocode(latitude, longitude);
    if (profile?.id) {
      supabase.from('profiles').update({ latitude, longitude }).eq('id', profile.id).then(() => {});
      // Also update drivers table for motari so sender/receiver can see them move
      if (isMotari) {
        supabase.from('drivers').update({ latitude, longitude }).eq('user_id', profile.id).then(() => {});
      }
    }
  }

  async function reverseGeocode(lat: number, lng: number) {
    try {
      const res  = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}&limit=1`);
      const data = await res.json();
      const f = data.features?.[0]?.properties;
      const parts = [f?.district || f?.suburb, f?.city || f?.town || 'Kigali'].filter(Boolean);
      setLocationName(parts.join(', ') || 'Rwanda');
    } catch { setLocationName(`${lat.toFixed(4)}, ${lng.toFixed(4)}`); }
  }

  // ── Load orders + realtime ───────────────────────────────────────────────
  useEffect(() => {
    if (!profile?.id) return;
    loadOrders();
    const ch = supabase.channel('tracktab-v3')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' },  () => loadOrders())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'drivers' }, () => loadOrders())
      .subscribe();
    const poll = setInterval(() => loadOrders(), 4000);
    return () => { supabase.removeChannel(ch); clearInterval(poll); };
  }, [profile?.id, myLocation?.[0], myLocation?.[1]]);

  async function loadOrders() {
    if (!profile?.id) return;

    let query = supabase
      .from('orders')
      .select('*, drivers:driver_id(id, latitude, longitude, plate_number, profiles:user_id(full_name, phone_number))')
      .order('created_at', { ascending: false });

    if (isMotari) {
      // Motari sees only orders assigned to them
      const { data: dr } = await supabase.from('drivers').select('id').eq('user_id', profile.id).maybeSingle();
      if (dr) query = query.eq('driver_id', dr.id);
      else { setLoading(false); return; }
    } else {
      query = query.or(`sender_id.eq.${profile.id},receiver_id.eq.${profile.id}`);
    }

    const { data } = await query;
    if (!data) { setLoading(false); return; }

    const enriched = await Promise.all(data.map(async (o: any) => {
      // Sender position
      let senderPos: [number, number] | null = null;
      if (o.sender_id === profile.id && myLocation) {
        senderPos = myLocation;
      } else {
        const { data: sp } = await supabase.from('profiles').select('latitude,longitude').eq('id', o.sender_id).maybeSingle();
        if (sp?.latitude && sp?.longitude) senderPos = [sp.latitude, sp.longitude];
        else senderPos = await geocode(o.sender_location, o.sender_district);
      }

      // Receiver position
      let receiverPos: [number, number] | null = null;
      const isMe = o.receiver_id === profile.id || o.receiver_number === (profile as any).phone_number;
      if (isMe && myLocation) {
        receiverPos = myLocation;
      } else if (o.receiver_id) {
        const { data: rp } = await supabase.from('profiles').select('latitude,longitude').eq('id', o.receiver_id).maybeSingle();
        if (rp?.latitude && rp?.longitude) receiverPos = [rp.latitude, rp.longitude];
        else receiverPos = await geocode(o.receiver_location, o.receiver_district);
      } else {
        receiverPos = await geocode(o.receiver_location, o.receiver_district);
      }

      // Driver position from drivers table (live)
      let driverPos: [number, number] | null = null;
      if (o.drivers?.latitude && o.drivers?.longitude) {
        driverPos = [o.drivers.latitude, o.drivers.longitude];
      }

      return {
        ...o, senderPos, receiverPos, driverPos,
        driver_name:  o.drivers?.profiles?.full_name    ?? null,
        driver_phone: o.drivers?.profiles?.phone_number ?? null,
        driver_plate: o.drivers?.plate_number           ?? null,
      };
    }));

    setOrders(enriched);
    setLoading(false);

    // ── Compute routes for motari active order ──
    const active = enriched.find(o => ['accepted', 'in_transit'].includes(o.status));
    if (active) {
      const motariPos: [number, number] | null = isMotari && myLocation ? myLocation : active.driverPos;

      const [m2s, s2r, m2r] = await Promise.all([
        motariPos && active.senderPos   ? fetchRoute(motariPos, active.senderPos)   : Promise.resolve(null),
        active.senderPos && active.receiverPos ? fetchRoute(active.senderPos, active.receiverPos) : Promise.resolve(null),
        motariPos && active.receiverPos && active.status === 'in_transit' ? fetchRoute(motariPos, active.receiverPos) : Promise.resolve(null),
      ]);
      setRouteM2S(m2s);
      setRouteS2R(s2r);
      setRouteM2R(m2r);
    } else {
      setRouteM2S(null); setRouteS2R(null); setRouteM2R(null);
    }
  }

  // ── MoMo payment via Noor ────────────────────────────────────────────────
  async function handlePay(orderId: string) {
    const order = orders.find(o => o.id === orderId);
    if (!order || !profile) return;
    setPayingId(orderId);
    setPayStatus(s => ({ ...s, [orderId]: 'requesting' }));
    try {
      const NOOR_URL = (import.meta as any).env?.VITE_NOOR_URL || 'http://localhost:3001';
      const NOOR_KEY = (import.meta as any).env?.VITE_NOOR_API_KEY || '';

      // Step 1: Request payment from Noor
      const res = await fetch(`${NOOR_URL}/api/payments/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': NOOR_KEY },
        body: JSON.stringify({
          orderId,
          amount:      order.predicted_price,
          phoneNumber: (profile as any).phone_number,
          payerName:   profile.full_name,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.transactionId) throw new Error(data.error || 'Noor request failed');

      setPayStatus(s => ({ ...s, [orderId]: 'pending' }));

      // Step 2: Poll Noor every 5s for payment status
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        if (attempts > 24) {
          clearInterval(poll);
          setPayStatus(s => ({ ...s, [orderId]: 'timeout' }));
          setPayingId(null);
          return;
        }
        try {
          const chkRes = await fetch(`${NOOR_URL}/api/payments/status/${data.transactionId}`, {
            headers: { 'x-api-key': NOOR_KEY },
          });
          const chk = await chkRes.json();
          if (chk.status === 'SUCCESSFUL') {
            clearInterval(poll);
            setPayStatus(s => ({ ...s, [orderId]: 'paid' }));
            setPayingId(null);
            loadOrders();
          } else if (chk.status === 'FAILED') {
            clearInterval(poll);
            setPayStatus(s => ({ ...s, [orderId]: 'failed' }));
            setPayingId(null);
          }
        } catch { /* keep polling */ }
      }, 5000);

    } catch { setPayStatus(s => ({ ...s, [orderId]: 'failed' })); setPayingId(null); }
  }

  // ── Load drivers ──────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.from('drivers').select('*, profiles:user_id(full_name, phone_number)').then(({ data }) => {
      if (data) setDrivers(data);
    });
    const ch = supabase.channel('drivers-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, async () => {
        const { data } = await supabase.from('drivers').select('*, profiles:user_id(full_name, phone_number)');
        if (data) setDrivers(data);
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // ── Derived ───────────────────────────────────────────────────────────────
  const activeOrder = orders.find(o => ['accepted', 'in_transit'].includes(o.status));
  const hasActiveOrder = orders.some(o => ['awaiting_payment', 'pending', 'accepted', 'in_transit'].includes(o.status));

  // Map center and bounds
  const motariPos: [number, number] | null = isMotari && myLocation ? myLocation : (activeOrder?.driverPos ?? null);

  const allMapPositions: [number, number][] = [
    ...(myLocation ? [myLocation] : []),
    ...(motariPos && !isMotari ? [motariPos] : []),
    ...(activeOrder?.senderPos   ? [activeOrder.senderPos]   : []),
    ...(activeOrder?.receiverPos ? [activeOrder.receiverPos] : []),
  ].filter(Boolean) as [number, number][];

  const mapCenter: [number, number] = myLocation ?? KIGALI;

  // ── RENDER ────────────────────────────────────────────────────────────────

  // Filtered orders
  const filteredOrders = orders.filter(o => {
    const matchSearch = !searchQ ||
      o.id.toLowerCase().includes(searchQ.toLowerCase()) ||
      o.sender_name?.toLowerCase().includes(searchQ.toLowerCase()) ||
      o.receiver_name?.toLowerCase().includes(searchQ.toLowerCase()) ||
      o.sender_location?.toLowerCase().includes(searchQ.toLowerCase()) ||
      o.receiver_location?.toLowerCase().includes(searchQ.toLowerCase());
    const matchStatus = filterStatus === 'all' || o.status === filterStatus;
    const matchDriver = filterDriver === 'all' || o.driver_name === filterDriver;
    return matchSearch && matchStatus && matchDriver;
  });

  // Stats
  const stats = {
    active:    orders.filter(o => ['pending','accepted','in_transit'].includes(o.status)).length,
    delivered: orders.filter(o => o.status === 'delivered').length,
    delayed:   orders.filter(o => {
      if (!o.created_at) return false;
      const age = (Date.now() - new Date(o.created_at).getTime()) / 60000;
      return ['pending','accepted'].includes(o.status) && age > 60;
    }).length,
    avgTime: (() => {
      const done = orders.filter(o => o.status === 'delivered' && o.created_at && o.updated_at);
      if (!done.length) return 0;
      const avg = done.reduce((s, o) => s + (new Date(o.updated_at).getTime() - new Date(o.created_at).getTime()), 0) / done.length;
      return Math.round(avg / 60000);
    })(),
  };

  // Unique drivers in orders
  const uniqueDrivers = [...new Set(orders.map(o => o.driver_name).filter(Boolean))];

  // Timeline steps
  function getTimeline(order: any) {
    const steps = [
      { key: 'received',   label: 'Order Received',    icon: '📋', done: true },
      { key: 'paid',       label: 'Payment Confirmed',  icon: '💰', done: order.sender_paid },
      { key: 'accepted',   label: 'Driver Assigned',    icon: '🏍️', done: ['accepted','in_transit','delivered'].includes(order.status) },
      { key: 'in_transit', label: 'In Transit',         icon: '🚀', done: ['in_transit','delivered'].includes(order.status) },
      { key: 'delivered',  label: 'Delivered',          icon: '✅', done: order.status === 'delivered' },
    ];
    return steps;
  }

  const tabStyle = (t: string) => ({
    flex: 1, padding: '10px 4px', border: 'none', borderRadius: '10px', cursor: 'pointer',
    fontFamily: 'Space Grotesk, sans-serif', fontSize: '11px', fontWeight: 700,
    background: activeTab === t ? 'var(--yellow)' : 'transparent',
    color: activeTab === t ? '#0a0a0a' : 'var(--text3)',
    transition: 'all .2s',
  } as React.CSSProperties);

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <style>{`
        @keyframes tt-ripple { 0%{transform:scale(1);opacity:.6;} 100%{transform:scale(2.8);opacity:0;} }
        @keyframes tt-dot { 0%,100%{opacity:1;transform:scale(1);} 50%{opacity:.4;transform:scale(.65);} }
      `}</style>

      {/* ══ TAB BAR ══ */}
      <div style={{ display: 'flex', gap: '6px', padding: '12px 16px 0', background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>
        {(['map','deliveries','drivers','stats'] as const).map(t => (
          <button key={t} style={tabStyle(t)} onClick={() => setActiveTab(t)}>
            {t === 'map' ? '🗺️ Map' : t === 'deliveries' ? '📦 Orders' : t === 'drivers' ? '🏍️ Drivers' : '📊 Stats'}
          </button>
        ))}
      </div>

      {/* ══════════ MAP TAB ══════════ */}
      {activeTab === 'map' && (
        <div>
          <div style={{ position: 'relative', height: '360px', width: '100%' }}>
            <MapContainer center={mapCenter} zoom={myLocation ? 14 : 13} style={{ height: '100%', width: '100%' }} zoomControl={false} scrollWheelZoom={true} attributionControl={false}>
              <TileLayer url={MAP_STYLES[mapStyle].url} maxZoom={19} />
              {myLocation && !activeOrder && <MapFollower pos={myLocation} />}
              {allMapPositions.length >= 2 && <MapBounds positions={allMapPositions} />}
              {routeM2S?.points && activeOrder?.status !== 'in_transit' && <Polyline positions={routeM2S.points} color="#f5c518" weight={5} opacity={0.9} dashArray="10 6" />}
              {routeM2R?.points && activeOrder?.status === 'in_transit' && <Polyline positions={routeM2R.points} color="#3b82f6" weight={5} opacity={0.9} />}
              {routeS2R?.points && <Polyline positions={routeS2R.points} color="#22c55e" weight={3} opacity={0.5} dashArray="6 6" />}
              {myLocation && <Marker position={myLocation} icon={meIcon}><Popup><div style={{ fontFamily: 'Space Grotesk, sans-serif', minWidth: '150px' }}><p style={{ fontWeight: 800, fontSize: '13px', marginBottom: '4px' }}>{isMotari ? '🏍️ You (Motari)' : '📍 You are here'}</p><p style={{ fontSize: '12px', color: '#555' }}>{locationName}</p>{accuracy && <p style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>GPS ±{accuracy}m</p>}</div></Popup></Marker>}
              {!isMotari && activeOrder?.driverPos && <Marker position={activeOrder.driverPos} icon={driverIcon}><Popup><div style={{ fontFamily: 'Space Grotesk, sans-serif', minWidth: '170px' }}><p style={{ fontWeight: 800, fontSize: '14px', marginBottom: '6px' }}>🏍️ Your Motari</p><p style={{ fontSize: '13px', fontWeight: 700 }}>{activeOrder.driver_name || 'Driver'}</p>{activeOrder.driver_phone && <p style={{ fontSize: '12px', color: '#555', marginTop: '3px' }}>📞 <a href={`tel:${activeOrder.driver_phone}`} style={{ color: '#2563eb' }}>{activeOrder.driver_phone}</a></p>}</div></Popup></Marker>}
              {activeOrder?.senderPos && <Marker position={activeOrder.senderPos} icon={senderIcon}><Popup><div style={{ fontFamily: 'Space Grotesk, sans-serif', minWidth: '160px' }}><p style={{ fontWeight: 800, fontSize: '14px', marginBottom: '6px' }}>📤 Sender</p><p style={{ fontSize: '13px', fontWeight: 700 }}>{activeOrder.sender_name}</p><p style={{ fontSize: '12px', color: '#555' }}>📍 {activeOrder.sender_location}</p></div></Popup></Marker>}
              {activeOrder?.receiverPos && <Marker position={activeOrder.receiverPos} icon={receiverIcon}><Popup><div style={{ fontFamily: 'Space Grotesk, sans-serif', minWidth: '160px' }}><p style={{ fontWeight: 800, fontSize: '14px', marginBottom: '6px' }}>📥 Receiver</p><p style={{ fontSize: '13px', fontWeight: 700 }}>{activeOrder.receiver_name}</p><p style={{ fontSize: '12px', color: '#555' }}>📍 {activeOrder.receiver_location}</p></div></Popup></Marker>}
            </MapContainer>

            {/* GPS badge */}
            <div style={{ position: 'absolute', top: '12px', left: '12px', zIndex: 999, background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)', borderRadius: '20px', padding: '5px 12px', display: 'flex', alignItems: 'center', gap: '6px', border: `1px solid ${myLocation ? 'rgba(34,197,94,0.4)' : 'rgba(245,158,11,0.4)'}`, boxShadow: '0 2px 8px rgba(0,0,0,0.12)' }}>
              <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: myLocation ? '#22c55e' : '#f59e0b', animation: 'tt-dot 1.6s ease infinite' }} />
              <span style={{ fontSize: '11px', color: '#111', fontWeight: 700, letterSpacing: '.06em' }}>{myLocation ? 'LIVE GPS' : 'LOCATING…'}</span>
            </div>

            {/* Map style picker */}
            <div style={{ position: 'absolute', top: '12px', right: '12px', zIndex: 999 }}>
              <button onClick={() => setShowPicker(!showPicker)} style={{ background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)', border: '1px solid rgba(0,0,0,0.15)', borderRadius: '10px', padding: '6px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: 700, fontFamily: 'Space Grotesk, sans-serif', boxShadow: '0 2px 8px rgba(0,0,0,0.12)' }}>
                {MAP_STYLES[mapStyle].label} ▾
              </button>
              {showPicker && (
                <div style={{ position: 'absolute', top: '38px', right: 0, background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(12px)', border: '1px solid rgba(0,0,0,0.12)', borderRadius: '12px', padding: '6px', minWidth: '145px', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', gap: '3px', zIndex: 9999 }}>
                  {MAP_STYLES.map((s, i) => (
                    <button key={s.label} onClick={() => { setMapStyle(i); setShowPicker(false); }} style={{ background: mapStyle === i ? '#f5c518' : 'transparent', border: 'none', borderRadius: '8px', padding: '8px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: 700, color: mapStyle === i ? '#0a0a0a' : '#333', textAlign: 'left', width: '100%' }}>
                      {s.label} {mapStyle === i && '✓'}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Location name */}
            <div style={{ position: 'absolute', bottom: '12px', left: '50%', transform: 'translateX(-50%)', zIndex: 999, background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)', borderRadius: '20px', padding: '6px 16px', display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid rgba(0,0,0,0.1)', boxShadow: '0 2px 8px rgba(0,0,0,0.12)', whiteSpace: 'nowrap', maxWidth: '85%' }}>
              <MapPin size={11} color="#f5c518" />
              <span style={{ fontSize: '12px', color: '#111', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{locationName}</span>
              {accuracy && <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '10px', fontWeight: 600, background: accuracy < 30 ? 'rgba(34,197,94,0.1)' : 'rgba(245,197,24,0.1)', color: accuracy < 30 ? '#16a34a' : '#ca8a04' }}>±{accuracy}m</span>}
            </div>

            {/* ETA bars */}
            {isMotari && activeOrder && (routeM2S || routeM2R || routeS2R) && (
              <div style={{ position: 'absolute', bottom: '50px', left: '12px', right: '12px', zIndex: 998, background: 'rgba(0,0,0,0.75)', borderRadius: '10px', padding: '8px 14px', display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                {routeM2S && activeOrder.status !== 'in_transit' && <span style={{ color: '#f5c518', fontWeight: 700, fontSize: '12px' }}>🏍️→📤 {routeM2S.distanceKm}km · ~{routeM2S.durationMin}min to pickup</span>}
                {routeM2R && activeOrder.status === 'in_transit' && <span style={{ color: '#60a5fa', fontWeight: 700, fontSize: '12px' }}>🏍️→📥 {routeM2R.distanceKm}km · ~{routeM2R.durationMin}min to dropoff</span>}
                {routeS2R && <span style={{ color: '#4ade80', fontWeight: 700, fontSize: '12px' }}>📤→📥 {routeS2R.distanceKm}km total</span>}
              </div>
            )}
            {!isMotari && activeOrder?.driverPos && (routeM2S || routeM2R) && (
              <div style={{ position: 'absolute', bottom: '50px', left: '12px', right: '12px', zIndex: 998, background: 'rgba(0,0,0,0.75)', borderRadius: '10px', padding: '8px 14px', display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                {routeM2S && activeOrder.status !== 'in_transit' && <span style={{ color: '#f59e0b', fontWeight: 700, fontSize: '12px' }}>🏍️ → you in ~{routeM2S.durationMin}min ({routeM2S.distanceKm}km)</span>}
                {routeM2R && activeOrder.status === 'in_transit' && <span style={{ color: '#60a5fa', fontWeight: 700, fontSize: '12px' }}>ETA ~{routeM2R.durationMin}min · {routeM2R.distanceKm}km away</span>}
              </div>
            )}
          </div>

          {/* Active order card */}
          {!isMotari && hasActiveOrder && (
            <div style={{ margin: '14px 16px 0', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '12px', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <AlertCircle size={18} color="var(--red)" style={{ flexShrink: 0 }} />
              <div>
                <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--red)' }}>You have an active order in progress</p>
                <p style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>You cannot place a new order until your current delivery is completed.</p>
              </div>
            </div>
          )}

          {activeOrder && (
            <div style={{ margin: '14px 16px 0', background: 'var(--bg2)', border: `2px solid ${STATUS_COLOR(activeOrder.status)}44`, borderRadius: '16px', overflow: 'hidden' }}>
              <div style={{ background: `${STATUS_COLOR(activeOrder.status)}14`, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${STATUS_COLOR(activeOrder.status)}22` }}>
                <div>
                  <p style={{ fontWeight: 800, fontSize: '15px', color: STATUS_COLOR(activeOrder.status) }}>{STATUS_LABEL(activeOrder.status)}</p>
                  <p style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px', fontFamily: 'monospace' }}>#{activeOrder.id.slice(0, 8)}</p>
                </div>
                <p style={{ fontWeight: 800, fontSize: '18px', color: 'var(--yellow)' }}>{(activeOrder.predicted_price || 0).toLocaleString()} RWF</p>
              </div>
              <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '10px', padding: '10px' }}>
                    <p style={{ fontSize: '10px', color: '#f59e0b', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>📤 Sender</p>
                    <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>{activeOrder.sender_name}</p>
                    <p style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>📞 {activeOrder.sender_number}</p>
                    <p style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '1px' }}>📍 {activeOrder.sender_location}</p>
                    {activeOrder.sender_number && <a href={`tel:${activeOrder.sender_number}`} style={{ display: 'inline-block', marginTop: '6px', background: 'rgba(245,158,11,0.15)', borderRadius: '6px', padding: '4px 10px', fontSize: '11px', fontWeight: 700, color: '#f59e0b', textDecoration: 'none' }}>📞 Call</a>}
                  </div>
                  <div style={{ background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '10px', padding: '10px' }}>
                    <p style={{ fontSize: '10px', color: '#22c55e', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>📥 Receiver</p>
                    <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>{activeOrder.receiver_name}</p>
                    <p style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>📞 {activeOrder.receiver_number}</p>
                    <p style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '1px' }}>📍 {activeOrder.receiver_location}</p>
                    {activeOrder.receiver_number && <a href={`tel:${activeOrder.receiver_number}`} style={{ display: 'inline-block', marginTop: '6px', background: 'rgba(34,197,94,0.15)', borderRadius: '6px', padding: '4px 10px', fontSize: '11px', fontWeight: 700, color: '#22c55e', textDecoration: 'none' }}>📞 Call</a>}
                  </div>
                </div>

                {/* Timeline */}
                <div style={{ background: 'var(--bg3)', borderRadius: '10px', padding: '12px' }}>
                  <p style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: 700, marginBottom: '10px', textTransform: 'uppercase' }}>Delivery Timeline</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {getTimeline(activeOrder).map((step, i) => (
                      <div key={step.key} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: step.done ? 'rgba(34,197,94,0.15)' : 'rgba(128,128,128,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', flexShrink: 0, border: `1px solid ${step.done ? 'rgba(34,197,94,0.3)' : 'rgba(128,128,128,0.2)'}` }}>
                          {step.icon}
                        </div>
                        <span style={{ fontSize: '13px', fontWeight: step.done ? 700 : 400, color: step.done ? 'var(--text)' : 'var(--text3)' }}>{step.label}</span>
                        {step.done && <CheckCircle size={12} color="#22c55e" style={{ marginLeft: 'auto' }} />}
                      </div>
                    ))}
                  </div>
                </div>

                {!isMotari && activeOrder.driver_name && (
                  <div style={{ background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '10px', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '26px' }}>🏍️</span>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: '10px', color: '#3b82f6', fontWeight: 700, textTransform: 'uppercase', marginBottom: '3px' }}>Your Motari</p>
                      <p style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text)' }}>{activeOrder.driver_name}</p>
                      <p style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>{activeOrder.driver_phone}{activeOrder.driver_plate && ` · 🪪 ${activeOrder.driver_plate}`}</p>
                    </div>
                    {activeOrder.driver_phone && <a href={`tel:${activeOrder.driver_phone}`} style={{ background: 'rgba(59,130,246,0.15)', borderRadius: '10px', padding: '10px', textDecoration: 'none', fontSize: '18px', flexShrink: 0 }}>📞</a>}
                  </div>
                )}

                {activeOrder.status === 'in_transit' && (
                  <div style={{ background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: '10px', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div className="spinner" style={{ width: '14px', height: '14px', borderWidth: '2px', flexShrink: 0 }} />
                    <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--blue)' }}>🚀 Package on the way — motari tracked live on map above</p>
                  </div>
                )}
                {activeOrder.status === 'delivered' && (
                  <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: '10px', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <CheckCircle size={16} color="var(--green)" />
                    <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--green)' }}>Delivered successfully! 🎉</p>
                  </div>
                )}

                {!activeOrder.sender_paid && activeOrder.sender_id === profile?.id && ['accepted','awaiting_payment'].includes(activeOrder.status) && (
                  <div>
                    {payStatus[activeOrder.id] === 'pending' || payStatus[activeOrder.id] === 'requesting' ? (
                      <div style={{ padding: '13px', background: 'var(--bg3)', borderRadius: '10px', textAlign: 'center' }}>
                        <div className="spinner" style={{ width: '16px', height: '16px', margin: '0 auto 6px' }} />
                        <p style={{ fontSize: '13px', fontWeight: 700 }}>{payStatus[activeOrder.id] === 'requesting' ? '⏳ Connecting to MoMo…' : '📱 Check your phone!'}</p>
                      </div>
                    ) : (
                      <button onClick={() => handlePay(activeOrder.id)} disabled={payingId === activeOrder.id} style={{ width: '100%', padding: '14px', background: 'var(--yellow)', border: 'none', borderRadius: '10px', fontWeight: 800, fontSize: '15px', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', color: '#0a0a0a' }}>
                        📱 Pay {(activeOrder.predicted_price || 0).toLocaleString()} RWF with MoMo
                      </button>
                    )}
                    {payStatus[activeOrder.id] === 'failed'  && <p style={{ fontSize: '11px', color: 'var(--red)', textAlign: 'center', marginTop: '6px' }}>❌ Payment failed. Try again.</p>}
                    {payStatus[activeOrder.id] === 'timeout' && <p style={{ fontSize: '11px', color: 'var(--red)', textAlign: 'center', marginTop: '6px' }}>⏰ Timed out. Try again.</p>}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════ DELIVERIES TAB ══════════ */}
      {activeTab === 'deliveries' && (
        <div style={{ padding: '14px 16px 100px' }}>

          {/* Search + Filter bar */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <Search size={13} color="var(--text3)" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search orders, names, locations…" className="eg-input" style={{ paddingLeft: '30px', fontSize: '13px' }} />
            </div>
            <button onClick={() => setShowFilters(!showFilters)} style={{ padding: '0 12px', borderRadius: '10px', border: '1px solid var(--border2)', background: showFilters ? 'var(--yellow)' : 'var(--bg3)', cursor: 'pointer', color: showFilters ? '#0a0a0a' : 'var(--text3)', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 700, fontSize: '12px', fontFamily: 'Space Grotesk, sans-serif' }}>
              <Filter size={13} /> Filters
            </button>
          </div>

          {showFilters && (
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px', marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', marginBottom: '6px' }}>STATUS</p>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {['all','awaiting_payment','pending','accepted','in_transit','delivered'].map(s => (
                    <button key={s} onClick={() => setFilterStatus(s)} style={{ padding: '4px 10px', borderRadius: '20px', border: 'none', cursor: 'pointer', fontSize: '11px', fontWeight: 700, background: filterStatus === s ? 'var(--yellow)' : 'var(--bg3)', color: filterStatus === s ? '#0a0a0a' : 'var(--text3)', fontFamily: 'Space Grotesk, sans-serif' }}>
                      {s === 'all' ? 'All' : STATUS_LABEL(s)}
                    </button>
                  ))}
                </div>
              </div>
              {uniqueDrivers.length > 0 && (
                <div>
                  <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', marginBottom: '6px' }}>DRIVER</p>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {['all', ...uniqueDrivers].map(d => (
                      <button key={d} onClick={() => setFilterDriver(d)} style={{ padding: '4px 10px', borderRadius: '20px', border: 'none', cursor: 'pointer', fontSize: '11px', fontWeight: 700, background: filterDriver === d ? 'var(--yellow)' : 'var(--bg3)', color: filterDriver === d ? '#0a0a0a' : 'var(--text3)', fontFamily: 'Space Grotesk, sans-serif' }}>
                        {d === 'all' ? 'All Drivers' : d}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Delay alerts */}
          {stats.delayed > 0 && (
            <div style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '12px', padding: '10px 14px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertCircle size={16} color="var(--red)" />
              <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--red)' }}>⚠️ {stats.delayed} delayed order{stats.delayed > 1 ? 's' : ''} detected!</p>
            </div>
          )}

          {filteredOrders.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text3)' }}>
              <Package size={36} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
              <p style={{ fontWeight: 600, fontSize: '15px' }}>No orders found</p>
            </div>
          ) : filteredOrders.map(order => {
            const sc = STATUS_COLOR(order.status);
            const isDelayed = (() => { const age = (Date.now() - new Date(order.created_at).getTime()) / 60000; return ['pending','accepted'].includes(order.status) && age > 60; })();
            const expanded = selectedOrder?.id === order.id;
            return (
              <div key={order.id} style={{ background: 'var(--bg2)', border: `1px solid ${isDelayed ? 'rgba(239,68,68,0.4)' : 'var(--border)'}`, borderRadius: '12px', marginBottom: '10px', overflow: 'hidden' }}>
                <div onClick={() => setSelectedOrder(expanded ? null : order)} style={{ padding: '12px 14px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--text3)' }}>#{order.id.slice(0, 8)}</span>
                      <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px', background: `${sc}18`, color: sc, border: `1px solid ${sc}44` }}>{STATUS_LABEL(order.status)}</span>
                      {isDelayed && <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--red)', background: 'rgba(239,68,68,0.1)', padding: '2px 6px', borderRadius: '10px' }}>⚠️ DELAYED</span>}
                    </div>
                    <p style={{ fontSize: '12px', color: 'var(--text3)' }}>📤 {order.sender_name} → 📥 {order.receiver_name}</p>
                    <p style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}><MapPin size={10} style={{ display: 'inline' }} /> {order.sender_location} → {order.receiver_location}</p>
                    {order.driver_name && <p style={{ fontSize: '11px', color: '#3b82f6', marginTop: '2px' }}>🏍️ {order.driver_name}</p>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', marginLeft: '10px' }}>
                    <p style={{ fontWeight: 800, fontSize: '14px', color: 'var(--yellow)' }}>{(order.predicted_price || 0).toLocaleString()} RWF</p>
                    {expanded ? <ChevronUp size={14} color="var(--text3)" /> : <ChevronDown size={14} color="var(--text3)" />}
                  </div>
                </div>

                {expanded && (
                  <div style={{ padding: '0 14px 14px', borderTop: '1px solid var(--border)', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {/* Timeline */}
                    <div style={{ background: 'var(--bg3)', borderRadius: '10px', padding: '10px' }}>
                      <p style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text3)', marginBottom: '8px', textTransform: 'uppercase' }}>Timeline</p>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        {getTimeline(order).map((step, i) => (
                          <div key={step.key} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: step.done ? 'rgba(34,197,94,0.2)' : 'rgba(128,128,128,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', border: `1px solid ${step.done ? 'rgba(34,197,94,0.4)' : 'rgba(128,128,128,0.2)'}` }} title={step.label}>
                              {step.icon}
                            </div>
                            {i < 4 && <div style={{ width: '14px', height: '2px', background: step.done ? '#22c55e' : 'var(--border)', borderRadius: '2px' }} />}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Contact buttons */}
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {order.sender_number && (
                        <a href={`tel:${order.sender_number}`} style={{ flex: 1, padding: '8px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '8px', textAlign: 'center', fontSize: '12px', fontWeight: 700, color: '#f59e0b', textDecoration: 'none' }}>
                          📞 Call Sender
                        </a>
                      )}
                      {order.receiver_number && (
                        <a href={`tel:${order.receiver_number}`} style={{ flex: 1, padding: '8px', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '8px', textAlign: 'center', fontSize: '12px', fontWeight: 700, color: '#22c55e', textDecoration: 'none' }}>
                          📞 Call Receiver
                        </a>
                      )}
                    </div>

                    <p style={{ fontSize: '10px', color: 'var(--text3)', textAlign: 'center' }}>
                      <Clock size={10} style={{ display: 'inline' }} /> {new Date(order.created_at).toLocaleString()}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ══════════ DRIVERS TAB ══════════ */}
      {activeTab === 'drivers' && (
        <div style={{ padding: '14px 16px 100px' }}>
          <h2 style={{ fontWeight: 800, fontSize: '17px', color: 'var(--text)', marginBottom: '14px' }}>🏍️ Driver Status</h2>
          {drivers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text3)' }}>
              <Truck size={36} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
              <p style={{ fontWeight: 600 }}>No drivers registered</p>
            </div>
          ) : drivers.map(driver => {
            const driverOrders = orders.filter(o => o.driver_name === driver.profiles?.full_name);
            const activeCount  = driverOrders.filter(o => ['accepted','in_transit'].includes(o.status)).length;
            const isOnline     = driver.latitude && driver.longitude;
            return (
              <div key={driver.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'rgba(245,197,24,0.15)', border: '2px solid rgba(245,197,24,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', flexShrink: 0 }}>🏍️</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                      <p style={{ fontWeight: 800, fontSize: '14px', color: 'var(--text)' }}>{driver.profiles?.full_name || 'Unknown Driver'}</p>
                      <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '10px', background: isOnline ? 'rgba(34,197,94,0.15)' : 'rgba(128,128,128,0.1)', color: isOnline ? '#22c55e' : 'var(--text3)' }}>
                        {isOnline ? '🟢 Online' : '⚫ Offline'}
                      </span>
                    </div>
                    <p style={{ fontSize: '12px', color: 'var(--text3)' }}>📞 {driver.profiles?.phone_number || '—'}</p>
                    {driver.plate_number && <p style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '1px' }}>🪪 {driver.plate_number}</p>}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: '20px', fontWeight: 800, color: activeCount > 0 ? 'var(--yellow)' : 'var(--text3)' }}>{activeCount}</p>
                    <p style={{ fontSize: '10px', color: 'var(--text3)' }}>active</p>
                  </div>
                </div>
                {driver.profiles?.phone_number && (
                  <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                    <a href={`tel:${driver.profiles.phone_number}`} style={{ flex: 1, padding: '8px', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: '8px', textAlign: 'center', fontSize: '12px', fontWeight: 700, color: '#3b82f6', textDecoration: 'none' }}>
                      📞 Call
                    </a>
                    <a href={`sms:${driver.profiles.phone_number}`} style={{ flex: 1, padding: '8px', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '8px', textAlign: 'center', fontSize: '12px', fontWeight: 700, color: '#22c55e', textDecoration: 'none' }}>
                      💬 Message
                    </a>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ══════════ STATS TAB ══════════ */}
      {activeTab === 'stats' && (
        <div style={{ padding: '14px 16px 100px' }}>
          <h2 style={{ fontWeight: 800, fontSize: '17px', color: 'var(--text)', marginBottom: '14px' }}>📊 Performance</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px' }}>
            {[
              { label: 'Active Deliveries', value: stats.active,    icon: '🚀', color: '#3b82f6' },
              { label: 'Delivered Today',   value: stats.delivered, icon: '✅', color: '#22c55e' },
              { label: 'Delayed Orders',    value: stats.delayed,   icon: '⚠️', color: stats.delayed > 0 ? '#ef4444' : '#22c55e' },
              { label: 'Avg Delivery Time', value: stats.avgTime > 0 ? `${stats.avgTime}m` : '—', icon: '⏱️', color: '#f59e0b' },
            ].map(s => (
              <div key={s.label} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '14px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '22px' }}>{s.icon}</span>
                <p style={{ fontSize: '26px', fontWeight: 900, color: s.color }}>{s.value}</p>
                <p style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: 600 }}>{s.label}</p>
              </div>
            ))}
          </div>

          {/* Status breakdown */}
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '14px', padding: '16px' }}>
            <p style={{ fontWeight: 800, fontSize: '14px', marginBottom: '12px' }}>Orders by Status</p>
            {['awaiting_payment','pending','accepted','in_transit','delivered'].map(s => {
              const count = orders.filter(o => o.status === s).length;
              const pct   = orders.length ? Math.round(count / orders.length * 100) : 0;
              return (
                <div key={s} style={{ marginBottom: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>{STATUS_LABEL(s)}</span>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: STATUS_COLOR(s) }}>{count}</span>
                  </div>
                  <div style={{ height: '6px', background: 'var(--bg3)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: STATUS_COLOR(s), borderRadius: '4px', transition: 'width .5s' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}