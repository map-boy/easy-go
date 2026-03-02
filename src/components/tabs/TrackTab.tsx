import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Package, CheckCircle, Clock, Bike, MessageSquare } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { predictPrice, isRushHour, haversineKm } from '../../lib/pricePredictor';

// Fix Leaflet icon bug
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Custom colored markers
const makeIcon = (color: string, emoji: string) => L.divIcon({
  className: '',
  html: `
    <div style="display:flex;flex-direction:column;align-items:center;">
      <div style="width:36px;height:36px;background:${color};border-radius:50%;border:3px solid #fff;
        box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:16px;">
        ${emoji}
      </div>
      <div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;
        border-top:8px solid ${color};margin-top:-1px;"></div>
    </div>
  `,
  iconSize: [36, 48],
  iconAnchor: [18, 48],
  popupAnchor: [0, -48],
});

const senderIcon   = makeIcon('#f59e0b', '📤');
const receiverIcon = makeIcon('#22c55e', '📥');
const driverIcon   = makeIcon('#3b82f6', '🏍️');

const MAP_STYLES = [
  { label: '🗺️ Street',    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',                                  attribution: '© OpenStreetMap' },
  { label: '🏙️ Detailed',  url: 'https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png',                                attribution: '© OpenStreetMap France' },
  { label: '🛰️ Satellite', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution: '© Esri' },
  { label: '🌙 Dark',      url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',                         attribution: '© CARTO' },
];

function MapBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length >= 2) {
      map.fitBounds(L.latLngBounds(positions), { padding: [48, 48], animate: true });
    } else if (positions.length === 1) {
      map.setView(positions[0], 15, { animate: true });
    }
  }, [positions.map(p => p.join(',')).join('|')]);
  return null;
}

