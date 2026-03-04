import { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Package, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

// ── Fix Leaflet default icon bug ─────────────────────────────────────────
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// ── Reject clearly wrong GPS (e.g. Dublin WiFi triangulation) ────────────
function isClearlyWrong(lat: number, lng: number) {
  return lat > 15 || lat < -20 || lng < 20 || lng > 52;
}

// ── Live pulsing blue dot for current user ───────────────────────────────
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

// ── Colored pin markers ──────────────────────────────────────────────────
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

// ── Map styles ───────────────────────────────────────────────────────────
const MAP_STYLES = [
  { label: '🗺️ Street',    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '© OpenStreetMap' },
  { label: '🛰️ Satellite', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution: '© Esri' },
  { label: '🌙 Dark',      url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', attribution: '© CARTO' },
];

const KIGALI: [number, number] = [-1.9441, 30.0619];

// ── Smoothly follows the user position ──────────────────────────────────
function MapFollower({ pos }: { pos: [number, number] }) {
  const map = useMap();
  useEffect(() => { map.setView(pos, map.getZoom(), { animate: true }); }, [pos[0], pos[1]]);
  return null;
}

// ── Auto-fits map to show all markers ───────────────────────────────────
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

// ── OSRM road-based routing ──────────────────────────────────────────────
async function fetchRoute(from: [number, number], to: [number, number]) {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`;
    const res  = await fetch(url);
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

// ── Geocode address string as last resort ────────────────────────────────
async function geocode(loc: string, district?: string): Promise<[number, number] | null> {
  if (!loc?.trim()) return null;
  try {
    const q   = encodeURIComponent([loc.trim(), district, 'Rwanda'].filter(Boolean).join(', '));
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&countrycodes=rw`,
      { headers: { 'Accept-Language': 'en', 'User-Agent': 'EasyGO/1.0' } }
    );
    const d = await res.json();
    return d.length ? [parseFloat(d[0].lat), parseFloat(d[0].lon)] : null;
  } catch { return null; }
}

// ── Status helpers ───────────────────────────────────────────────────────
const STATUS_COLOR = (s: string) =>
  s === 'delivered'        ? '#22c55e' :
  s === 'in_transit'       ? '#3b82f6' :
  s === 'accepted'         ? '#8b5cf6' :
  s === 'pending'          ? '#22c55e' :
  s === 'awaiting_payment' ? '#f59e0b' : '#6b7280';

const STATUS_LABEL = (s: string) =>
  s === 'awaiting_payment' ? '⏳ Awaiting Payment'    :
  s === 'pending'          ? '✅ Paid — Finding Driver' :
  s === 'accepted'         ? '🏍️ Driver Assigned'     :
  s === 'in_transit'       ? '🚀 On The Way!'          :
  s === 'delivered'        ? '✅ Delivered'             : s;

// ── Types ────────────────────────────────────────────────────────────────
interface EnrichedOrder {
  id: string;
  sender_id: string;
  receiver_id: string | null;
  receiver_number: string;
  sender_name: string;
  sender_number: string;
  receiver_name: string;
  sender_location: string;
  receiver_location: string;
  sender_district?: string;
  receiver_district?: string;
  package_size: string;
  package_weight: string;
  predicted_price: number;
  status: string;
  sender_paid: boolean;
  created_at: string;
  is_fragile?: boolean;
  delivery_speed?: string;
  delivery_note?: string;
  drivers: any;
  senderPos:    [number, number] | null;
  receiverPos:  [number, number] | null;
  driverPos:    [number, number] | null;
  driver_name?:  string;
  driver_phone?: string;
  driver_plate?: string;
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════════════════
export function TrackTab() {
  const { profile } = useAuth();

  // ── Live GPS ──
  const [myLocation,   setMyLocation]   = useState<[number, number] | null>(null);
  const [locationName, setLocationName] = useState('Getting location…');
  const [accuracy,     setAccuracy]     = useState<number | null>(null);
  const watchRef = useRef<number | null>(null);

  // ── Map UI ──
  const [mapStyle,   setMapStyle]   = useState(0);
  const [showPicker, setShowPicker] = useState(false);

  // ── Orders ──
  const [orders,    setOrders]    = useState<EnrichedOrder[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [payStatus, setPayStatus] = useState<Record<string, string>>({});
  const [payingId,  setPayingId]  = useState<string | null>(null);

  // ── Active order routes on map ──
  const [routeD2S, setRouteD2S] = useState<any>(null);
  const [routeD2R, setRouteD2R] = useState<any>(null);
  const [routeS2R, setRouteS2R] = useState<any>(null);

  const isDriver = (profile as any)?.user_category === 'motari' || profile?.role === 'driver';

  // ────────────────────────────────────────────────────────────────────────
  // 1. GPS — exact same pattern as HomeTab
  // ────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!navigator.geolocation) { setLocationName('GPS not supported'); return; }

    // Fast first fix
    navigator.geolocation.getCurrentPosition(
      pos => handlePosition(pos), () => {},
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
    );
    // High-accuracy continuous watch
    watchRef.current = navigator.geolocation.watchPosition(
      pos => handlePosition(pos), () => {},
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
    );
    return () => {
      if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    };
  }, []);

