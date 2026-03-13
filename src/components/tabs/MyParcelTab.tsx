import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Phone, MapPin, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

// ── Leaflet icon fix ──────────────────────────────────────────
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const makeIcon = (emoji: string, color: string, size = 36) => L.divIcon({
  className: '',
  html: `<div style="width:${size}px;height:${size}px;background:${color};border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:${size * 0.45}px;border:3px solid #fff;box-shadow:0 2px 10px ${color}99;">${emoji}</div>`,
  iconSize:   [size, size],
  iconAnchor: [size / 2, size / 2],
});

const senderIcon   = makeIcon('📤', '#f59e0b', 36);
const receiverIcon = makeIcon('📥', '#22c55e', 36);
const driverIcon   = makeIcon('🏍️', '#3b82f6', 40);

const MAP_STYLES = [
  { label: '🗺️ Street',    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png' },
  { label: '🛰️ Satellite', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}' },
  { label: '🌙 Dark',      url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png' },
  { label: '☀️ Light',     url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png' },
];

const KIGALI: [number, number] = [-1.9441, 30.0619];

function MapBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length >= 2) map.fitBounds(L.latLngBounds(positions), { padding: [48, 48], animate: true });
    else if (positions.length === 1) map.setView(positions[0], 15, { animate: true });
  }, [positions.map(p => p.join(',')).join('|')]);
  return null;
}

async function fetchRoute(from: [number, number], to: [number, number]) {
  try {
    const res  = await fetch(`https://router.project-osrm.org/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`);
    const data = await res.json();
    if (data.code !== 'Ok') return null;
    const r = data.routes[0];
    return {
      points:      r.geometry.coordinates.map(([lng, lat]: number[]) => [lat, lng] as [number, number]),
      distanceKm:  Math.round(r.distance / 100) / 10,
      durationMin: Math.round(r.duration / 60),
    };
  } catch { return null; }
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; emoji: string; step: number }> = {
  awaiting_payment: { label: 'Awaiting Payment',   color: '#f97316', bg: 'rgba(249,115,22,0.08)',  border: 'rgba(249,115,22,0.25)',  emoji: '💳', step: 0 },
  pending:          { label: 'Finding a Driver',   color: '#f5c518', bg: 'rgba(245,197,24,0.08)',  border: 'rgba(245,197,24,0.25)',  emoji: '🔍', step: 1 },
  accepted:         { label: 'Driver on the way',  color: '#3b82f6', bg: 'rgba(59,130,246,0.08)',  border: 'rgba(59,130,246,0.25)',  emoji: '🏍️', step: 2 },
  paid:             { label: 'Driver on the way',  color: '#3b82f6', bg: 'rgba(59,130,246,0.08)',  border: 'rgba(59,130,246,0.25)',  emoji: '🏍️', step: 2 },
  in_transit:       { label: 'Package in Transit', color: '#8b5cf6', bg: 'rgba(139,92,246,0.08)', border: 'rgba(139,92,246,0.25)',  emoji: '📦', step: 3 },
  delivered:        { label: 'Delivered!',          color: '#22c55e', bg: 'rgba(34,197,94,0.08)',  border: 'rgba(34,197,94,0.25)',  emoji: '🎉', step: 4 },
  cancelled:        { label: 'Cancelled',           color: '#ef4444', bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.25)',  emoji: '❌', step: -1 },
};

const STEPS = ['Payment', 'Finding Driver', 'Driver Coming', 'In Transit', 'Delivered'];