async function fetchOsrmRoute(from: [number, number], to: [number, number]) {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`;
    const res  = await fetch(url);
    const data = await res.json();
    if (!data.routes?.[0]) return null;
    const route = data.routes[0];
    return {
      points:      route.geometry.coordinates.map(([lng, lat]: [number, number]) => [lat, lng]) as [number, number][],
      distanceKm:  Math.round(route.distance / 100) / 10,
      durationMin: Math.round(route.duration / 60),
    };
  } catch { return null; }
}

const KIGALI: [number, number] = [-1.9441, 30.0619];

interface Order {
  id: string; sender_id: string; receiver_id: string; sender_name: string;
  sender_number: string; receiver_name: string; receiver_number: string;
  sender_location: string; receiver_location: string; package_size: string;
  package_weight: string; predicted_price: number; status: string;
  sender_paid: boolean; sender_confirmed: boolean; receiver_confirmed: boolean;
  driver_confirmed: boolean; comment: string; created_at: string;
  drivers: any; sender_lat?: number; sender_lng?: number; receiver_lat?: number;
  receiver_lng?: number; driver_lat?: number; driver_lng?: number;
  driver_name?: string; driver_phone?: string; driver_plate?: string;
}

function OrderMapCard({ order }: { order: Order }) {
  const [mapStyle, setMapStyle]               = useState(0);
  const [showStylePicker, setShowStylePicker] = useState(false);
  const [routeD2S, setRouteD2S]               = useState<any>(null);
  const [routeS2R, setRouteS2R]               = useState<any>(null);
  const [priceInfo, setPriceInfo]             = useState<any>(null);

  const driverPos: [number, number] | null = (order.driver_lat) && (order.driver_lng) ? [order.driver_lat, order.driver_lng] : null;
  const senderPos: [number, number] | null = order.sender_lat && order.sender_lng ? [order.sender_lat, order.sender_lng] : null;
  const receiverPos: [number, number] | null = order.receiver_lat && order.receiver_lng ? [order.receiver_lat, order.receiver_lng] : null;

  const allPositions: [number, number][] = [
    ...(driverPos ? [driverPos] : []),
    ...(senderPos ? [senderPos] : []),
    ...(receiverPos ? [receiverPos] : []),
  ];

  useEffect(() => {
    if (['accepted', 'paid', 'in_transit', 'delivered'].includes(order.status)) {
      loadRoutes();
    }
  }, [order.id, order.status, order.driver_lat, order.driver_lng]);

  async function loadRoutes() {
    let d2s = null, s2r = null;
    if (driverPos && senderPos)   d2s = await fetchOsrmRoute(driverPos, senderPos);
    if (senderPos && receiverPos) s2r = await fetchOsrmRoute(senderPos, receiverPos);
    setRouteD2S(d2s);
    setRouteS2R(s2r);

    const dist1 = d2s?.distanceKm ?? (driverPos && senderPos ? haversineKm(driverPos[0], driverPos[1], senderPos[0], senderPos[1]) : 2);
    const dist2 = s2r?.distanceKm ?? (senderPos && receiverPos ? haversineKm(senderPos[0], senderPos[1], receiverPos[0], receiverPos[1]) : 5);
    setPriceInfo(predictPrice({ distDriverToSender: dist1, distSenderToReceiver: dist2, isRushHour: isRushHour(), badWeather: false, badRoads: false }));
  }

  if (allPositions.length === 0) return <div style={{height:'220px', background:'var(--bg3)', borderRadius:'12px 12px 0 0', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text3)'}}>No location data</div>;

  return (
    <div>
      <div style={{ position: 'relative', height: '220px', borderRadius: '12px 12px 0 0', overflow: 'hidden' }}>
        <MapContainer center={allPositions[0] || KIGALI} zoom={13} style={{ height: '100%', width: '100%' }} zoomControl={false} scrollWheelZoom={false} attributionControl={false}>
          <TileLayer url={MAP_STYLES[mapStyle].url} attribution={MAP_STYLES[mapStyle].attribution} />
          <MapBounds positions={allPositions} />
          {routeD2S?.points && <Polyline positions={routeD2S.points} color="#f59e0b" weight={4} opacity={0.6} dashArray="8 5" />}
          {routeS2R?.points && <Polyline positions={routeS2R.points} color="#22c55e" weight={4} opacity={0.8} />}
          {driverPos && <Marker position={driverPos} icon={driverIcon}><Popup>Driver Position</Popup></Marker>}
          {senderPos && <Marker position={senderPos} icon={senderIcon}><Popup>Sender Position</Popup></Marker>}
          {receiverPos && <Marker position={receiverPos} icon={receiverIcon}><Popup>Receiver Position</Popup></Marker>}
        </MapContainer>
        <div style={{ position: 'absolute', top: '8px', right: '8px', zIndex: 999 }}>
          <button onClick={() => setShowStylePicker(!showStylePicker)} style={{ background: '#fff', border: '1px solid #ddd', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', fontWeight: 700 }}>
            {MAP_STYLES[mapStyle].label}
          </button>
          {showStylePicker && (
            <div style={{ position: 'absolute', top: '30px', right: 0, background: '#fff', border: '1px solid #ddd', borderRadius: '8px', padding: '4px', display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '100px' }}>
              {MAP_STYLES.map((s, i) => (
                <button key={s.label} onClick={() => { setMapStyle(i); setShowStylePicker(false); }} style={{ background: mapStyle === i ? '#eee' : 'none', border: 'none', padding: '6px', fontSize: '11px', textAlign: 'left', borderRadius: '4px' }}>{s.label}</button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function TrackTab() {
  const { profile } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [payStatus, setPayStatus] = useState<Record<string, string>>({});
  const [payingOrderId, setPayingOrderId] = useState<string | null>(null);

  const isDriver = (profile as any)?.user_category === 'motari' || profile?.role === 'driver';

  useEffect(() => {
    loadOrders();
    const channel = supabase.channel('track-orders').on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, loadOrders).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile?.id]);

  async function loadOrders() {
    if (!profile) return;
    let query = supabase.from('orders').select(`*, drivers:driver_id(*, profiles:user_id(*))`).order('created_at', { ascending: false });
    if (isDriver) {
       const { data: dr } = await supabase.from('drivers').select('id').eq('user_id', profile.id).maybeSingle();
       if (dr) query = query.eq('driver_id', dr.id);
    } else {
       query = query.or(`sender_id.eq.${profile.id},receiver_id.eq.${profile.id}`);
    }

    const { data } = await query;
    if (!data) return;

    // Helper: geocode a location string when GPS coords are missing
    async function geocode(loc: string, district: string): Promise<{lat: number, lng: number} | null> {
      if (!loc) return null;
      try {
        const q = encodeURIComponent(`${loc}, ${district || ''}, Rwanda`);
        const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&countrycodes=rw`, { headers: { 'Accept-Language': 'en' } });
        const d = await res.json();
        if (!d.length) return null;
        return { lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon) };
      } catch { return null; }
    }

    const enriched = await Promise.all(data.map(async (o: any) => {
      const { data: sp } = await supabase.from('profiles').select('latitude,longitude').eq('id', o.sender_id).maybeSingle();
      const { data: rp } = o.receiver_id ? await supabase.from('profiles').select('latitude,longitude').eq('id', o.receiver_id).maybeSingle() : { data: null };

      // Fall back to geocoding if GPS not saved yet
      let sLat = sp?.latitude, sLng = sp?.longitude;
      let rLat = rp?.latitude, rLng = rp?.longitude;
      if (!sLat && o.sender_location) {
        const g = await geocode(o.sender_location, o.sender_district);
        if (g) { sLat = g.lat; sLng = g.lng; }
      }
      if (!rLat && o.receiver_location) {
        const g = await geocode(o.receiver_location, o.receiver_district);
        if (g) { rLat = g.lat; rLng = g.lng; }
      }

      return {
        ...o,
        sender_lat: sLat, sender_lng: sLng,
        receiver_lat: rLat, receiver_lng: rLng,
        driver_lat: o.drivers?.latitude, driver_lng: o.drivers?.longitude,
        driver_name: o.drivers?.profiles?.full_name,
        driver_phone: o.drivers?.profiles?.phone_number,
        driver_plate: o.drivers?.plate_number
      };
    }));
    setOrders(enriched);
    setLoading(false);
  }

  async function handlePay(orderId: string) {
    const order = orders.find(o => o.id === orderId);
    if (!order || !profile) return;

    setPayingOrderId(orderId);
    setPayStatus(s => ({ ...s, [orderId]: 'requesting' }));

    try {
      const { data, error } = await supabase.functions.invoke('request-payment', {
        body: { orderId, amount: order.predicted_price, phoneNumber: (profile as any).phone_number, payerName: profile.full_name }
      });

      if (error || !data?.success) throw new Error('Request failed');

      setPayStatus(s => ({ ...s, [orderId]: 'pending' }));

      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        if (attempts > 24) { 
          clearInterval(poll); setPayStatus(s => ({ ...s, [orderId]: 'timeout' })); setPayingOrderId(null); return; 
        }

        const { data: checkData } = await supabase.functions.invoke('check-payment', { body: { paymentId: data.paymentId, orderId } });
        if (checkData?.status === 'SUCCESSFUL') {
          clearInterval(poll); setPayStatus(s => ({ ...s, [orderId]: 'paid' })); setPayingOrderId(null); loadOrders();
        } else if (checkData?.status === 'FAILED') {
          clearInterval(poll); setPayStatus(s => ({ ...s, [orderId]: 'failed' })); setPayingOrderId(null);
        }
      }, 5000);
    } catch (e) {
      setPayStatus(s => ({ ...s, [orderId]: 'failed' })); setPayingOrderId(null);
    }
  }

  if (loading) return <div className="spinner" style={{margin:'100px auto'}} />;

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', padding: '20px' }}>
      <h2 style={{fontWeight: 700, fontSize: '20px', marginBottom: '20px'}}>Track Your Orders</h2>
      {orders.map(order => (
        <div key={order.id} className="card" style={{ marginBottom: '20px', padding: 0, overflow: 'hidden' }}>
          <OrderMapCard order={order} />
          <div style={{ padding: '15px' }}>
            <div style={{display:'flex', justifyContent:'space-between', marginBottom:'10px'}}>
               <span style={{fontWeight:800}}>#{order.id.slice(0,8)}</span>
               <span className="badge badge-yellow">{order.status}</span>
            </div>
            
            {/* Payment Section */}
            {!order.sender_paid && profile?.id === order.sender_id && order.status === 'accepted' && (
              <div style={{marginTop:'10px'}}>
                {payStatus[order.id] === 'pending' ? (
                  <div style={{padding:'10px', background:'var(--bg3)', borderRadius:'8px', textAlign:'center'}}>
                    <p style={{fontSize:'12px', fontWeight:700}}>📱 Check your phone to approve!</p>
                  </div>
                ) : (
                  <button onClick={() => handlePay(order.id)} disabled={payingOrderId === order.id} style={{width:'100%', padding:'12px', background:'var(--yellow)', border:'none', borderRadius:'10px', fontWeight:800}}>
                    Pay {order.predicted_price} RWF with MoMo
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}