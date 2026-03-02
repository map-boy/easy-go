import { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Package, Clock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

// Fix Leaflet icon bug
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const myIcon = L.divIcon({
  className: '',
  html: `
    <div style="position:relative;width:44px;height:44px;display:flex;align-items:center;justify-content:center;">
      <div style="position:absolute;width:44px;height:44px;background:rgba(59,130,246,0.15);border-radius:50%;animation:ripple 2s ease infinite;"></div>
      <div style="position:absolute;width:28px;height:28px;background:rgba(59,130,246,0.25);border-radius:50%;animation:ripple 2s ease infinite .5s;"></div>
      <div style="width:18px;height:18px;background:#2563eb;border-radius:50%;border:3px solid #ffffff;box-shadow:0 0 0 2px #2563eb,0 4px 12px rgba(37,99,235,0.6);position:relative;z-index:1;"></div>
    </div>
  `,
  iconSize: [44, 44],
  iconAnchor: [22, 22],
});

function MapFollower({ position }: { position: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(position, map.getZoom(), { animate: true });
  }, [position]);
  return null;
}

function isClearlyWrong(lat: number, lng: number) {
  return lat > 15 || lat < -20 || lng < 20 || lng > 52;
}

const KIGALI: [number, number] = [-1.9441, 30.0619];