// ── Main component ────────────────────────────────────────────
export function MyParcelTab() {
  const { profile } = useAuth();

  const [orders,       setOrders]       = useState<any[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [activeId,     setActiveId]     = useState<string | null>(null);
  const [routes,       setRoutes]       = useState<Record<string, any>>({});
  const [mapStyle,     setMapStyle]     = useState(0);
  const [showPicker,   setShowPicker]   = useState(false);
  const [payStatus,    setPayStatus]    = useState<Record<string, string>>({});
  const [payingId,     setPayingId]     = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [ratingOrderId,  setRatingOrderId]  = useState<string | null>(null);
  const [ratingDriver,   setRatingDriver]   = useState<string>('');
  const [starRating,     setStarRating]     = useState(0);
  const [ratingComment,  setRatingComment]  = useState('');
  const [ratingLoading,  setRatingLoading]  = useState(false);
  const [hoverStar,      setHoverStar]      = useState(0);

  useEffect(() => {
    loadOrders();
    const ch = supabase.channel('myparcel-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, loadOrders)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile?.id]);

  async function loadOrders() {
    if (!profile) return;
    const [{ data }, { data: foodData }] = await Promise.all([
      supabase
        .from('orders')
        .select(`*, drivers:driver_id(plate_number, user_id, latitude, longitude, profiles:user_id(full_name, phone_number))`)
        .or(`receiver_id.eq.${profile.id},receiver_number.eq.${profile.phone_number},sender_id.eq.${profile.id}`)
        .order('created_at', { ascending: false }),
      supabase
        .from('food_orders')
        .select('*')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false }),
    ]);

    // Tag food orders so we can render them differently
    const taggedFood = (foodData || []).map((o: any) => ({ ...o, _type: 'food', predicted_price: o.total, sender_name: 'Easy GO Shop', sender_location: 'Kigali' }));

    const combined = [...(data || []), ...taggedFood].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const rawData = combined;

    if (!rawData.length) { setOrders([]); setLoading(false); return; }

    const enriched = await Promise.all(rawData.map(async (o: any) => {
      // For regular orders: sender position from their profile
      const senderProfileId = o._type === 'food' ? null : o.sender_id;
      const { data: sp } = senderProfileId
        ? await supabase.from('profiles').select('latitude,longitude').eq('id', senderProfileId).maybeSingle()
        : { data: null };
      // Receiver is always current user
      const { data: rp } = await supabase.from('profiles').select('latitude,longitude').eq('id', profile.id).maybeSingle();

      // Driver info — food orders use driver_user_id, regular orders use drivers join
      let driverLat = null, driverLng = null, driverName = null, driverPhone = null, driverPlate = null;
      if (o._type === 'food') {
        if (o.driver_user_id) {
          const { data: dp } = await supabase.from('profiles').select('latitude,longitude,full_name,phone_number').eq('id', o.driver_user_id).maybeSingle();
          driverLat = dp?.latitude; driverLng = dp?.longitude;
          driverName = dp?.full_name; driverPhone = dp?.phone_number;
          driverPlate = o.driver_plate;
        }
      } else {
        driverLat   = o.drivers?.latitude;
        driverLng   = o.drivers?.longitude;
        driverName  = o.drivers?.profiles?.full_name;
        driverPhone = o.drivers?.profiles?.phone_number;
        driverPlate = o.drivers?.plate_number;
      }

      return {
        ...o,
        sender_lat:   sp?.latitude,   sender_lng:   sp?.longitude,
        receiver_lat: rp?.latitude,   receiver_lng: rp?.longitude,
        driver_lat:   driverLat,      driver_lng:   driverLng,
        driver_name:  driverName,
        driver_phone: driverPhone,
        driver_plate: driverPlate,
      };
    }));

    setOrders(enriched);
    setLoading(false);

    const active = enriched.find((o: any) => !['delivered', 'cancelled'].includes(o.status));
    if (active && !activeId) setActiveId(active.id);

    for (const o of enriched) {
      if (['accepted', 'paid', 'in_transit'].includes(o.status)) loadRoute(o);
    }
  }

  async function loadRoute(o: any) {
    const driverPos:   [number, number] | null = o.driver_lat   && o.driver_lng   ? [o.driver_lat,   o.driver_lng]   : null;
    const senderPos:   [number, number] | null = o.sender_lat   && o.sender_lng   ? [o.sender_lat,   o.sender_lng]   : null;
    const receiverPos: [number, number] | null = o.receiver_lat && o.receiver_lng ? [o.receiver_lat, o.receiver_lng] : null;
    const d2s = driverPos && senderPos   ? await fetchRoute(driverPos, senderPos)   : null;
    const s2r = senderPos && receiverPos ? await fetchRoute(senderPos, receiverPos) : null;
    setRoutes(prev => ({ ...prev, [o.id]: { d2s, s2r } }));
  }

  async function handlePay(order: any) {
    if (!profile) return;
    setPayingId(order.id);
    setPayStatus(s => ({ ...s, [order.id]: 'requesting' }));
    try {
      const { data, error } = await supabase.functions.invoke('request-payment', {
        body: { orderId: order.id, amount: order.predicted_price, phoneNumber: profile.phone_number, payerName: profile.full_name },
      });
      if (error || !data?.success) throw new Error('failed');
      setPayStatus(s => ({ ...s, [order.id]: 'pending' }));
      let attempts = 0;
      const poll = setInterval(async () => {
        if (++attempts > 24) { clearInterval(poll); setPayStatus(s => ({ ...s, [order.id]: 'timeout' })); setPayingId(null); return; }
        const { data: check } = await supabase.functions.invoke('check-payment', { body: { paymentId: data.paymentId, orderId: order.id } });
        if (check?.status === 'SUCCESSFUL') { clearInterval(poll); setPayStatus(s => ({ ...s, [order.id]: 'paid' })); setPayingId(null); loadOrders(); }
        else if (check?.status === 'FAILED') { clearInterval(poll); setPayStatus(s => ({ ...s, [order.id]: 'failed' })); setPayingId(null); }
      }, 5000);
    } catch { setPayStatus(s => ({ ...s, [order.id]: 'failed' })); setPayingId(null); }
  }

  async function confirmReceipt(orderId: string) {
    setConfirmingId(orderId);
    const { data: ord } = await supabase.from('orders').select('driver_id, predicted_price, drivers:driver_id(user_id, profiles:user_id(full_name))').eq('id', orderId).single();
    await supabase.from('orders').update({ receiver_confirmed: true, sender_confirmed: true, status: 'delivered', updated_at: new Date().toISOString() }).eq('id', orderId);
    if (ord?.driver_id && ord?.predicted_price) {
      const earning = Math.round(ord.predicted_price * 0.7);
      const driverUserId = (ord as any).drivers?.user_id;
      if (driverUserId) {
        await supabase.rpc('increment_wallet_balance', { uid: driverUserId, delta: earning });
        await supabase.from('wallet_transactions').insert({ user_id: driverUserId, type: 'topup', amount: earning, status: 'completed', description: `Delivery earnings (70%) — order #${orderId.slice(0, 8)}` });
      }
    }
    setConfirmingId(null);
    loadOrders();
    // Open rating modal
    const driverName = (ord as any)?.drivers?.profiles?.full_name || 'your driver';
    setRatingDriver(driverName);
    setRatingOrderId(orderId);
    setStarRating(0);
    setRatingComment('');
  }

  async function confirmFoodReceipt(orderId: string) {
    setConfirmingId(orderId);
    const { data: ord } = await supabase.from('food_orders').select('total, driver_user_id').eq('id', orderId).single();
    await supabase.from('food_orders').update({ receiver_confirmed: true, status: 'delivered', updated_at: new Date().toISOString() }).eq('id', orderId);
    if (ord?.driver_user_id && ord?.total) {
      const earning = Math.round(ord.total * 0.20);
      await supabase.rpc('increment_wallet_balance', { uid: ord.driver_user_id, delta: earning });
      await supabase.from('wallet_transactions').insert({ user_id: ord.driver_user_id, type: 'topup', amount: earning, status: 'completed', description: `Shop delivery earnings (20%) — order #${orderId.slice(0, 8)}` });
    }
    setConfirmingId(null);
    loadOrders();
    setRatingDriver('your driver');
    setRatingOrderId('food:' + orderId);
    setStarRating(0);
    setRatingComment('');
  }

  async function submitRating() {
    if (!ratingOrderId || starRating === 0) { setRatingOrderId(null); return; }
    setRatingLoading(true);
    const isFood = ratingOrderId.startsWith('food:');
    const realId = isFood ? ratingOrderId.replace('food:', '') : ratingOrderId;
    if (isFood) {
      await supabase.from('food_orders').update({ driver_rating: starRating, driver_comment: ratingComment }).eq('id', realId);
    } else {
      await supabase.from('orders').update({ sender_rating: starRating, sender_comment: ratingComment }).eq('id', realId);
    }
    setRatingLoading(false);
    setRatingOrderId(null);
    loadOrders();
  }

  const activeOrders    = orders.filter(o => !['delivered', 'cancelled'].includes(o.status));
  const completedOrders = orders.filter(o =>  ['delivered', 'cancelled'].includes(o.status));

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>

      <style>{`
        @keyframes pdot { 0%,100%{opacity:1;transform:scale(1);}50%{opacity:.4;transform:scale(.65);} }
        @keyframes spin  { to { transform: rotate(360deg); } }
      `}</style>

      {/* ── HEADER ── */}
      <div style={{ padding: '20px 20px 0', background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div>
            <h2 style={{ fontWeight: 800, fontSize: '20px', color: 'var(--text)', letterSpacing: '-.02em', marginBottom: '2px' }}>
              📦 My Parcels
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--text3)' }}>
              {activeOrders.length} active · {completedOrders.length} completed
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '20px', padding: '5px 12px' }}>
            <div style={{ width: '6px', height: '6px', background: '#22c55e', borderRadius: '50%', animation: 'pdot 1.6s ease infinite' }} />
            <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--green)' }}>LIVE</span>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', gap: '8px', paddingBottom: '16px' }}>
          {[
            { num: orders.length,          label: 'Total',  color: 'var(--text)'   },
            { num: activeOrders.length,    label: 'Active', color: 'var(--yellow)' },
            { num: completedOrders.length, label: 'Done',   color: 'var(--green)'  },
          ].map(s => (
            <div key={s.label} style={{ flex: 1, background: 'var(--bg3)', borderRadius: '12px', padding: '10px', textAlign: 'center', border: '1px solid var(--border)' }}>
              <p style={{ fontSize: '18px', fontWeight: 800, color: s.color }}>{s.num}</p>
              <p style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: '16px' }}>

        {/* Loading */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div className="spinner" />
          </div>
        ) : activeOrders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 24px', background: 'var(--card)', borderRadius: '16px', border: '1px solid var(--border)', marginBottom: '16px' }}>
            <p style={{ fontSize: '44px', marginBottom: '12px' }}>📭</p>
            <p style={{ fontWeight: 700, fontSize: '16px', color: 'var(--text)', marginBottom: '6px' }}>No active parcels</p>
            <p style={{ fontSize: '13px', color: 'var(--text3)' }}>When someone sends you a package, it will appear here for tracking</p>
          </div>
        ) : (
          <>
            <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '10px' }}>
              🔴 Active
            </p>
            {activeOrders.map(order => order._type === 'food' ? (
              <FoodOrderCard key={order.id} order={order} onConfirmFood={confirmFoodReceipt} confirmingId={confirmingId} />
            ) : (
              <ActiveOrderCard
                key={order.id}
                order={order}
                profile={profile}
                route={routes[order.id]}
                mapStyle={mapStyle}
                showPicker={showPicker && activeId === order.id}
                onTogglePicker={() => setShowPicker(prev => activeId === order.id ? !prev : true)}
                onStyleChange={(i: number) => { setMapStyle(i); setShowPicker(false); }}
                MAP_STYLES={MAP_STYLES}
                payStatus={payStatus[order.id]}
                payingId={payingId}
                confirmingId={confirmingId}
                onPay={() => handlePay(order)}
                onConfirm={() => confirmReceipt(order.id)}
              />
            ))}
          </>
        )}

        {/* Completed */}
        {completedOrders.length > 0 && (
          <>
            <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.08em', marginTop: '20px', marginBottom: '10px' }}>
              ✅ Completed
            </p>
            {completedOrders.map(order => (
              <CompletedOrderCard key={order.id} order={order} />
            ))}
          </>
        )}
      </div>

      {/* ── RATING MODAL ── */}
      {ratingOrderId && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 4000, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
          onClick={() => setRatingOrderId(null)}>
          <div style={{ background: 'var(--card)', borderRadius: '20px 20px 0 0', padding: '24px 20px 48px', width: '100%', maxWidth: '480px', border: '1px solid var(--border)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <p style={{ fontWeight: 800, fontSize: '18px', color: 'var(--text)' }}>⭐ Rate Your Driver</p>
              <button onClick={() => setRatingOrderId(null)} style={{ background: 'var(--bg3)', border: 'none', borderRadius: '50%', width: '30px', height: '30px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)' }}>
                <X size={14} />
              </button>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text3)', marginBottom: '20px', textAlign: 'center' }}>How was your experience with <strong style={{ color: 'var(--text)' }}>{ratingDriver}</strong>?</p>
            {/* Stars */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginBottom: '20px' }}>
              {[1,2,3,4,5].map(s => (
                <button key={s}
                  onClick={() => setStarRating(s)}
                  onMouseEnter={() => setHoverStar(s)}
                  onMouseLeave={() => setHoverStar(0)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                  <Star size={38} color={(hoverStar || starRating) >= s ? '#f5c518' : 'var(--border2)'} fill={(hoverStar || starRating) >= s ? '#f5c518' : 'none'} />
                </button>
              ))}
            </div>
            {starRating > 0 && (
              <p style={{ textAlign: 'center', fontSize: '14px', fontWeight: 700, color: 'var(--yellow)', marginBottom: '16px' }}>
                {starRating === 1 ? '😞 Poor' : starRating === 2 ? '😐 Fair' : starRating === 3 ? '🙂 Good' : starRating === 4 ? '😊 Great' : '🤩 Excellent!'}
              </p>
            )}
            {/* Comment */}
            <textarea placeholder="Leave a comment (optional)…" value={ratingComment} onChange={e => setRatingComment(e.target.value)}
              style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px 14px', fontSize: '14px', color: 'var(--text)', fontFamily: 'Space Grotesk, sans-serif', outline: 'none', resize: 'none', minHeight: '80px', boxSizing: 'border-box', marginBottom: '14px' }} />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setRatingOrderId(null)}
                style={{ flex: 1, padding: '13px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: '12px', fontWeight: 700, fontSize: '14px', color: 'var(--text3)', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif' }}>
                Skip
              </button>
              <button onClick={submitRating} disabled={ratingLoading || starRating === 0}
                style={{ flex: 2, padding: '13px', background: starRating === 0 ? 'var(--border2)' : 'var(--yellow)', border: 'none', borderRadius: '12px', fontWeight: 800, fontSize: '14px', color: '#0a0a0a', cursor: starRating === 0 ? 'not-allowed' : 'pointer', fontFamily: 'Space Grotesk, sans-serif' }}>
                {ratingLoading ? '⏳ Submitting…' : '⭐ Submit Rating'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// ── Active order card ─────────────────────────────────────────
function ActiveOrderCard({ order, profile, route, mapStyle, MAP_STYLES, showPicker, onTogglePicker, onStyleChange, payStatus, payingId, confirmingId, onPay, onConfirm }: any) {
  const cfg = STATUS_CONFIG[order.status] || STATUS_CONFIG['pending'];
  const driverPos:   [number, number] | null = order.driver_lat   && order.driver_lng   ? [order.driver_lat,   order.driver_lng]   : null;
  const senderPos:   [number, number] | null = order.sender_lat   && order.sender_lng   ? [order.sender_lat,   order.sender_lng]   : null;
  const receiverPos: [number, number] | null = order.receiver_lat && order.receiver_lng ? [order.receiver_lat, order.receiver_lng] : null;
  const allPos: [number, number][] = [driverPos, senderPos, receiverPos].filter(Boolean) as [number, number][];
  const mapCenter: [number, number] = allPos[0] || KIGALI;
  const needsPayment = !order.sender_paid && order.status !== 'cancelled';
  const canConfirm   = order.status === 'in_transit' || order.status === 'delivered';

  return (
    <div style={{ background: 'var(--card)', borderRadius: '16px', overflow: 'hidden', marginBottom: '16px', border: `1px solid ${cfg.border}` }}>

      {/* Status banner */}
      <div style={{ background: cfg.bg, padding: '12px 16px', borderBottom: `1px solid ${cfg.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '22px' }}>{cfg.emoji}</span>
          <div>
            <p style={{ fontWeight: 800, fontSize: '14px', color: cfg.color }}>{cfg.label}</p>
            <p style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '1px' }}>#{order.id.slice(0, 8)}</p>
          </div>
        </div>
        <p style={{ fontWeight: 800, fontSize: '18px', color: 'var(--yellow)' }}>
          {(order.predicted_price || 0).toLocaleString()} RWF
        </p>
      </div>

      {/* Progress steps */}
      {order.status !== 'cancelled' && (
        <div style={{ padding: '12px 16px', background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            {STEPS.map((step, i) => {
              const done = i < cfg.step, current = i === cfg.step;
              return (
                <div key={step} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                  <div style={{ width: '24px', height: '24px', borderRadius: '50%', marginBottom: '4px', background: done ? '#22c55e' : current ? cfg.color : 'var(--border2)', border: `2px solid ${done ? '#22c55e' : current ? cfg.color : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {done ? <span style={{ fontSize: '10px', color: '#fff' }}>✓</span> : <span style={{ color: current ? '#fff' : 'var(--text3)', fontSize: '9px', fontWeight: 700 }}>{i + 1}</span>}
                  </div>
                  <p style={{ fontSize: '8px', color: current ? cfg.color : done ? 'var(--green)' : 'var(--text3)', fontWeight: current || done ? 700 : 500, textAlign: 'center', lineHeight: 1.2 }}>{step}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Map */}
      {['accepted', 'paid', 'in_transit'].includes(order.status) && (
        <div style={{ position: 'relative', height: '200px' }}>
          <MapContainer center={mapCenter} zoom={13} style={{ height: '100%', width: '100%' }} zoomControl={false} scrollWheelZoom={false} attributionControl={false}>
            <TileLayer url={MAP_STYLES[mapStyle].url} maxZoom={19} />
            <MapBounds positions={allPos} />
            {route?.d2s?.points && <Polyline positions={route.d2s.points} color="#f59e0b" weight={4} opacity={0.8} dashArray="8 5" />}
            {route?.s2r?.points && <Polyline positions={route.s2r.points} color="#22c55e" weight={4} opacity={0.9} />}
            {driverPos   && <Marker position={driverPos}   icon={driverIcon}  ><Popup>🏍️ Driver</Popup></Marker>}
            {senderPos   && <Marker position={senderPos}   icon={senderIcon}  ><Popup>📤 Pickup</Popup></Marker>}
            {receiverPos && <Marker position={receiverPos} icon={receiverIcon}><Popup>📥 You</Popup></Marker>}
          </MapContainer>

          {/* Live badge */}
          <div style={{ position: 'absolute', top: '8px', left: '8px', zIndex: 999, background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)', borderRadius: '20px', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '5px', border: '1px solid rgba(34,197,94,0.3)' }}>
            <div style={{ width: '6px', height: '6px', background: '#22c55e', borderRadius: '50%', animation: 'pdot 1.6s ease infinite' }} />
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#111' }}>LIVE</span>
          </div>

          {/* Map style picker */}
          <div style={{ position: 'absolute', top: '8px', right: '8px', zIndex: 999 }}>
            <button onClick={onTogglePicker} style={{ background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)', border: '1px solid rgba(0,0,0,0.15)', borderRadius: '8px', padding: '4px 8px', cursor: 'pointer', fontSize: '10px', fontWeight: 700, color: '#111', fontFamily: 'Space Grotesk, sans-serif' }}>
              {MAP_STYLES[mapStyle].label} ▾
            </button>
            {showPicker && (
              <div style={{ position: 'absolute', top: '28px', right: 0, background: 'rgba(255,255,255,0.97)', border: '1px solid rgba(0,0,0,0.12)', borderRadius: '10px', padding: '4px', minWidth: '130px', boxShadow: '0 6px 20px rgba(0,0,0,0.12)', zIndex: 9999 }}>
                {MAP_STYLES.map((s, i) => (
                  <button key={s.label} onClick={() => onStyleChange(i)} style={{ background: mapStyle === i ? '#f5c518' : 'transparent', border: 'none', borderRadius: '7px', padding: '7px 10px', cursor: 'pointer', fontSize: '11px', fontWeight: 700, color: mapStyle === i ? '#0a0a0a' : '#333', width: '100%', textAlign: 'left', fontFamily: 'Space Grotesk, sans-serif' }}>
                    {s.label} {mapStyle === i && '✓'}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Route info */}
          {(route?.d2s || route?.s2r) && (
            <div style={{ position: 'absolute', bottom: '8px', left: '8px', zIndex: 999, background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)', borderRadius: '10px', padding: '7px 10px' }}>
              {route?.d2s && <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}><div style={{ width: '14px', height: '3px', background: '#f59e0b', borderRadius: '2px' }} /><span style={{ fontSize: '10px', fontWeight: 700, color: '#333' }}>Driver: {route.d2s.distanceKm}km · {route.d2s.durationMin}min</span></div>}
              {route?.s2r && <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '14px', height: '3px', background: '#22c55e', borderRadius: '2px' }} /><span style={{ fontSize: '10px', fontWeight: 700, color: '#333' }}>To you: {route.s2r.distanceKm}km · {route.s2r.durationMin}min</span></div>}
            </div>
          )}
        </div>
      )}

      {/* Order details */}
      <div style={{ padding: '14px 16px' }}>

        {/* Sender info */}
        <div style={{ background: 'var(--bg3)', borderRadius: '10px', padding: '11px 14px', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '3px' }}>📤 Sent by</p>
            <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>{order.sender_name}</p>
            <p style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <MapPin size={10} /> {order.sender_location}
            </p>
          </div>
          <a href={`tel:${order.sender_number}`} style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '8px', padding: '7px 11px', color: 'var(--blue)', textDecoration: 'none', fontSize: '12px', fontWeight: 700 }}>
            <Phone size={11} /> Call
          </a>
        </div>

        {/* Package info */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '10px' }}>
          {[
            { label: 'Size',    value: order.package_size },
            { label: 'Weight',  value: order.package_weight },
            { label: 'Payment', value: order.payment_method || 'MoMo' },
          ].map(f => (
            <div key={f.label} style={{ background: 'var(--bg3)', borderRadius: '9px', padding: '9px', textAlign: 'center', border: '1px solid var(--border)' }}>
              <p style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '3px' }}>{f.label}</p>
              <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)', textTransform: 'capitalize' }}>{f.value || '—'}</p>
            </div>
          ))}
        </div>

        {/* Driver info */}
        {order.driver_name && (
          <div style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '10px', padding: '11px 14px', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ fontSize: '10px', color: 'var(--blue)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '3px' }}>🏍️ Your Driver</p>
              <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>{order.driver_name}</p>
              <p style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '2px' }}>Plate: {order.driver_plate}</p>
            </div>
            <a href={`tel:${order.driver_phone}`} style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '8px', padding: '7px 11px', color: 'var(--blue)', textDecoration: 'none', fontSize: '12px', fontWeight: 700 }}>
              <Phone size={11} /> Call
            </a>
          </div>
        )}

        {/* Payment */}
        {needsPayment && (
          <PaymentSection order={order} profile={profile} payStatus={payStatus} payingId={payingId} onPay={onPay} />
        )}

        {/* Confirm receipt */}
        {canConfirm && !order.receiver_confirmed && (
          <button onClick={onConfirm} disabled={confirmingId === order.id}
            style={{ width: '100%', padding: '13px', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: '12px', color: 'var(--green)', cursor: 'pointer', fontWeight: 800, fontSize: '14px', fontFamily: 'Space Grotesk, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '10px' }}>
            <CheckCircle size={16} />
            {confirmingId === order.id ? 'Confirming…' : '✅ Confirm I received my package'}
          </button>
        )}

        {order.receiver_confirmed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '11px 14px', background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '10px', marginTop: '10px' }}>
            <CheckCircle size={15} color="var(--green)" />
            <div>
              <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--green)' }}>You confirmed receipt ✓</p>
              {order.sender_rating > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginTop: '4px' }}>
                  {[1,2,3,4,5].map((s: number) => <Star key={s} size={13} color={s <= order.sender_rating ? '#f5c518' : 'var(--border2)'} fill={s <= order.sender_rating ? '#f5c518' : 'none'} />)}
                  {order.sender_comment && <span style={{ fontSize: '11px', color: 'var(--text3)', marginLeft: '4px' }}>"{order.sender_comment}"</span>}
                </div>
              )}
            </div>
          </div>
        )}

        <p style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '10px', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Clock size={9} /> Ordered {new Date(order.created_at).toLocaleString()}
        </p>
      </div>
    </div>
  );
}