  function handlePosition(pos: GeolocationPosition) {
    const { latitude, longitude, accuracy: acc } = pos.coords;
    if (isClearlyWrong(latitude, longitude)) return;
    setMyLocation([latitude, longitude]);
    setAccuracy(Math.round(acc));
    reverseGeocode(latitude, longitude);
    // Push live position to DB so others can see us
    if (profile?.id) {
      supabase.from('profiles').update({ latitude, longitude }).eq('id', profile.id).then(() => {});
    }
  }

  async function reverseGeocode(lat: number, lng: number) {
    try {
      const res  = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
      const data = await res.json();
      const parts = [
        data.address?.suburb || data.address?.neighbourhood || data.address?.quarter,
        data.address?.city   || data.address?.town,
      ].filter(Boolean);
      setLocationName(parts.join(', ') || 'Rwanda');
    } catch { setLocationName(`${lat.toFixed(4)}, ${lng.toFixed(4)}`); }
  }

  // ────────────────────────────────────────────────────────────────────────
  // 2. Load orders + realtime subscription + 3-second driver GPS poll
  // ────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!profile?.id) return;
    loadOrders();

    const ch = supabase.channel('tracktab-v2')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => loadOrders())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'drivers' }, () => loadOrders())
      .subscribe();

    // Poll driver positions every 3s for live movement
    const poll = setInterval(() => loadOrders(), 3000);

    return () => { supabase.removeChannel(ch); clearInterval(poll); };
  }, [profile?.id, myLocation?.[0], myLocation?.[1]]);

  // ────────────────────────────────────────────────────────────────────────
  // 3. Enrich orders with live GPS positions
  // ────────────────────────────────────────────────────────────────────────
  async function loadOrders() {
    if (!profile?.id) return;

    let query = supabase
      .from('orders')
      .select(`*, drivers:driver_id(id, latitude, longitude, plate_number, profiles:user_id(full_name, phone_number))`)
      .order('created_at', { ascending: false });

    if (isDriver) {
      const { data: dr } = await supabase.from('drivers').select('id').eq('user_id', profile.id).maybeSingle();
      if (dr) query = query.eq('driver_id', dr.id);
    } else {
      query = query.or(`sender_id.eq.${profile.id},receiver_id.eq.${profile.id}`);
    }

    const { data } = await query;
    if (!data) { setLoading(false); return; }

    const enriched: EnrichedOrder[] = await Promise.all(data.map(async (o: any) => {

      // ── Sender position ─────────────────────────────────────────────
      let senderPos: [number, number] | null = null;
      if (o.sender_id === profile.id && myLocation) {
        senderPos = myLocation;                          // I AM the sender — use my live GPS
      } else if (o.sender_lat && o.sender_lng) {
        senderPos = [o.sender_lat, o.sender_lng];        // saved at order creation
      } else {
        const { data: sp } = await supabase.from('profiles').select('latitude,longitude').eq('id', o.sender_id).maybeSingle();
        if (sp?.latitude && sp?.longitude) senderPos = [sp.latitude, sp.longitude];
        else senderPos = await geocode(o.sender_location, o.sender_district);
      }

      // ── Receiver position ───────────────────────────────────────────
      let receiverPos: [number, number] | null = null;
      const isMe = o.receiver_id === profile.id || o.receiver_number === (profile as any).phone_number;
      if (isMe && myLocation) {
        receiverPos = myLocation;                        // I AM the receiver — use my live GPS
      } else if (o.receiver_lat && o.receiver_lng) {
        receiverPos = [o.receiver_lat, o.receiver_lng];
      } else if (o.receiver_id) {
        const { data: rp } = await supabase.from('profiles').select('latitude,longitude').eq('id', o.receiver_id).maybeSingle();
        if (rp?.latitude && rp?.longitude) receiverPos = [rp.latitude, rp.longitude];
        else receiverPos = await geocode(o.receiver_location, o.receiver_district);
      } else {
        receiverPos = await geocode(o.receiver_location, o.receiver_district);
      }

      // ── Driver position — always from drivers table (updated every 3s by DriverTab) ──
      let driverPos: [number, number] | null = null;
      if (o.drivers?.latitude && o.drivers?.longitude) {
        driverPos = [o.drivers.latitude, o.drivers.longitude];
      }

      return {
        ...o,
        senderPos, receiverPos, driverPos,
        driver_name:  o.drivers?.profiles?.full_name    ?? null,
        driver_phone: o.drivers?.profiles?.phone_number ?? null,
        driver_plate: o.drivers?.plate_number           ?? null,
      };
    }));

    setOrders(enriched);
    setLoading(false);

    // Compute routes for the most active order on main map
    const active = enriched.find(o => ['accepted', 'paid', 'in_transit'].includes(o.status));
    if (active?.driverPos) {
      const [d2s, d2r, s2r] = await Promise.all([
        active.senderPos   ? fetchRoute(active.driverPos, active.senderPos)   : null,
        active.receiverPos ? fetchRoute(active.driverPos, active.receiverPos) : null,
        active.senderPos && active.receiverPos ? fetchRoute(active.senderPos, active.receiverPos) : null,
      ]);
      setRouteD2S(d2s); setRouteD2R(d2r); setRouteS2R(s2r);
    } else {
      setRouteD2S(null); setRouteD2R(null); setRouteS2R(null);
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // 4. MoMo payment
  // ────────────────────────────────────────────────────────────────────────
  async function handlePay(orderId: string) {
    const order = orders.find(o => o.id === orderId);
    if (!order || !profile) return;
    setPayingId(orderId);
    setPayStatus(s => ({ ...s, [orderId]: 'requesting' }));
    try {
      const { data, error } = await supabase.functions.invoke('request-payment', {
        body: { orderId, amount: order.predicted_price, phoneNumber: (profile as any).phone_number, payerName: profile.full_name },
      });
      if (error || !data?.success) throw new Error('Failed');
      setPayStatus(s => ({ ...s, [orderId]: 'pending' }));
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        if (attempts > 24) { clearInterval(poll); setPayStatus(s => ({ ...s, [orderId]: 'timeout' })); setPayingId(null); return; }
        const { data: chk } = await supabase.functions.invoke('check-payment', { body: { paymentId: data.paymentId, orderId } });
        if (chk?.status === 'SUCCESSFUL') { clearInterval(poll); setPayStatus(s => ({ ...s, [orderId]: 'paid' })); setPayingId(null); loadOrders(); }
        else if (chk?.status === 'FAILED') { clearInterval(poll); setPayStatus(s => ({ ...s, [orderId]: 'failed' })); setPayingId(null); }
      }, 5000);
    } catch { setPayStatus(s => ({ ...s, [orderId]: 'failed' })); setPayingId(null); }
  }

  // ────────────────────────────────────────────────────────────────────────
  // Derived state
  // ────────────────────────────────────────────────────────────────────────
  const activeOrder = orders.find(o => ['accepted', 'paid', 'in_transit'].includes(o.status));

  // Block new orders if there's an undelivered active order
  const hasActiveOrder = orders.some(o =>
    ['awaiting_payment', 'pending', 'accepted', 'in_transit'].includes(o.status)
  );

  // All map markers for bounds fitting
  const allMapPositions: [number, number][] = [
    ...(myLocation ? [myLocation] : []),
    ...(activeOrder?.driverPos   ? [activeOrder.driverPos]   : []),
    ...(activeOrder?.senderPos   && activeOrder.sender_id !== profile?.id  ? [activeOrder.senderPos]   : []),
    ...(activeOrder?.receiverPos && activeOrder.receiver_id !== profile?.id ? [activeOrder.receiverPos] : []),
  ];

  const mapCenter: [number, number] = myLocation ?? KIGALI;

  // ────────────────────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>

      <style>{`
        @keyframes tt-ripple {
          0%   { transform:scale(1); opacity:0.6; }
          100% { transform:scale(2.8); opacity:0; }
        }
        @keyframes tt-dot {
          0%,100% { opacity:1; transform:scale(1); }
          50%     { opacity:.4; transform:scale(.65); }
        }
      `}</style>

      {/* ══════════════════════════════════════════════════════════════
          MAIN LIVE MAP — always visible the moment tab opens
      ══════════════════════════════════════════════════════════════ */}
      <div style={{ position: 'relative', height: '340px', width: '100%' }}>
        <MapContainer
          center={mapCenter}
          zoom={myLocation ? 15 : 13}
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
          scrollWheelZoom={true}
          attributionControl={false}
        >
          <TileLayer url={MAP_STYLES[mapStyle].url} attribution={MAP_STYLES[mapStyle].attribution} maxZoom={19} />

          {/* Follow user when no active order on map */}
          {myLocation && !activeOrder?.driverPos && <MapFollower pos={myLocation} />}

          {/* Fit all markers when there's an active order */}
          {allMapPositions.length >= 2 && <MapBounds positions={allMapPositions} />}

          {/* ── Route lines ── */}
          {/* Driver → Sender (dashed yellow, before pickup) */}
          {routeD2S?.points && activeOrder?.status !== 'in_transit' && (
            <Polyline positions={routeD2S.points} color="#f59e0b" weight={4} opacity={0.8} dashArray="9 6" />
          )}
          {/* Driver → Receiver (solid blue, during transit) */}
          {routeD2R?.points && activeOrder?.status === 'in_transit' && (
            <Polyline positions={routeD2R.points} color="#3b82f6" weight={5} opacity={0.85} />
          )}
          {/* Sender → Receiver (dashed green, always) */}
          {routeS2R?.points && (
            <Polyline positions={routeS2R.points} color="#22c55e" weight={3} opacity={0.4} dashArray="5 6" />
          )}

          {/* ── MY location (pulsing blue dot) ── */}
          {myLocation && (
            <Marker position={myLocation} icon={meIcon}>
              <Popup>
                <div style={{ fontFamily: 'Space Grotesk, sans-serif', minWidth: '150px' }}>
                  <p style={{ fontWeight: 800, fontSize: '13px', marginBottom: '4px' }}>📍 You are here</p>
                  <p style={{ fontSize: '12px', color: '#555' }}>{locationName}</p>
                  {accuracy && <p style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>GPS ±{accuracy}m</p>}
                </div>
              </Popup>
            </Marker>
          )}

          {/* ── DRIVER marker — with full info popup ── */}
          {activeOrder?.driverPos && (
            <Marker position={activeOrder.driverPos} icon={driverIcon}>
              <Popup>
                <div style={{ fontFamily: 'Space Grotesk, sans-serif', minWidth: '170px' }}>
                  <p style={{ fontWeight: 800, fontSize: '14px', marginBottom: '6px' }}>🏍️ Motari</p>
                  <p style={{ fontSize: '13px', fontWeight: 700 }}>{activeOrder.driver_name || 'Driver'}</p>
                  {activeOrder.driver_phone && (
                    <p style={{ fontSize: '12px', color: '#555', marginTop: '3px' }}>
                      📞 <a href={`tel:${activeOrder.driver_phone}`} style={{ color: '#2563eb' }}>{activeOrder.driver_phone}</a>
                    </p>
                  )}
                  {activeOrder.driver_plate && (
                    <p style={{ fontSize: '12px', color: '#555', marginTop: '2px' }}>🚗 {activeOrder.driver_plate}</p>
                  )}
                  {routeD2S && activeOrder.status !== 'in_transit' && (
                    <p style={{ fontSize: '11px', color: '#f59e0b', fontWeight: 700, marginTop: '6px' }}>
                      {routeD2S.distanceKm} km · ~{routeD2S.durationMin} min to pickup
                    </p>
                  )}
                  {routeD2R && activeOrder.status === 'in_transit' && (
                    <p style={{ fontSize: '11px', color: '#3b82f6', fontWeight: 700, marginTop: '6px' }}>
                      {routeD2R.distanceKm} km · ~{routeD2R.durationMin} min ETA
                    </p>
                  )}
                </div>
              </Popup>
            </Marker>
          )}

          {/* ── SENDER marker — with full info popup ── */}
          {activeOrder?.senderPos && activeOrder.sender_id !== profile?.id && (
            <Marker position={activeOrder.senderPos} icon={senderIcon}>
              <Popup>
                <div style={{ fontFamily: 'Space Grotesk, sans-serif', minWidth: '160px' }}>
                  <p style={{ fontWeight: 800, fontSize: '14px', marginBottom: '6px' }}>📤 Sender</p>
                  <p style={{ fontSize: '13px', fontWeight: 700 }}>{activeOrder.sender_name}</p>
                  <p style={{ fontSize: '12px', color: '#555', marginTop: '2px' }}>📞 {activeOrder.sender_number}</p>
                  <p style={{ fontSize: '12px', color: '#555', marginTop: '2px' }}>📍 {activeOrder.sender_location}</p>
                </div>
              </Popup>
            </Marker>
          )}

          {/* ── RECEIVER marker — with full info popup ── */}
          {activeOrder?.receiverPos && activeOrder.receiver_id !== profile?.id && (
            <Marker position={activeOrder.receiverPos} icon={receiverIcon}>
              <Popup>
                <div style={{ fontFamily: 'Space Grotesk, sans-serif', minWidth: '160px' }}>
                  <p style={{ fontWeight: 800, fontSize: '14px', marginBottom: '6px' }}>📥 Receiver</p>
                  <p style={{ fontSize: '13px', fontWeight: 700 }}>{activeOrder.receiver_name}</p>
                  <p style={{ fontSize: '12px', color: '#555', marginTop: '2px' }}>📞 {activeOrder.receiver_number}</p>
                  <p style={{ fontSize: '12px', color: '#555', marginTop: '2px' }}>📍 {activeOrder.receiver_location}</p>
                </div>
              </Popup>
            </Marker>
          )}
        </MapContainer>

        {/* LIVE GPS badge */}
        <div style={{
          position: 'absolute', top: '12px', left: '12px', zIndex: 999,
          background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)',
          borderRadius: '20px', padding: '5px 12px',
          display: 'flex', alignItems: 'center', gap: '6px',
          border: `1px solid ${myLocation ? 'rgba(34,197,94,0.4)' : 'rgba(245,158,11,0.4)'}`,
          boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
        }}>
          <div style={{
            width: '7px', height: '7px', borderRadius: '50%',
            background: myLocation ? '#22c55e' : '#f59e0b',
            animation: 'tt-dot 1.6s ease infinite',
          }} />
          <span style={{ fontSize: '11px', color: '#111', fontWeight: 700, letterSpacing: '.06em' }}>
            {myLocation ? 'LIVE GPS' : 'LOCATING…'}
          </span>
        </div>

        {/* Map style picker */}
        <div style={{ position: 'absolute', top: '12px', right: '12px', zIndex: 999 }}>
          <button
            onClick={() => setShowPicker(!showPicker)}
            style={{
              background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)',
              border: '1px solid rgba(0,0,0,0.15)', borderRadius: '10px',
              padding: '6px 12px', cursor: 'pointer', fontSize: '12px',
              fontWeight: 700, fontFamily: 'Space Grotesk, sans-serif',
              boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
            }}
          >
            {MAP_STYLES[mapStyle].label} ▾
          </button>
          {showPicker && (
            <div style={{
              position: 'absolute', top: '38px', right: 0,
              background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(12px)',
              border: '1px solid rgba(0,0,0,0.12)', borderRadius: '12px',
              padding: '6px', minWidth: '145px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
              display: 'flex', flexDirection: 'column', gap: '3px', zIndex: 9999,
            }}>
              {MAP_STYLES.map((s, i) => (
                <button key={s.label} onClick={() => { setMapStyle(i); setShowPicker(false); }} style={{
                  background: mapStyle === i ? '#f5c518' : 'transparent',
                  border: 'none', borderRadius: '8px', padding: '8px 12px',
                  cursor: 'pointer', fontSize: '12px', fontWeight: 700,
                  color: mapStyle === i ? '#0a0a0a' : '#333',
                  textAlign: 'left', width: '100%',
                }}>
                  {s.label} {mapStyle === i && '✓'}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Location name pill */}
        <div style={{
          position: 'absolute', bottom: '12px', left: '50%', transform: 'translateX(-50%)',
          zIndex: 999, background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)',
          borderRadius: '20px', padding: '6px 16px',
          display: 'flex', alignItems: 'center', gap: '6px',
          border: '1px solid rgba(0,0,0,0.1)', boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
          whiteSpace: 'nowrap', maxWidth: '85%',
        }}>
          <MapPin size={11} color="#f5c518" />
          <span style={{ fontSize: '12px', color: '#111', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {locationName}
          </span>
          {accuracy && (
            <span style={{
              fontSize: '10px', padding: '2px 6px', borderRadius: '10px', fontWeight: 600,
              background: accuracy < 30 ? 'rgba(34,197,94,0.1)' : 'rgba(245,197,24,0.1)',
              color:      accuracy < 30 ? '#16a34a' : '#ca8a04',
            }}>
              ±{accuracy}m
            </span>
          )}
        </div>

        {/* ETA bar over map bottom — when motari is moving */}
        {activeOrder?.driverPos && (routeD2S || routeD2R) && (
          <div style={{
            position: 'absolute', bottom: '48px', left: '12px', right: '12px',
            zIndex: 998, background: 'rgba(0,0,0,0.72)', borderRadius: '10px',
            padding: '7px 14px', display: 'flex', gap: '16px', flexWrap: 'wrap',
          }}>
            {routeD2S && activeOrder.status !== 'in_transit' && (
              <span style={{ color: '#f59e0b', fontWeight: 700, fontSize: '12px' }}>
                🏍️ → 📤 {routeD2S.distanceKm} km · {routeD2S.durationMin} min to you
              </span>
            )}
            {routeD2R && activeOrder.status === 'in_transit' && (
              <span style={{ color: '#60a5fa', fontWeight: 700, fontSize: '12px' }}>
                🏍️ → 📥 {routeD2R.distanceKm} km · ~{routeD2R.durationMin} min ETA
              </span>
            )}
            {routeS2R && (
              <span style={{ color: '#4ade80', fontWeight: 700, fontSize: '12px' }}>
                📤 → 📥 {routeS2R.distanceKm} km total
              </span>
            )}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════
          BLOCK BANNER — shown when user has an undelivered order
      ══════════════════════════════════════════════════════════════ */}
      {!isDriver && hasActiveOrder && (
        <div style={{
          margin: '14px 16px 0',
          background: 'rgba(239,68,68,0.07)',
          border: '1px solid rgba(239,68,68,0.25)',
          borderRadius: '12px', padding: '12px 14px',
          display: 'flex', alignItems: 'center', gap: '10px',
        }}>
          <AlertCircle size={18} color="var(--red)" style={{ flexShrink: 0 }} />
          <div>
            <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--red)' }}>
              You have an active order in progress
            </p>
            <p style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>
              You cannot place a new order until your current delivery is completed.
            </p>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          ACTIVE ORDER DETAIL CARD — shown below map when there is one
      ══════════════════════════════════════════════════════════════ */}
      {activeOrder && (
        <div style={{
          margin: '14px 16px 0',
          background: 'var(--bg2)',
          border: `2px solid ${STATUS_COLOR(activeOrder.status)}44`,
          borderRadius: '16px', overflow: 'hidden',
        }}>
          {/* Status header */}
          <div style={{
            background: `${STATUS_COLOR(activeOrder.status)}14`,
            padding: '12px 16px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            borderBottom: `1px solid ${STATUS_COLOR(activeOrder.status)}22`,
          }}>
            <div>
              <p style={{ fontWeight: 800, fontSize: '15px', color: STATUS_COLOR(activeOrder.status) }}>
                {STATUS_LABEL(activeOrder.status)}
              </p>
              <p style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px', fontFamily: 'monospace' }}>
                #{activeOrder.id.slice(0, 8)}
              </p>
            </div>
            <p style={{ fontWeight: 800, fontSize: '18px', color: 'var(--yellow)' }}>
              {(activeOrder.predicted_price || 0).toLocaleString()} RWF
            </p>
          </div>

          <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>

            {/* Sender ↔ Receiver */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '10px', padding: '10px' }}>
                <p style={{ fontSize: '10px', color: '#f59e0b', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>📤 Sender</p>
                <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>{activeOrder.sender_name}</p>
                <p style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>📞 {activeOrder.sender_number}</p>
                <p style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '1px' }}>📍 {activeOrder.sender_location}</p>
              </div>
              <div style={{ background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '10px', padding: '10px' }}>
                <p style={{ fontSize: '10px', color: '#22c55e', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>📥 Receiver</p>
                <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>{activeOrder.receiver_name}</p>
                <p style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>📞 {activeOrder.receiver_number}</p>
                <p style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '1px' }}>📍 {activeOrder.receiver_location}</p>
              </div>
            </div>

            {/* Driver card */}
            {activeOrder.driver_name && (
              <div style={{
                background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.2)',
                borderRadius: '10px', padding: '10px 12px',
                display: 'flex', alignItems: 'center', gap: '12px',
              }}>
                <span style={{ fontSize: '26px' }}>🏍️</span>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: '10px', color: '#3b82f6', fontWeight: 700, textTransform: 'uppercase', marginBottom: '3px' }}>Your Motari</p>
                  <p style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text)' }}>{activeOrder.driver_name}</p>
                  <p style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>
                    {activeOrder.driver_phone}{activeOrder.driver_plate && ` · 🪪 ${activeOrder.driver_plate}`}
                  </p>
                </div>
                {activeOrder.driver_phone && (
                  <a href={`tel:${activeOrder.driver_phone}`} style={{
                    background: 'rgba(59,130,246,0.15)', borderRadius: '10px',
                    padding: '10px', textDecoration: 'none', fontSize: '18px', flexShrink: 0,
                  }}>📞</a>
                )}
              </div>
            )}

            {/* Package details */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {[
                { label: 'Size',   val: activeOrder.package_size },
                { label: 'Weight', val: activeOrder.package_weight || 'N/A' },
                { label: 'Speed',  val: activeOrder.delivery_speed === 'rapid' ? '⚡ Rapid' : '🚲 Normal' },
                { label: 'Handle', val: activeOrder.is_fragile ? '🫧 Fragile' : '📦 Normal' },
              ].map(item => (
                <div key={item.label} style={{
                  background: 'var(--bg3)', borderRadius: '8px',
                  padding: '6px 10px', flex: '1 1 auto', minWidth: '70px',
                }}>
                  <p style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase' }}>{item.label}</p>
                  <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)', marginTop: '2px' }}>{item.val}</p>
                </div>
              ))}
            </div>

            {/* Note */}
            {activeOrder.delivery_note && (
              <div style={{ background: 'rgba(249,115,22,0.06)', border: '1px solid rgba(249,115,22,0.2)', borderRadius: '8px', padding: '8px 12px' }}>
                <p style={{ fontSize: '11px', color: '#f97316' }}>📝 {activeOrder.delivery_note}</p>
              </div>
            )}

            {/* In-transit live tracking notice */}
            {activeOrder.status === 'in_transit' && (
              <div style={{
                background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.25)',
                borderRadius: '10px', padding: '10px 12px',
                display: 'flex', alignItems: 'center', gap: '8px',
              }}>
                <div className="spinner" style={{ width: '14px', height: '14px', borderWidth: '2px', flexShrink: 0 }} />
                <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--blue)' }}>
                  🚀 Your package is on the way — motari tracked live on map above
                </p>
              </div>
            )}

            {/* Delivered */}
            {activeOrder.status === 'delivered' && (
              <div style={{
                background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)',
                borderRadius: '10px', padding: '10px 12px',
                display: 'flex', alignItems: 'center', gap: '8px',
              }}>
                <CheckCircle size={16} color="var(--green)" />
                <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--green)' }}>Delivered successfully! 🎉</p>
              </div>
            )}

            {/* Pay button */}
            {!activeOrder.sender_paid && activeOrder.sender_id === profile?.id &&
              ['accepted', 'awaiting_payment'].includes(activeOrder.status) && (
              <div>
                {payStatus[activeOrder.id] === 'pending' || payStatus[activeOrder.id] === 'requesting' ? (
                  <div style={{ padding: '13px', background: 'var(--bg3)', borderRadius: '10px', textAlign: 'center' }}>
                    <div className="spinner" style={{ width: '16px', height: '16px', margin: '0 auto 6px' }} />
                    <p style={{ fontSize: '13px', fontWeight: 700 }}>
                      {payStatus[activeOrder.id] === 'requesting' ? '⏳ Connecting to MoMo…' : '📱 Check your phone!'}
                    </p>
                  </div>
                ) : (
                  <button
                    onClick={() => handlePay(activeOrder.id)}
                    disabled={payingId === activeOrder.id}
                    style={{
                      width: '100%', padding: '14px',
                      background: 'var(--yellow)', border: 'none', borderRadius: '10px',
                      fontWeight: 800, fontSize: '15px', cursor: 'pointer',
                      fontFamily: 'Space Grotesk, sans-serif', color: '#0a0a0a',
                    }}
                  >
                    📱 Pay {(activeOrder.predicted_price || 0).toLocaleString()} RWF with MoMo
                  </button>
                )}
                {payStatus[activeOrder.id] === 'failed'  && <p style={{ fontSize: '11px', color: 'var(--red)',    textAlign: 'center', marginTop: '6px' }}>❌ Payment failed. Try again.</p>}
                {payStatus[activeOrder.id] === 'timeout' && <p style={{ fontSize: '11px', color: 'var(--red)',    textAlign: 'center', marginTop: '6px' }}>⏰ Timed out. Try again.</p>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          ALL ORDERS LIST
      ══════════════════════════════════════════════════════════════ */}
      <div style={{ padding: '14px 16px 100px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', marginTop: '6px' }}>
          <h2 style={{ fontWeight: 800, fontSize: '17px', color: 'var(--text)' }}>
            {isDriver ? 'My Jobs' : 'All Orders'}
          </h2>
          {myLocation && (
            <span style={{ fontSize: '11px', color: 'var(--green)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <CheckCircle size={10} /> GPS active
            </span>
          )}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '48px' }}><div className="spinner" /></div>
        ) : orders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text3)' }}>
            <Package size={36} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
            <p style={{ fontWeight: 600, fontSize: '15px' }}>No orders yet</p>
            <p style={{ fontSize: '13px', marginTop: '4px' }}>Place an order to track it here</p>
          </div>
        ) : (
          orders.map(order => {
            const sc = STATUS_COLOR(order.status);
            return (
              <div key={order.id} style={{
                background: 'var(--bg2)', border: '1px solid var(--border)',
                borderRadius: '12px', marginBottom: '10px', overflow: 'hidden',
              }}>
                <div style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--text3)' }}>
                    #{order.id.slice(0, 8)}
                  </span>
                  <span style={{
                    fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px',
                    background: `${sc}18`, color: sc, border: `1px solid ${sc}44`,
                  }}>
                    {STATUS_LABEL(order.status)}
                  </span>
                </div>
                <div style={{ padding: '0 14px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ fontSize: '12px', color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <MapPin size={10} /> {order.sender_location} → {order.receiver_location}
                    </p>
                    <p style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Clock size={10} /> {new Date(order.created_at).toLocaleString()}
                    </p>
                  </div>
                  <p style={{ fontWeight: 800, fontSize: '14px', color: 'var(--yellow)' }}>
                    {(order.predicted_price || 0).toLocaleString()} RWF
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}