const MAP_STYLES = [
  { label: '🗺️ Street',    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',                                           attribution: '© OpenStreetMap' },
  { label: '🏙️ Detailed',  url: 'https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png',                                      attribution: '© OpenStreetMap France' },
  { label: '🛰️ Satellite', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution: '© Esri' },
  { label: '🌍 Topo',      url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',                                              attribution: '© OpenTopoMap' },
  { label: '🌙 Dark',      url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',                                 attribution: '© CARTO' },
  { label: '☀️ Light',     url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',                                attribution: '© CARTO' },
];

export function HomeTab() {
  const { profile } = useAuth();

  const [myLocation, setMyLocation]           = useState<[number, number] | null>(null);
  const [locationName, setLocationName]       = useState('Getting location…');
  const [accuracy, setAccuracy]               = useState<number | null>(null);
  const [gpsWarning, setGpsWarning]           = useState(false);
  const [stats, setStats]                     = useState({ total: 0, delivered: 0, pending: 0, active: 0 });
  const [recentOrders, setRecentOrders]       = useState<any[]>([]);
  const [loading, setLoading]                 = useState(true);
  const [mapStyle, setMapStyle]               = useState(0);
  const [showStylePicker, setShowStylePicker] = useState(false);
  const watchRef                              = useRef<number | null>(null);

  const isDriver   = (profile as any)?.user_category === 'motari' || profile?.role === 'driver';
  const isReceiver = (profile as any)?.user_category === 'receiver' || profile?.role === 'receiver';

  useEffect(() => {
    startGPS();
    if (profile) {
      loadStats();
      loadRecentOrders();
    }
    return () => {
      if (watchRef.current !== null) {
        navigator.geolocation.clearWatch(watchRef.current);
      }
    };
  }, [profile?.id]);

  function startGPS() {
    if (!navigator.geolocation) {
      setLocationName('GPS not supported');
      return;
    }

    // Fast first fix
    navigator.geolocation.getCurrentPosition(
      (pos) => handlePosition(pos),
      () => setLocationName('Location access denied'),
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
    );

    // High accuracy continuous watch
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => handlePosition(pos),
      () => {},
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
    );
  }

  function handlePosition(pos: GeolocationPosition) {
    const { latitude, longitude, accuracy: acc } = pos.coords;

    if (isClearlyWrong(latitude, longitude)) {
      // Silently ignore wrong location — no banner shown
      setGpsWarning(true);
      setAccuracy(Math.round(acc));
      return;
    }

    setGpsWarning(false);
    setMyLocation([latitude, longitude]);
    setAccuracy(Math.round(acc));
    reverseGeocode(latitude, longitude);
  }

  async function reverseGeocode(lat: number, lng: number) {
    try {
      const res  = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`
      );
      const data = await res.json();
      const parts = [
        data.address?.village       ||
        data.address?.suburb        ||
        data.address?.neighbourhood ||
        data.address?.quarter,
        data.address?.city  ||
        data.address?.town  ||
        data.address?.county,
      ].filter(Boolean);
      setLocationName(
        parts.join(', ') ||
        data.display_name?.split(',').slice(0, 2).join(', ') ||
        'Rwanda'
      );
    } catch {
      setLocationName(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
    }
  }

  async function loadStats() {
    if (!profile) return;

    if (isDriver) {
      const { data: driverRow } = await supabase
        .from('drivers')
        .select('id')
        .eq('user_id', profile.id)
        .maybeSingle();

      if (driverRow) {
        const { data: driverOrders } = await supabase
          .from('orders')
          .select('status')
          .eq('driver_id', driverRow.id);

        const all = driverOrders || [];
        setStats({
          total:     all.length,
          delivered: all.filter(o => o.status === 'delivered').length,
          active:    all.filter(o => ['accepted', 'paid', 'in_transit'].includes(o.status)).length,
          pending:   0,
        });
      }
    } else {
      const { data } = await supabase
        .from('orders')
        .select('status')
        .or(`sender_id.eq.${profile.id},receiver_id.eq.${profile.id}`);
      const all = data || [];
      setStats({
        total:     all.length,
        delivered: all.filter(o => o.status === 'delivered').length,
        pending:   all.filter(o => o.status === 'pending').length,
        active:    all.filter(o => ['accepted', 'paid', 'in_transit'].includes(o.status)).length,
      });
    }
  }

  async function loadRecentOrders() {
    if (!profile) return;
    setLoading(true);

    let query = supabase
      .from('orders')
      .select('id, status, sender_location, receiver_location, predicted_price, created_at')
      .order('created_at', { ascending: false })
      .limit(3);

    if (isDriver) {
      const { data: driverRow } = await supabase
        .from('drivers').select('id').eq('user_id', profile.id).maybeSingle();
      if (driverRow) {
        query = query.eq('driver_id', driverRow.id);
      } else {
        setRecentOrders([]);
        setLoading(false);
        return;
      }
    } else {
      query = query.or(`sender_id.eq.${profile.id},receiver_id.eq.${profile.id}`);
    }

    const { data } = await query;
    setRecentOrders(data || []);
    setLoading(false);
  }

  const mapCenter: [number, number] = myLocation || KIGALI;

  const sCls: Record<string, string> = {
    pending:    'badge-yellow',
    accepted:   'badge-blue',
    paid:       'badge-green',
    in_transit: 'badge-blue',
    delivered:  'badge-green',
    cancelled:  'badge-red',
  };

  const kpiCards = isDriver ? [
    { label: 'Total Jobs',  value: stats.total,     color: 'var(--blue)',   emoji: '📋' },
    { label: 'Active',      value: stats.active,    color: 'var(--yellow)', emoji: '🚀' },
    { label: 'Delivered',   value: stats.delivered, color: 'var(--green)',  emoji: '✅' },
    { label: 'Earnings',    value: '—',             color: '#a855f7',       emoji: '💰' },
  ] : [
    { label: 'Total Orders', value: stats.total,     color: 'var(--blue)',   emoji: '📦' },
    { label: 'Active',       value: stats.active,    color: 'var(--yellow)', emoji: '🚀' },
    { label: 'Delivered',    value: stats.delivered, color: 'var(--green)',  emoji: '✅' },
    { label: 'Pending',      value: stats.pending,   color: '#f97316',       emoji: '⏳' },
  ];

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100%' }}>

      <style>{`
        @keyframes ripple {
          0%   { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(2.8); opacity: 0; }
        }
        @keyframes pdot {
          0%,100% { opacity:1; transform:scale(1); }
          50%     { opacity:.4; transform:scale(.65); }
        }
      `}</style>

      {/* ── LIVE MAP ── */}
      <div style={{ position: 'relative', height: '300px', width: '100%' }}>

        <MapContainer
          center={mapCenter}
          zoom={myLocation ? 16 : 13}
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
          scrollWheelZoom={true}
          attributionControl={false}
        >
          <TileLayer
            url={MAP_STYLES[mapStyle].url}
            attribution={MAP_STYLES[mapStyle].attribution}
            maxZoom={19}
          />

          {myLocation && (
            <>
              <MapFollower position={myLocation} />
              <Marker position={myLocation} icon={myIcon}>
                <Popup>
                  <div style={{ fontFamily: 'Space Grotesk, sans-serif', minWidth: '160px' }}>
                    <p style={{ fontWeight: 700, fontSize: '13px', marginBottom: '4px' }}>📍 You are here</p>
                    <p style={{ fontSize: '12px', color: '#555', marginBottom: '4px' }}>{locationName}</p>
                    {accuracy && (
                      <p style={{ fontSize: '11px', color: '#888' }}>GPS accuracy: ±{accuracy}m</p>
                    )}
                    <p style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>
                      {myLocation[0].toFixed(5)}, {myLocation[1].toFixed(5)}
                    </p>
                  </div>
                </Popup>
              </Marker>
            </>
          )}
        </MapContainer>

        {/* LIVE badge */}
        <div style={{ position: 'absolute', top: '12px', left: '12px', zIndex: 999, background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)', borderRadius: '20px', padding: '5px 12px', display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid rgba(34,197,94,0.4)', boxShadow: '0 2px 8px rgba(0,0,0,0.12)' }}>
          <div style={{ width: '7px', height: '7px', background: '#22c55e', borderRadius: '50%', animation: 'pdot 1.6s ease infinite' }} />
          <span style={{ fontSize: '11px', color: '#111', fontWeight: 700, letterSpacing: '.06em' }}>LIVE GPS</span>
        </div>

        {/* Map style switcher */}
        <div style={{ position: 'absolute', top: '12px', right: '12px', zIndex: 999 }}>
          <button
            onClick={() => setShowStylePicker(!showStylePicker)}
            style={{ background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)', border: '1px solid rgba(0,0,0,0.15)', borderRadius: '10px', padding: '6px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: 700, color: '#111', fontFamily: 'Space Grotesk, sans-serif', boxShadow: '0 2px 8px rgba(0,0,0,0.12)', display: 'flex', alignItems: 'center', gap: '5px' }}
          >
            {MAP_STYLES[mapStyle].label} ▾
          </button>

          {showStylePicker && (
            <div style={{ position: 'absolute', top: '38px', right: 0, background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(12px)', border: '1px solid rgba(0,0,0,0.12)', borderRadius: '12px', padding: '6px', minWidth: '150px', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', gap: '3px', zIndex: 9999 }}>
              {MAP_STYLES.map((s, i) => (
                <button
                  key={s.label}
                  onClick={() => { setMapStyle(i); setShowStylePicker(false); }}
                  style={{ background: mapStyle === i ? '#f5c518' : 'transparent', border: 'none', borderRadius: '8px', padding: '8px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: 700, color: mapStyle === i ? '#0a0a0a' : '#333', fontFamily: 'Space Grotesk, sans-serif', textAlign: 'left', width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  {s.label}
                  {mapStyle === i && <span>✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Location name pill */}
        <div style={{ position: 'absolute', bottom: '12px', left: '50%', transform: 'translateX(-50%)', zIndex: 999, background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)', borderRadius: '20px', padding: '6px 16px', display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid rgba(0,0,0,0.1)', boxShadow: '0 2px 8px rgba(0,0,0,0.12)', whiteSpace: 'nowrap', maxWidth: '85%' }}>
          <MapPin size={11} color="#f5c518" />
          <span style={{ fontSize: '12px', color: '#111', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {locationName}
          </span>
          {accuracy && (
            <span style={{
              fontSize: '10px', padding: '2px 6px', borderRadius: '10px', fontWeight: 600,
              background: accuracy < 30 ? 'rgba(34,197,94,0.1)' : 'rgba(245,197,24,0.1)',
              color:      accuracy < 30 ? '#16a34a'              : '#ca8a04',
            }}>
              ±{accuracy}m
            </span>
          )}
        </div>
      </div>

      {/* ── CONTENT ── */}
      <div style={{ padding: '20px' }}>

        {/* Greeting */}
        <div style={{ marginBottom: '20px' }}>
          <p style={{ fontSize: '13px', color: 'var(--text3)', marginBottom: '3px' }}>👋 Welcome back</p>
          <h2 style={{ fontWeight: 800, fontSize: '22px', color: 'var(--text)', letterSpacing: '-.02em' }}>
            {profile?.full_name || 'User'}
          </h2>
          <p style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '5px', height: '5px', background: 'var(--green)', borderRadius: '50%', display: 'inline-block' }} />
            {isDriver ? '🏍️ Motari' : isReceiver ? '📥 Receiver' : '📤 Sender'} account
          </p>
        </div>

        {/* KPI cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginBottom: '20px' }}>
          {kpiCards.map(k => (
            <div key={k.label} className="card" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px' }}>
              <div style={{ fontSize: '24px' }}>{k.emoji}</div>
              <div>
                <p style={{ fontWeight: 800, fontSize: '20px', color: k.color, lineHeight: 1 }}>{k.value}</p>
                <p style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', marginTop: '3px' }}>{k.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Recent orders */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text)' }}>
              {isDriver ? 'Recent Jobs' : 'Recent Orders'}
            </h3>
            <span style={{ fontSize: '12px', color: 'var(--text3)' }}>Last 3</span>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '24px' }}>
              <div className="spinner" />
            </div>
          ) : recentOrders.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '32px' }}>
              <Package size={28} color="var(--text3)" style={{ margin: '0 auto 10px' }} />
              <p style={{ color: 'var(--text3)', fontSize: '14px' }}>
                {isDriver ? 'No jobs yet — go on duty to receive orders' : 'No orders yet'}
              </p>
            </div>
          ) : recentOrders.map(o => (
            <div key={o.id} className="card" style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text)', fontFamily: 'monospace', marginBottom: '3px' }}>
                  #{o.id.slice(0, 8)}
                </p>
                <p style={{ fontSize: '11px', color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <MapPin size={9} /> {o.sender_location} → {o.receiver_location}
                </p>
                <p style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Clock size={9} /> {new Date(o.created_at).toLocaleString()}
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span className={`badge ${sCls[o.status] || 'badge-gray'}`}>{o.status}</span>
                <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--yellow)', marginTop: '5px' }}>
                  {(o.predicted_price || 0).toLocaleString()} RWF
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}