// ── Payment section ───────────────────────────────────────────
function PaymentSection({ order, profile, payStatus, payingId, onPay }: any) {
  const status = payStatus;
  return (
    <div style={{ background: 'rgba(245,197,24,0.06)', border: '2px solid rgba(245,197,24,0.25)', borderRadius: '12px', padding: '14px', marginTop: '4px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <p style={{ fontWeight: 800, fontSize: '14px', color: 'var(--yellow)' }}>💳 Payment Required</p>
        <p style={{ fontWeight: 800, fontSize: '18px', color: 'var(--yellow)' }}>{(order.predicted_price || 0).toLocaleString()} RWF</p>
      </div>
      <p style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '12px' }}>The sender hasn't paid yet. You can pay on their behalf via MoMo.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: '12px', color: 'var(--text3)' }}>Your MoMo</span><span style={{ fontSize: '12px', color: 'var(--text)', fontWeight: 600 }}>{profile?.phone_number}</span></div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: '12px', color: 'var(--text3)' }}>Method</span><span style={{ fontSize: '12px', color: 'var(--text)', fontWeight: 600 }}>{order.payment_method || 'MTN MoMo'}</span></div>
      </div>
      {status === 'pending' ? (
        <div style={{ background: 'rgba(245,197,24,0.08)', border: '1px solid rgba(245,197,24,0.25)', borderRadius: '10px', padding: '13px', textAlign: 'center' }}>
          <p style={{ fontSize: '13px', fontWeight: 800, color: 'var(--yellow)', marginBottom: '4px' }}>📱 Check your phone!</p>
          <p style={{ fontSize: '11px', color: 'var(--text3)' }}>Enter your MoMo PIN to approve payment</p>
        </div>
      ) : status === 'paid' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '11px 14px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '10px' }}>
          <CheckCircle size={15} color="var(--green)" /><p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--green)' }}>Payment successful! ✓</p>
        </div>
      ) : status === 'failed' || status === 'timeout' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px' }}>
            <AlertCircle size={14} color="var(--red)" /><p style={{ fontSize: '12px', color: 'var(--red)', fontWeight: 600 }}>{status === 'timeout' ? 'Payment timed out' : 'Payment failed'} — try again</p>
          </div>
          <button onClick={onPay} disabled={payingId === order.id} style={{ width: '100%', padding: '12px', background: 'var(--yellow)', border: 'none', borderRadius: '10px', fontWeight: 800, fontSize: '14px', color: '#0a0a0a', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif' }}>Retry Payment</button>
        </div>
      ) : status === 'requesting' ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px' }}>
          <div style={{ width: '20px', height: '20px', border: '3px solid var(--border)', borderTopColor: 'var(--yellow)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        </div>
      ) : (
        <button onClick={onPay} disabled={payingId === order.id} style={{ width: '100%', padding: '13px', background: 'var(--yellow)', border: 'none', borderRadius: '10px', fontWeight: 800, fontSize: '15px', color: '#0a0a0a', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          💳 Pay {(order.predicted_price || 0).toLocaleString()} RWF with MoMo
        </button>
      )}
    </div>
  );
}


// ── Food Order Card ───────────────────────────────────────────
function FoodOrderCard({ order, onConfirmFood, confirmingId }: { order: any; onConfirmFood?: (id: string) => void; confirmingId?: string | null }) {
  const statusColors: Record<string, string> = {
    pending:    '#f5c518',
    accepted:   '#3b82f6',
    in_transit: '#8b5cf6',
    delivered:  '#22c55e',
    cancelled:  '#ef4444',
  };
  const statusEmoji: Record<string, string> = {
    pending:    '🔍',
    accepted:   '🏍️',
    in_transit: '🛵',
    delivered:  '🎉',
    cancelled:  '❌',
  };
  const statusLabel: Record<string, string> = {
    pending:    'Finding a Driver',
    accepted:   'Driver on the way',
    in_transit: 'Order in Transit',
    delivered:  'Delivered!',
    cancelled:  'Cancelled',
  };
  const color = statusColors[order.status] || '#f5c518';
  const items = Array.isArray(order.items) ? order.items : [];

  return (
    <div style={{ background: 'var(--card)', borderRadius: '16px', overflow: 'hidden', marginBottom: '16px', border: `1px solid ${color}44` }}>
      {/* Header */}
      <div style={{ background: `${color}14`, padding: '12px 16px', borderBottom: `1px solid ${color}33`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '22px' }}>{statusEmoji[order.status] || '🛒'}</span>
          <div>
            <p style={{ fontWeight: 800, fontSize: '14px', color }}>🛍️ Shop — {statusLabel[order.status] || order.status}</p>
            <p style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '1px' }}>#{(order.id as string).slice(0, 8)}</p>
          </div>
        </div>
        <p style={{ fontWeight: 800, fontSize: '18px', color: 'var(--yellow)' }}>{(order.total || 0).toLocaleString()} RWF</p>
      </div>

      {/* Progress bar */}
      {order.status !== 'cancelled' && (
        <div style={{ padding: '10px 16px', background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            {['Ordered', 'Driver Coming', 'In Transit', 'Delivered'].map((step, i) => {
              const stepMap: Record<string, number> = { pending: 0, accepted: 1, in_transit: 2, delivered: 3 };
              const current = stepMap[order.status] ?? 0;
              const done = i < current, active = i === current;
              return (
                <div key={step} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                  <div style={{ width: '22px', height: '22px', borderRadius: '50%', marginBottom: '4px', background: done ? '#22c55e' : active ? color : 'var(--border2)', border: `2px solid ${done ? '#22c55e' : active ? color : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {done ? <span style={{ fontSize: '9px', color: '#fff' }}>✓</span> : <span style={{ color: active ? '#fff' : 'var(--text3)', fontSize: '8px', fontWeight: 700 }}>{i + 1}</span>}
                  </div>
                  <p style={{ fontSize: '8px', color: active ? color : done ? 'var(--green)' : 'var(--text3)', fontWeight: active || done ? 700 : 500, textAlign: 'center', lineHeight: 1.2 }}>{step}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Items */}
      <div style={{ padding: '12px 16px' }}>
        <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '8px' }}>🛒 Items</p>
        {items.slice(0, 4).map((item: any, i: number) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
            <span style={{ fontSize: '13px', color: 'var(--text)' }}>{item.name} × {item.qty}</span>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>{(item.price * item.qty).toLocaleString()} RWF</span>
          </div>
        ))}
        {items.length > 4 && <p style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>+{items.length - 4} more items</p>}

        <div style={{ borderTop: '1px solid var(--border)', marginTop: '10px', paddingTop: '10px', display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '13px', color: 'var(--text3)' }}>Delivery fee</span>
          <span style={{ fontSize: '13px', color: 'var(--text)' }}>{(order.delivery_fee || 0).toLocaleString()} RWF</span>
        </div>

        {/* Delivery address */}
        {order.delivery_address && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '10px', padding: '8px 12px', background: 'var(--bg3)', borderRadius: '8px' }}>
            <MapPin size={12} color="var(--text3)" />
            <span style={{ fontSize: '12px', color: 'var(--text3)' }}>{order.delivery_address}</span>
          </div>
        )}

        {/* Driver info */}
        {order.drivers?.profiles?.full_name && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', padding: '10px 12px', background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '10px' }}>
            <div>
              <p style={{ fontSize: '10px', color: 'var(--blue)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '2px' }}>🏍️ Driver</p>
              <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>{order.drivers.profiles.full_name}</p>
              <p style={{ fontSize: '11px', color: 'var(--text3)' }}>Plate: {order.drivers.plate_number}</p>
            </div>
            <a href={`tel:${order.drivers.profiles.phone_number}`} style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '8px', padding: '7px 11px', color: 'var(--blue)', textDecoration: 'none', fontSize: '12px', fontWeight: 700 }}>
              <Phone size={11} /> Call
            </a>
          </div>
        )}

        {/* Confirm receipt for food orders */}
        {(order.status === 'in_transit' || order.status === 'delivered') && !order.receiver_confirmed && (
          <button onClick={() => onConfirmFood && onConfirmFood(order.id)}
            style={{ width: '100%', marginTop: '12px', padding: '12px', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: '12px', color: 'var(--green)', cursor: 'pointer', fontWeight: 800, fontSize: '13px', fontFamily: 'Space Grotesk, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <CheckCircle size={15} /> ✅ Confirm I received my order
          </button>
        )}
        {order.receiver_confirmed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '10px', marginTop: '10px' }}>
            <CheckCircle size={14} color="var(--green)" />
            <div>
              <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--green)' }}>You confirmed receipt ✓</p>
              {order.driver_rating > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginTop: '3px' }}>
                  {[1,2,3,4,5].map((s: number) => <Star key={s} size={12} color={s <= order.driver_rating ? '#f5c518' : 'var(--border2)'} fill={s <= order.driver_rating ? '#f5c518' : 'none'} />)}
                </div>
              )}
            </div>
          </div>
        )}

        <p style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '10px', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Clock size={9} /> Ordered {new Date(order.created_at).toLocaleString()}
        </p>
      </div>
    </div>
  );
}

// ── Completed order card ──────────────────────────────────────
function CompletedOrderCard({ order }: { order: any }) {
  const cfg = STATUS_CONFIG[order.status] || STATUS_CONFIG['delivered'];
  return (
    <div style={{ background: 'var(--card)', borderRadius: '14px', padding: '14px 16px', marginBottom: '10px', border: '1px solid var(--border)', opacity: 0.8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '18px' }}>{cfg.emoji}</span>
          <div>
            <p style={{ fontSize: '13px', fontWeight: 700, color: cfg.color }}>{cfg.label}</p>
            <p style={{ fontSize: '10px', color: 'var(--text3)', fontFamily: 'monospace' }}>#{order.id.slice(0, 8)}</p>
          </div>
        </div>
        <p style={{ fontWeight: 800, fontSize: '15px', color: 'var(--yellow)' }}>{(order.predicted_price || 0).toLocaleString()} RWF</p>
      </div>
      <p style={{ fontSize: '12px', color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
        <MapPin size={9} /> {order.sender_location} → {order.receiver_location}
      </p>
      <p style={{ fontSize: '11px', color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: '4px' }}>
        <Clock size={9} /> {new Date(order.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
        {order.receiver_confirmed && <span style={{ marginLeft: '8px', color: 'var(--green)', fontWeight: 700 }}>· Receipt confirmed ✓</span>}
      </p>
    </div>
  );
}