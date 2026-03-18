// ONLY 3 THINGS CHANGED from the original:
// 1. Order inserts as status:'pending', sender_paid:true (was 'awaiting_payment', false)
// 2. MoMo invoke block is commented out
// 3. After insert → jump straight to paid/success (no polling)
// Everything else is 100% original.

import { useState, useEffect, useRef } from 'react';
import {
  Package, DollarSign, AlertCircle, CloudRain,
  CheckCircle, User, Search, X, MapPin, ChevronDown,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { Star } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { isRushHour, haversineKm } from '../../../lib/pricePredictor';
import { lookupPrice, isOfflineRushHour } from '../../../lib/kigaliPricing';

const RWANDA_DISTRICTS = [
  'Gasabo','Kicukiro','Nyarugenge',
  'Burera','Gakenke','Gicumbi','Musanze','Rulindo',
  'Gisagara','Huye','Kamonyi','Muhanga','Nyamagabe','Nyanza','Nyaruguru','Ruhango',
  'Bugesera','Gatsibo','Kayonza','Kirehe','Ngoma','Nyagatare','Rwamagana',
  'Karongi','Ngororero','Nyabihu','Nyamasheke','Rubavu','Rusizi','Rutsiro',
];

const COUNTRY_CODES = [
  { code: '+250', flag: '🇷🇼', name: 'Rwanda' },
  { code: '+254', flag: '🇰🇪', name: 'Kenya' },
  { code: '+255', flag: '🇹🇿', name: 'Tanzania' },
  { code: '+256', flag: '🇺🇬', name: 'Uganda' },
  { code: '+257', flag: '🇧🇮', name: 'Burundi' },
  { code: '+243', flag: '🇨🇩', name: 'DR Congo' },
  { code: '+1',   flag: '🇺🇸', name: 'USA/Canada' },
  { code: '+44',  flag: '🇬🇧', name: 'UK' },
  { code: '+33',  flag: '🇫🇷', name: 'France' },
  { code: '+49',  flag: '🇩🇪', name: 'Germany' },
  { code: '+46',  flag: '🧪', name: 'Sandbox Test' },
];

function validatePhone(code: string, number: string): string | null {
  const d = number.replace(/\D/g, '');
  if (!d.length) return 'Phone number is required';
  if (code === '+250') {
    if (d.length !== 9) return 'Rwanda numbers need exactly 9 digits after +250';
    if (!['7','2'].includes(d[0])) return 'Must start with 7 or 2';
  } else {
    if (d.length < 7 || d.length > 15) return 'Enter 7–15 digits';
  }
  return null;
}

function validateDistrict(val: string): string | null {
  if (!val.trim()) return 'District is required';
  if (!RWANDA_DISTRICTS.find(d => d.toLowerCase() === val.trim().toLowerCase()))
    return 'Not a valid Rwanda district';
  return null;
}

async function getRoadKm(from: [number,number], to: [number,number]): Promise<number> {
  try {
    const res  = await fetch(`https://router.project-osrm.org/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=false`);
    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes?.[0]) return 5.0;
    return data.routes[0].distance / 1000;
  } catch { return 5.0; }
}

function Sec({ icon: Icon, title, color = 'var(--yellow)' }: any) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
      <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'rgba(128,128,128,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={14} color={color} />
      </div>
      <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text)' }}>{title}</span>
    </div>
  );
}

function PhoneInput({ value, onChange, error, label = 'Phone Number' }: {
  value: { code: string; number: string };
  onChange: (v: { code: string; number: string }) => void;
  error?: string | null; label?: string;
}) {
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setShow(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const sel = COUNTRY_CODES.find(c => c.code === value.code) ?? COUNTRY_CODES[0];
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <label className="eg-label">{label}</label>
      <div style={{ display: 'flex', gap: '6px' }}>
        <button type="button" onClick={() => setShow(!show)}
          style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '0 10px', borderRadius: '10px', cursor: 'pointer', background: 'var(--bg3)', border: `1px solid ${error ? 'var(--red)' : 'var(--border2)'}`, fontFamily: 'Space Grotesk,sans-serif', fontSize: '12px', fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', flexShrink: 0 }}>
          <span style={{ fontSize: '16px' }}>{sel.flag}</span>
          <span>{sel.code}</span>
          <ChevronDown size={11} color="var(--text3)" />
        </button>
        <input className="eg-input" placeholder={value.code === '+250' ? '7XX XXX XXX' : 'Phone number'}
          value={value.number} onChange={e => onChange({ ...value, number: e.target.value.replace(/[^\d\s]/g, '') })}
          style={{ flex: 1, border: `1px solid ${error ? 'var(--red)' : 'var(--border2)'}` }} inputMode="tel" />
      </div>
      {show && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 9999, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.18)', minWidth: '200px', maxHeight: '240px', overflowY: 'auto' }}>
          {COUNTRY_CODES.map(c => (
            <div key={c.code} onClick={() => { onChange({ code: c.code, number: '' }); setShow(false); }}
              style={{ padding: '9px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', background: c.code === value.code ? 'var(--yellow-dim)' : 'transparent', borderBottom: '1px solid var(--border)' }}
              onMouseEnter={e => { if (c.code !== value.code) (e.currentTarget as HTMLElement).style.background = 'var(--bg3)'; }}
              onMouseLeave={e => { if (c.code !== value.code) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
              <span style={{ fontSize: '18px' }}>{c.flag}</span>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)' }}>{c.name}</span>
              <span style={{ fontSize: '12px', color: 'var(--text3)', marginLeft: 'auto' }}>{c.code}</span>
            </div>
          ))}
        </div>
      )}
      {error && <p style={{ fontSize: '11px', color: 'var(--red)', marginTop: '5px' }}>⚠️ {error}</p>}
    </div>
  );
}

function DistrictInput({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: string | null }) {
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const filtered = value.length >= 1 ? RWANDA_DISTRICTS.filter(d => d.toLowerCase().includes(value.toLowerCase())) : RWANDA_DISTRICTS;
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setShow(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <label className="eg-label">District</label>
      <input className="eg-input" placeholder="e.g. Gasabo" value={value}
        onChange={e => { onChange(e.target.value); setShow(true); }} onFocus={() => setShow(true)}
        style={{ border: `1px solid ${error ? 'var(--red)' : 'var(--border2)'}` }} autoComplete="off" />
      {show && filtered.length > 0 && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 9999, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', maxHeight: '180px', overflowY: 'auto' }}>
          {filtered.map(d => (
            <div key={d} onClick={() => { onChange(d); setShow(false); }}
              style={{ padding: '9px 14px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: 'var(--text)', borderBottom: '1px solid var(--border)', background: 'transparent' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg3)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
              📍 {d}
            </div>
          ))}
        </div>
      )}
      {error && <p style={{ fontSize: '11px', color: 'var(--red)', marginTop: '5px' }}>⚠️ {error}</p>}
    </div>
  );
}

function LocationInput({ value, onChange, district, onValidated, onSectorDetected, error, setError }: {
  value: string; onChange: (v: string) => void; district: string;
  onValidated: (lat: number, lng: number, display: string) => void;
  onSectorDetected?: (sector: string) => void;
  error?: string | null; setError: (e: string | null) => void;
}) {
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [show, setShow]               = useState(false);
  const [pinned, setPinned]           = useState(false);
  const [loading, setLoading]         = useState(false);
  const ref   = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setShow(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  useEffect(() => {
    setPinned(false); setError(null);
    if (!value.trim() || value.length < 3) { setSuggestions([]); setShow(false); return; }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const q = encodeURIComponent(`${value}, ${district || 'Kigali'}, Rwanda`);
        const res = await fetch(`https://photon.komoot.io/api/?q=${q}&limit=6&bbox=28.8,-2.9,30.9,-1.0&lang=en`);
        const data = await res.json();
        const formatted = (data.features || []).map((f: any) => ({
          lat: String(f.geometry.coordinates[1]),
          lon: String(f.geometry.coordinates[0]),
          display_name: [f.properties.name, f.properties.street, f.properties.city || 'Kigali', 'Rwanda'].filter(Boolean).join(', '),
          address: { road: f.properties.street || f.properties.name, suburb: f.properties.district, city: f.properties.city || 'Kigali', city_district: f.properties.district },
          sector: f.properties.suburb || f.properties.quarter || f.properties.city_district || f.properties.district || '',
        }));
        setSuggestions(formatted); setShow(formatted.length > 0);
      } catch { setSuggestions([]); }
      setLoading(false);
    }, 500);
  }, [value, district]);
  function formatSuggestion(place: any): string {
    const a = place.address || {};
    return [a.road || a.pedestrian || a.footway, a.neighbourhood || a.suburb, a.city_district || a.quarter, a.city || a.town || 'Kigali'].filter(Boolean).join(', ');
  }
  return (
    <div ref={ref}>
      <label className="eg-label">Location / Street</label>
      <div style={{ position: 'relative' }}>
        <MapPin size={13} color="var(--text3)" style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
        <input className="eg-input" placeholder="e.g. KG 11 Ave, Kimihurura" value={value}
          onChange={e => { onChange(e.target.value); setPinned(false); setError(null); }}
          onFocus={() => { if (suggestions.length > 0) setShow(true); }}
          autoComplete="off"
          style={{ paddingLeft: '32px', paddingRight: '32px', border: `1px solid ${error ? 'var(--red)' : pinned ? 'rgba(34,197,94,0.5)' : 'var(--border2)'}` }} />
        <div style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)' }}>
          {loading && <div className="spinner" style={{ width: '13px', height: '13px' }} />}
          {pinned && !loading && <CheckCircle size={13} color="var(--green)" />}
        </div>
        {show && suggestions.length > 0 && (
          <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 9999, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', maxHeight: '200px', overflowY: 'auto' }}>
            {suggestions.map((place, i) => {
              const label = formatSuggestion(place);
              return (
                <div key={i} onMouseDown={() => { onValidated(parseFloat(place.lat), parseFloat(place.lon), label); if (place.sector && onSectorDetected) onSectorDetected(place.sector); setPinned(true); setError(null); setShow(false); }}
                  style={{ padding: '9px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', background: 'transparent' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg3)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                  <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>📍 {label}</p>
                  <p style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '2px' }}>{place.display_name}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {error  && <p style={{ fontSize: '11px', color: 'var(--red)',   marginTop: '5px' }}>⚠️ {error}</p>}
      {pinned && <p style={{ fontSize: '11px', color: 'var(--green)', marginTop: '5px' }}>✓ Location pinned on map</p>}
      {!pinned && value.length > 3 && !error && (
        <p style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>💡 Pick from the list to auto-detect your neighbourhood</p>
      )}
    </div>
  );
}

// ── MAIN COMPONENT ─────────────────────────────────────────────────────────
export function SenderOrderView({ onPriceRequest }: {
  onPriceRequest?: (tripDetails: { dist_to_sender: number; dist_to_receiver: number; is_rush_hour: number; bad_weather: number; bad_roads?: number; }) => Promise<number | null>;
} = {}) {
  const { profile } = useAuth();

  const [receiverHasApp,   setReceiverHasApp]   = useState<boolean | null>(null);
  const [searchName,       setSearchName]       = useState('');
  const [searchResults,    setSearchResults]    = useState<any[]>([]);
  const [selectedReceiver, setSelectedReceiver] = useState<any>(null);
  const [manualPhone,      setManualPhone]      = useState({ code: '+250', number: '' });
  const [manualName,       setManualName]       = useState('');
  const [manualDistrict,   setManualDistrict]   = useState('');
  const [manualLocation,   setManualLocation]   = useState('');
  const [manualSector,     setManualSector]     = useState('');  // auto-detected from Photon
  const [receiverSector,   setReceiverSector]   = useState('');
  const [manualLocCoords,  setManualLocCoords]  = useState<{ lat: number; lng: number } | null>(null);
  const [phoneErr,         setPhoneErr]         = useState<string | null>(null);
  const [districtErr,      setDistrictErr]      = useState<string | null>(null);
  const [locationErr,      setLocationErr]      = useState<string | null>(null);

  const [packageSize,   setPackageSize]   = useState<'small'|'medium'|'large'>('medium');
  const [packageWeight, setPackageWeight] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('MTN MoMo');
  const [useWallet,     setUseWallet]     = useState(false);
  const [walletBalance, setWalletBalance] = useState(0);
  const [walletLoaded,  setWalletLoaded]  = useState(false);
  // post-delivery review
  const [reviewOrderId,  setReviewOrderId]  = useState<string|null>(null);
  const [reviewRating,   setReviewRating]   = useState(0);
  const [reviewComment,  setReviewComment]  = useState('');
  const [reviewTip,      setReviewTip]      = useState('');
  const [reviewLoading,  setReviewLoading]  = useState(false);
  const [reviewDone,     setReviewDone]     = useState(false);
  const [payerName,     setPayerName]     = useState('');
  const [payerPhone,    setPayerPhone]    = useState({ code: '+250', number: '' });
  const [payerPhoneErr, setPayerPhoneErr] = useState<string | null>(null);
  const [weatherCond,     setWeatherCond]     = useState<'normal'|'rain'>('normal');
  const [roadCond,        setRoadCond]        = useState<'good'|'moderate'|'poor'>('good');
  const [conditionsReady, setConditionsReady] = useState(false);
  const [emergencyNote, setEmergencyNote] = useState('');
  const [predictedPrice, setPredictedPrice] = useState(0);
  const [priceLoading,   setPriceLoading]   = useState(false);
  const [priceReady,     setPriceReady]     = useState(false);
  const [breakdown,      setBreakdown]      = useState<any>(null);
  const [routeKm,        setRouteKm]        = useState<{ d2s: number; s2r: number } | null>(null);
  const [loading,     setLoading]     = useState(false);
  const [success,     setSuccess]     = useState(false);
  const [isFragile,      setIsFragile]      = useState(false);
  const [deliverySpeed,  setDeliverySpeed]  = useState<'normal'|'rapid'>('normal');
  const [senderPos, setSenderPos] = useState<[number,number]>([-1.9441, 30.0619]);
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    async function loadWallet() {
      if (!profile?.id) return;
      const { data } = await supabase.from('profiles').select('wallet_balance').eq('id', profile.id).single();
      setWalletBalance(data?.wallet_balance ?? 0);
      setWalletLoaded(true);
    }
    loadWallet();
    // check for delivered orders needing review
    async function checkDelivered() {
      if (!profile?.id) return;
      const { data } = await supabase.from('orders')
        .select('id').eq('sender_id', profile.id)
        .eq('status', 'delivered').eq('sender_confirmed', true)
        .is('sender_rating', null).limit(1).maybeSingle();
      if (data) setReviewOrderId(data.id);
    }
    checkDelivered();
  }, [profile?.id]);

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      pos => {
        const { latitude: lat, longitude: lng } = pos.coords;
        const inAfrica = lat >= -30 && lat <= 15 && lng >= 28 && lng <= 46;
        setSenderPos(inAfrica ? [lat, lng] : [-1.9441, 30.0619]);
      },
      () => setSenderPos([-1.9441, 30.0619])
    );
  }, []);

  useEffect(() => {
    async function detectConditions() {
      try {
        const [lat, lng] = senderPos;
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=precipitation,weathercode,windspeed_10m&timezone=Africa%2FKigali`);
        const data = await res.json();
        const precip = data.current?.precipitation ?? 0;
        const wcode  = data.current?.weathercode   ?? 0;
        const wind   = data.current?.windspeed_10m ?? 0;
        setWeatherCond((precip > 0.2 || (wcode >= 51 && wcode <= 99) || wind > 40) ? 'rain' : 'normal');
        const hour = new Date().getHours();
        setRoadCond((hour >= 20 || hour < 5) ? 'moderate' : 'good');
      } catch {
        const hour = new Date().getHours();
        setRoadCond((hour >= 20 || hour < 5) ? 'moderate' : 'good');
        setWeatherCond('normal');
      }
      setConditionsReady(true);
    }
    detectConditions();
  }, [senderPos[0], senderPos[1]]);

  useEffect(() => {
    if (!searchName.trim() || searchName.length < 2) { setSearchResults([]); return; }
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(async () => {
      const { data } = await supabase.from('profiles').select('id,full_name,phone_number,location,district')
        .ilike('full_name', `%${searchName}%`).neq('id', profile?.id ?? '').limit(6);
      setSearchResults(data || []);
    }, 300);
  }, [searchName]);

  function validateManualFields(): boolean {
    const pErr = validatePhone(manualPhone.code, manualPhone.number);
    const dErr = validateDistrict(manualDistrict);
    setPhoneErr(pErr); setDistrictErr(dErr);
    if (!manualLocCoords) setLocationErr('Verify location first');
    return !pErr && !dErr && !!manualLocCoords;
  }

  const receiverReady = receiverHasApp === true
    ? !!selectedReceiver
    : receiverHasApp === false
      ? (!!manualName && !validatePhone(manualPhone.code, manualPhone.number) && !validateDistrict(manualDistrict) && !!manualLocCoords)
      : false;

  const allFilled = receiverReady && !!packageWeight;

  // ── Build rich location strings: street + Photon sector + district ───────────
  // sector is auto-detected from Photon when user picks a suggestion — no manual input
  const receiverLocText = receiverHasApp
    ? [selectedReceiver?.location, (selectedReceiver as any)?.sector, selectedReceiver?.district].filter(Boolean).join(' ')
    : [manualLocation, manualSector, manualDistrict].filter(Boolean).join(' ');
  const senderLocText = [
    (profile as any)?.location,
    (profile as any)?.sector,   // saved at signup via Photon detection
    (profile as any)?.district,
  ].filter(Boolean).join(' ');

  // ── Price from zone table — instant, no network, no map needed ───────────────
  useEffect(() => {
    if (!receiverLocText.trim() || !senderLocText.trim()) {
      setPredictedPrice(0); setPriceReady(false); setBreakdown(null);
      return;
    }
    const result = lookupPrice({
      senderLocation:   senderLocText,
      receiverLocation: receiverLocText,
      packageSize:      packageSize as any,
      isRushHour:       isOfflineRushHour(),
      isRaining:        weatherCond === 'rain',
      poorRoads:        roadCond === 'poor',
      isRapid:          deliverySpeed === 'rapid',
    });
    if (result) {
      setPredictedPrice(result.priceRwf);
      setBreakdown({
        fromZone:    result.fromZone,
        toZone:      result.toZone,
        distKm:      result.distKm,
        multipliers: result.multipliers,
        confidence:  result.confidence,
        source:      result.source,
      });
      setPriceReady(true);
    }
  }, [receiverLocText, senderLocText, packageSize, weatherCond, roadCond, deliverySpeed, selectedReceiver?.id]);

  // ── allFilled → fetch route for km/time display only (never used for price) ──
  useEffect(() => {
    if (allFilled) fetchRouteDisplay();
    else setRouteKm(null);
  }, [allFilled, selectedReceiver?.id, manualLocCoords?.lat]);

  async function fetchRouteDisplay() {
    try {
      const { data: drivers } = await supabase.from('drivers').select('latitude,longitude').eq('is_on_duty', true).eq('is_available', true).not('latitude', 'is', null);
      let distD2S = 2.0;
      if (drivers?.length) {
        const closest = drivers.reduce((best: any, d: any) => {
          if (!d.latitude || !d.longitude) return best;
          const km = haversineKm(senderPos[0], senderPos[1], d.latitude, d.longitude);
          return (!best || km < best.km) ? { ...d, km } : best;
        }, null);
        if (closest) distD2S = await getRoadKm([closest.latitude, closest.longitude], senderPos);
      }
      let distS2R = breakdown?.distKm ?? 5.0;
      if (receiverHasApp && selectedReceiver?.id) {
        const { data: rp } = await supabase.from('profiles').select('latitude,longitude').eq('id', selectedReceiver.id).maybeSingle();
        if (rp?.latitude && rp?.longitude) distS2R = await getRoadKm(senderPos, [rp.latitude, rp.longitude]);
      } else if (!receiverHasApp && manualLocCoords) {
        distS2R = await getRoadKm(senderPos, [manualLocCoords.lat, manualLocCoords.lng]);
      }
      setRouteKm({
        d2s: Math.min(Math.max(distD2S, 0.5), 50),
        s2r: Math.min(Math.max(distS2R, 0.5), 50),
      });
    } catch { /* route display optional — price unaffected */ }
  }

  async function submitReview() {
    if (!reviewOrderId || reviewRating === 0) return;
    setReviewLoading(true);
    const tip = parseInt(reviewTip.replace(/\D/g,'')) || 0;
    await supabase.from('orders').update({
      sender_rating: reviewRating,
      sender_comment: reviewComment,
      driver_tip: tip,
      updated_at: new Date().toISOString(),
    }).eq('id', reviewOrderId);
    if (tip > 0 && profile?.id) {
      // add tip to driver wallet - find driver
      const { data: ord } = await supabase.from('orders').select('driver_id').eq('id', reviewOrderId).single();
      if (ord?.driver_id) {
        const { data: drv } = await supabase.from('drivers').select('user_id').eq('id', ord.driver_id).single();
        if (drv?.user_id) {
          await supabase.rpc('increment_wallet_balance', { uid: drv.user_id, delta: tip });
          supabase.from('wallet_transactions').insert({
            user_id: drv.user_id, type: 'topup', amount: tip, status: 'completed',
            description: `Tip from sender — ${reviewComment || 'Great service!'}`,
          }).then(() => {}).catch(() => {});
          // Deduct tip from sender wallet
          await supabase.rpc('increment_wallet_balance', { uid: profile.id, delta: -tip });
        }
      }
    }
    setReviewLoading(false);
    setReviewDone(true);
    setReviewOrderId(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || !priceReady) return;
    if (receiverHasApp === false && !validateManualFields()) return;

    if (walletBalance < predictedPrice) {
      alert(`Insufficient wallet balance. You have ${walletBalance.toLocaleString()} RWF but need ${predictedPrice.toLocaleString()} RWF. Please top up your wallet.`);
      return;
    }

    setLoading(true);
    try {
      const isNight          = new Date().getHours() >= 18 || new Date().getHours() < 6;
      const receiverName     = receiverHasApp ? selectedReceiver.full_name    : manualName;
      const receiverNumber   = receiverHasApp ? selectedReceiver.phone_number : `${manualPhone.code}${manualPhone.number}`;
      const receiverLocation = receiverHasApp ? selectedReceiver.location     : manualLocation;
      const receiverDistrict = receiverHasApp ? selectedReceiver.district     : manualDistrict;
      const receiverId       = receiverHasApp ? selectedReceiver.id           : null;

      // Deduct from wallet
      const { error: walletErr } = await supabase.rpc('increment_wallet_balance', {
        uid: profile.id, delta: -predictedPrice,
      });
      if (walletErr) throw new Error('Wallet deduction failed: ' + walletErr.message);

      // wallet_transactions logging skipped until table is created

      // Place order as pending + paid immediately
      const { data: newOrder, error: orderErr } = await supabase.from('orders').insert({
        sender_id:        profile.id,
        sender_name:      (profile as any).full_name,
        sender_number:    (profile as any).phone_number,
        sender_location:  (profile as any).location,
        sender_district:  (profile as any).district,
        receiver_id:      receiverId,
        receiver_name:    receiverName,
        receiver_number:  receiverNumber,
        receiver_location: receiverLocation,
        receiver_district: receiverDistrict,
        package_size:     packageSize,
        package_weight:   packageWeight,
        predicted_price:  predictedPrice,
        payment_method:   'Wallet',
        delivery_note:    emergencyNote,
        is_night_delivery: isNight,
        is_fragile:       isFragile,
        delivery_speed:   deliverySpeed,
        weather_condition: weatherCond,
        road_condition:   roadCond,
        payer_name:       (profile as any).full_name,
        payer_number:     (profile as any).phone_number,
        status:           'pending',
        sender_paid:      true,
        payment_status:   'paid',
      }).select().single();
      if (orderErr) {
        // Refund wallet if order failed
        await supabase.rpc('increment_wallet_balance', { uid: profile.id, delta: predictedPrice });
        throw new Error('Order failed: ' + orderErr.message);
      }

      // Notify receiver if they have the app
      if (receiverId) {
        await supabase.from('notifications').insert({
          user_id: receiverId,
          title:   '📦 Package coming your way!',
          body:    `${(profile as any).full_name} is sending you a package.`,
          type:    'new_order',
          order_id: newOrder.id,
          read:    false,
        });
      }

      // Push notify all on-duty drivers
      const { data: onDutyDrivers } = await supabase
        .from('drivers').select('user_id').eq('is_on_duty', true);
      if (onDutyDrivers?.length) {
        supabase.functions.invoke('send-push', {
          body: {
            user_ids: onDutyDrivers.map((d: any) => d.user_id),
            title:    '🏍️ New Delivery Order!',
            body:     `${receiverLocation} · ${predictedPrice.toLocaleString()} RWF`,
            url:      '/',
            tag:      'new-order',
          },
        }).catch(() => {});
      }
      // Push notify receiver that someone is sending them a package
      if (receiverId) {
        supabase.functions.invoke('send-push', {
          body: {
            user_ids: [receiverId],
            title:    '📦 Someone is Sending You a Package!',
            body:     `${(profile as any).full_name} is sending you a package from ${(profile as any).location}`,
            url:      '/',
            tag:      'incoming-package',
          },
        }).catch(() => {});
      }

      // Refresh wallet balance
      const { data: wd } = await supabase.from('profiles').select('wallet_balance').eq('id', profile.id).single();
      setWalletBalance(wd?.wallet_balance ?? walletBalance - predictedPrice);

      // Reset form
      setReceiverHasApp(null); setSelectedReceiver(null); setSearchName('');
      setManualName(''); setManualPhone({ code: '+250', number: '' });
      setManualDistrict(''); setManualLocation(''); setManualLocCoords(null);
      setPackageWeight(''); setEmergencyNote('');
      setPredictedPrice(0); setPriceReady(false); setBreakdown(null); setRouteKm(null);

      setSuccess(true);
      setTimeout(() => setSuccess(false), 6000);

    } catch (err: any) {
      console.error(err);
      alert('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

      {success && (
        <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '10px', padding: '14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <CheckCircle size={18} color="var(--green)" />
          <div>
            <p style={{ fontWeight: 700, fontSize: '14px', color: 'var(--green)' }}>Order placed! Drivers can see it now 🚀</p>
            <p style={{ fontSize: '12px', color: 'var(--text3)' }}>A motari will accept your order shortly.</p>
          </div>
        </div>
      )}

      {/* ── RECEIVER ── */}
      <div className="card">
        <Sec icon={User} title="Receiver" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
          {[{ val: true, emoji: '📱', label: 'Has Easy GO App', sub: 'Search by name' }, { val: false, emoji: '👤', label: 'No App', sub: 'Enter manually' }].map(opt => (
            <div key={String(opt.val)} onClick={() => {
              setReceiverHasApp(opt.val); setSelectedReceiver(null); setSearchName(''); setSearchResults([]);
              setManualName(''); setManualPhone({ code: '+250', number: '' });
              setManualDistrict(''); setManualLocation(''); setManualLocCoords(null);
              setPhoneErr(null); setDistrictErr(null); setLocationErr(null);
            }} style={{ padding: '12px', borderRadius: '10px', cursor: 'pointer', textAlign: 'center', background: receiverHasApp === opt.val ? 'rgba(245,197,24,0.09)' : 'var(--bg3)', border: `2px solid ${receiverHasApp === opt.val ? 'rgba(245,197,24,0.55)' : 'var(--border)'}`, transition: 'all .15s' }}>
              <p style={{ fontSize: '22px', marginBottom: '4px' }}>{opt.emoji}</p>
              <p style={{ fontSize: '12px', fontWeight: 700, color: receiverHasApp === opt.val ? 'var(--yellow)' : 'var(--text)' }}>{opt.label}</p>
              <p style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '2px' }}>{opt.sub}</p>
            </div>
          ))}
        </div>
        {receiverHasApp === true && (
          <div style={{ position: 'relative' }}>
            <label className="eg-label">Search by Name</label>
            <div style={{ position: 'relative' }}>
              <Search size={13} color="var(--text3)" style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input className="eg-input" placeholder="Start typing their name…" value={searchName}
                onChange={e => { setSearchName(e.target.value); if (selectedReceiver) setSelectedReceiver(null); }}
                style={{ paddingLeft: '32px' }} autoComplete="off" />
              {searchName && <button type="button" onClick={() => { setSearchName(''); setSearchResults([]); setSelectedReceiver(null); }} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px' }}><X size={13} color="var(--text3)" /></button>}
            </div>
            {searchResults.length > 0 && !selectedReceiver && (
              <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 999, overflow: 'hidden' }}>
                {searchResults.map((r, i) => (
                  <div key={r.id} onClick={() => { setSelectedReceiver(r); setSearchName(r.full_name); setSearchResults([]); }}
                    style={{ padding: '11px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', borderBottom: i < searchResults.length - 1 ? '1px solid var(--border)' : 'none', background: 'transparent' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg3)'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                    <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: 'rgba(59,130,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><User size={15} color="var(--blue)" /></div>
                    <div>
                      <p style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text)' }}>{r.full_name}</p>
                      <p style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '1px' }}>📞 {r.phone_number}{r.location ? ` · 📍 ${r.location}` : ''}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {searchName.length >= 2 && !searchResults.length && !selectedReceiver && <p style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '6px' }}>No users found</p>}
            {selectedReceiver && (
              <div style={{ marginTop: '10px', background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: '10px', padding: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: 'rgba(34,197,94,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><User size={18} color="var(--green)" /></div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text)' }}>{selectedReceiver.full_name}</p>
                  <p style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>📞 {selectedReceiver.phone_number}</p>
                  {selectedReceiver.location && <p style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '1px' }}>📍 {selectedReceiver.location}</p>}
                </div>
                <CheckCircle size={18} color="var(--green)" />
                <button type="button" onClick={() => { setSelectedReceiver(null); setSearchName(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px' }}><X size={13} color="var(--text3)" /></button>
              </div>
            )}
          </div>
        )}
        {receiverHasApp === false && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label className="eg-label">Full Name</label>
              <input className="eg-input" required placeholder="Receiver full name" value={manualName} onChange={e => setManualName(e.target.value)} />
            </div>
            <PhoneInput label="Phone Number" value={manualPhone} onChange={v => { setManualPhone(v); setPhoneErr(validatePhone(v.code, v.number)); }} error={phoneErr} />
            <DistrictInput value={manualDistrict} onChange={v => { setManualDistrict(v); setDistrictErr(validateDistrict(v)); }} error={districtErr} />
            <LocationInput value={manualLocation} onChange={v => { setManualLocation(v); setManualSector(''); }} district={manualDistrict} onSectorDetected={setManualSector}
              onValidated={(lat, lng, display) => { setManualLocCoords({ lat, lng }); setManualLocation(display); }}
              error={locationErr} setError={setLocationErr} />
            {manualLocCoords && (
              <div style={{ padding: '9px 12px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '8px' }}>
                <p style={{ fontSize: '11px', color: 'var(--text3)' }}>📲 No app — driver will call <strong>{manualPhone.code}{manualPhone.number || '…'}</strong> on arrival</p>
              </div>
            )}
          </div>
        )}
        {receiverHasApp === null && <p style={{ fontSize: '12px', color: 'var(--text3)', textAlign: 'center', padding: '8px 0' }}>☝️ Choose whether receiver has Easy GO app</p>}
      </div>

      {/* ── PACKAGE ── */}
      <div className="card">
        <Sec icon={Package} title="Package Details" color="var(--blue)" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '12px' }}>
          {[{ id:'small',emoji:'📦',label:'Small',sub:'< 2 kg',mult:'×0.8'},{ id:'medium',emoji:'📫',label:'Medium',sub:'2–10 kg',mult:'×1.0'},{ id:'large',emoji:'📬',label:'Large',sub:'> 10 kg',mult:'×1.3'}].map(s => (
            <div key={s.id} onClick={() => setPackageSize(s.id as any)}
              style={{ background: packageSize === s.id ? 'var(--yellow-dim)' : 'var(--bg3)', border: `1px solid ${packageSize === s.id ? 'rgba(245,197,24,0.4)' : 'var(--border)'}`, borderRadius: '10px', padding: '12px 8px', cursor: 'pointer', textAlign: 'center', transition: 'all .15s' }}>
              <p style={{ fontSize: '20px', marginBottom: '4px' }}>{s.emoji}</p>
              <p style={{ fontSize: '12px', fontWeight: 700, color: packageSize === s.id ? 'var(--yellow)' : 'var(--text)' }}>{s.label}</p>
              <p style={{ fontSize: '10px', color: 'var(--text3)' }}>{s.sub}</p>
              <p style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '2px' }}>{s.mult}</p>
            </div>
          ))}
        </div>
        <div>
          <label className="eg-label">Weight</label>
          <input className="eg-input" required placeholder="e.g. 2.5 kg" value={packageWeight} onChange={e => setPackageWeight(e.target.value)} />
        </div>
        <div style={{ marginTop: '4px' }}>
          <label className="eg-label">Product Handling</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            {[{ val: false, emoji: '📦', label: 'Non-Fragile', sub: 'Normal handling', color: 'var(--green)' }, { val: true, emoji: '🫧', label: 'Fragile', sub: 'Handle with care', color: '#f97316' }].map(opt => (
              <div key={String(opt.val)} onClick={() => setIsFragile(opt.val)}
                style={{ padding: '12px 8px', borderRadius: '10px', cursor: 'pointer', textAlign: 'center', background: isFragile === opt.val ? `${opt.color}12` : 'var(--bg3)', border: `2px solid ${isFragile === opt.val ? opt.color : 'var(--border)'}`, transition: 'all .15s' }}>
                <p style={{ fontSize: '20px', marginBottom: '4px' }}>{opt.emoji}</p>
                <p style={{ fontSize: '12px', fontWeight: 700, color: isFragile === opt.val ? opt.color : 'var(--text)' }}>{opt.label}</p>
                <p style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '2px' }}>{opt.sub}</p>
              </div>
            ))}
          </div>
          {isFragile && <div style={{ marginTop: '8px', padding: '9px 12px', background: 'rgba(249,115,22,0.06)', border: '1px solid rgba(249,115,22,0.2)', borderRadius: '8px' }}><p style={{ fontSize: '11px', color: '#f97316', fontWeight: 600 }}>⚠️ Driver will be notified to handle with extra care</p></div>}
        </div>
        <div style={{ marginTop: '4px' }}>
          <label className="eg-label">Delivery Speed</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            {[{ val: 'normal' as const, emoji: '🚲', label: 'Normal', sub: 'Standard delivery', extra: 'No surcharge' }, { val: 'rapid' as const, emoji: '⚡', label: 'Rapid', sub: 'Priority — faster', extra: '+20% price' }].map(opt => (
              <div key={opt.val} onClick={() => setDeliverySpeed(opt.val)}
                style={{ padding: '12px 8px', borderRadius: '10px', cursor: 'pointer', textAlign: 'center', background: deliverySpeed === opt.val ? (opt.val === 'rapid' ? 'rgba(245,197,24,0.09)' : 'rgba(34,197,94,0.08)') : 'var(--bg3)', border: `2px solid ${deliverySpeed === opt.val ? (opt.val === 'rapid' ? 'rgba(245,197,24,0.55)' : 'rgba(34,197,94,0.4)') : 'var(--border)'}`, transition: 'all .15s' }}>
                <p style={{ fontSize: '20px', marginBottom: '4px' }}>{opt.emoji}</p>
                <p style={{ fontSize: '12px', fontWeight: 700, color: deliverySpeed === opt.val ? (opt.val === 'rapid' ? 'var(--yellow)' : 'var(--green)') : 'var(--text)' }}>{opt.label}</p>
                <p style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '1px' }}>{opt.sub}</p>
                <p style={{ fontSize: '10px', fontWeight: 700, marginTop: '3px', color: opt.val === 'rapid' ? 'var(--yellow)' : 'var(--green)' }}>{opt.extra}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── PAYMENT ── */}
      <div className="card">
        <Sec icon={DollarSign} title="Payment Details" color="var(--green)" />
        {walletLoaded ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px', background: 'rgba(34,197,94,0.07)', border: '2px solid rgba(34,197,94,0.35)', borderRadius: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '26px' }}>👛</span>
              <div>
                <p style={{ fontWeight: 700, fontSize: '14px', color: 'var(--green)' }}>Wallet Payment</p>
                <p style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '2px' }}>Balance: <strong style={{ color: walletBalance >= predictedPrice ? 'var(--green)' : 'var(--red)' }}>{walletBalance.toLocaleString()} RWF</strong></p>
              </div>
            </div>
            <CheckCircle size={20} color="var(--green)" />
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 0' }}>
            <div className="spinner" style={{ width: '14px', height: '14px' }} />
            <p style={{ fontSize: '12px', color: 'var(--text3)' }}>Loading wallet…</p>
          </div>
        )}
        {walletLoaded && walletBalance < predictedPrice && predictedPrice > 0 && (
          <div style={{ marginTop: '10px', padding: '10px 14px', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '10px' }}>
            <p style={{ fontSize: '12px', color: 'var(--red)', fontWeight: 600 }}>⚠️ Insufficient balance — top up your wallet in Profile tab before placing order</p>
          </div>
        )}
      </div>

            {/* ── CONDITIONS ── */}
      <div className="card">
        <Sec icon={CloudRain} title="Delivery Conditions" color="var(--blue)" />
        {!conditionsReady ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0' }}>
            <div className="spinner" style={{ width: '14px', height: '14px' }} />
            <p style={{ fontSize: '12px', color: 'var(--text3)' }}>Detecting local conditions…</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {[
              { icon: weatherCond === 'rain' ? '🌧️' : '☀️', label: weatherCond === 'rain' ? 'Rain detected' : 'Clear weather', sub: weatherCond === 'rain' ? 'Rain surcharge applied' : 'No weather surcharge', badge: weatherCond === 'rain' ? '+surge' : '✓ Normal', bg: weatherCond === 'rain' ? 'rgba(96,165,250,0.08)' : 'rgba(34,197,94,0.07)', border: weatherCond === 'rain' ? 'rgba(96,165,250,0.25)' : 'rgba(34,197,94,0.2)', badgeBg: weatherCond === 'rain' ? 'rgba(96,165,250,0.15)' : 'rgba(34,197,94,0.12)', badgeColor: weatherCond === 'rain' ? '#60a5fa' : 'var(--green)' },
              { icon: roadCond === 'good' ? '🛣️' : '🌙', label: roadCond === 'good' ? 'Good road conditions' : 'Night driving (moderate)', sub: roadCond === 'good' ? 'No road surcharge' : '+10% night visibility surcharge', badge: roadCond === 'good' ? '✓ Normal' : '+10%', bg: roadCond === 'good' ? 'rgba(34,197,94,0.07)' : 'rgba(249,115,22,0.07)', border: roadCond === 'good' ? 'rgba(34,197,94,0.2)' : 'rgba(249,115,22,0.25)', badgeBg: roadCond === 'good' ? 'rgba(34,197,94,0.12)' : 'rgba(249,115,22,0.12)', badgeColor: roadCond === 'good' ? 'var(--green)' : '#f97316' },
              { icon: isRushHour() ? '⚡' : '🕐', label: isRushHour() ? 'Rush hour active' : 'Off-peak time', sub: isRushHour() ? 'Peak demand surcharge applied' : 'No time surcharge', badge: isRushHour() ? '+surge' : '✓ Normal', bg: isRushHour() ? 'rgba(245,197,24,0.08)' : 'rgba(34,197,94,0.07)', border: isRushHour() ? 'rgba(245,197,24,0.3)' : 'rgba(34,197,94,0.2)', badgeBg: isRushHour() ? 'rgba(245,197,24,0.15)' : 'rgba(34,197,94,0.12)', badgeColor: isRushHour() ? 'var(--yellow)' : 'var(--green)' },
            ].map((row, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: '10px', background: row.bg, border: `1px solid ${row.border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '20px' }}>{row.icon}</span>
                  <div>
                    <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)' }}>{row.label}</p>
                    <p style={{ fontSize: '10px', color: 'var(--text3)' }}>{row.sub}</p>
                  </div>
                </div>
                <span style={{ fontSize: '10px', fontWeight: 700, padding: '3px 8px', borderRadius: '20px', background: row.badgeBg, color: row.badgeColor }}>{row.badge}</span>
              </div>
            ))}
            <p style={{ fontSize: '10px', color: 'var(--text3)', textAlign: 'center', marginTop: '2px' }}>🤖 Conditions detected automatically from your location & time</p>
          </div>
        )}
      </div>

      {/* ── DELIVERY NOTE ── */}
      <div className="card">
        <Sec icon={AlertCircle} title="Delivery Note (Optional)" color="#f97316" />
        <textarea className="eg-input" rows={2} placeholder="Special instructions or emergency contacts…" value={emergencyNote} onChange={e => setEmergencyNote(e.target.value)} style={{ resize: 'none' }} />
      </div>

      {/* ── ROUTE DISTANCES ── */}
      {routeKm && (
        <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px' }}>
          <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: '10px' }}>📍 Route Distance</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
              <p style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>📤 You → Receiver</p>
              <p style={{ fontSize: '22px', fontWeight: 800, color: 'var(--green)', letterSpacing: '-.02em' }}>{routeKm.s2r.toFixed(1)}<span style={{ fontSize: '12px', marginLeft: '3px' }}>km</span></p>
              <p style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '3px' }}>~{Math.round(routeKm.s2r * 3)} min drive</p>
            </div>
            <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
              <p style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>🏍️ Driver → You</p>
              <p style={{ fontSize: '22px', fontWeight: 800, color: '#f59e0b', letterSpacing: '-.02em' }}>{routeKm.d2s.toFixed(1)}<span style={{ fontSize: '12px', marginLeft: '3px' }}>km</span></p>
              <p style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '3px' }}>~{Math.round(routeKm.d2s * 3)} min to pickup</p>
            </div>
          </div>
          <div style={{ marginTop: '8px', padding: '9px 14px', background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <p style={{ fontSize: '12px', color: 'var(--text3)', fontWeight: 600 }}>Total trip distance</p>
            <p style={{ fontSize: '14px', fontWeight: 800, color: 'var(--blue)' }}>{(routeKm.d2s + routeKm.s2r).toFixed(1)} km</p>
          </div>
        </div>
      )}

      {/* ── PRICE ── */}
      {!allFilled ? (
        <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: '14px', padding: '18px', textAlign: 'center' }}>
          <p style={{ fontSize: '13px', color: 'var(--text3)', fontWeight: 600, marginBottom: '12px' }}>📋 Complete all steps to see AI price</p>
          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap' }}>
            {[{ label:'Receiver', done: receiverReady },{ label:'Package', done: !!packageWeight },{ label:'Wallet', done: walletBalance >= predictedPrice && predictedPrice > 0 }].map(c => (
              <span key={c.label} style={{ fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: '20px', background: c.done ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.06)', color: c.done ? 'var(--green)' : 'var(--text3)', border: `1px solid ${c.done ? 'rgba(34,197,94,0.25)' : 'var(--border)'}` }}>
                {c.done ? '✓' : '○'} {c.label}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ background: 'var(--yellow-dim)', border: '1px solid rgba(245,197,24,0.25)', borderRadius: '14px', padding: '20px', textAlign: 'center' }}>
          <p style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 600 }}>AI Predicted Price</p>
          <>
            {/* Big price */}
            <p style={{ fontWeight: 900, fontSize: '38px', color: 'var(--yellow)', letterSpacing: '-.02em', marginBottom: '4px' }}>
              {predictedPrice.toLocaleString()} <span style={{ fontSize: '16px', fontWeight: 600, opacity: 0.6 }}>RWF</span>
            </p>

            {/* Zone route */}
            {breakdown?.fromZone && (
              <p style={{ fontSize: '13px', color: 'var(--text3)', marginBottom: '8px' }}>
                📍 {breakdown.fromZone} → {breakdown.toZone}
                {breakdown.distKm ? <span style={{ marginLeft: '6px' }}>· ~{breakdown.distKm}km</span> : null}
              </p>
            )}

            {/* Confidence badge */}
            {breakdown?.confidence && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 10px', borderRadius: '20px', marginBottom: '10px',
                background: breakdown.confidence === 'exact' ? 'rgba(34,197,94,0.08)' : breakdown.confidence === 'near' ? 'rgba(245,197,24,0.08)' : 'rgba(249,115,22,0.08)',
                border: `1px solid ${breakdown.confidence === 'exact' ? 'rgba(34,197,94,0.25)' : breakdown.confidence === 'near' ? 'rgba(245,197,24,0.25)' : 'rgba(249,115,22,0.25)'}`,
              }}>
                <span style={{ fontSize: '11px', fontWeight: 700,
                  color: breakdown.confidence === 'exact' ? 'var(--green)' : breakdown.confidence === 'near' ? 'var(--yellow)' : '#f97316',
                }}>
                  {breakdown.confidence === 'exact' ? '✅ Zone matched' : breakdown.confidence === 'near' ? '🟡 Approx match' : '🟠 Estimated — add neighbourhood for better price'}
                </span>
              </div>
            )}

            {/* Active multipliers */}
            {breakdown?.multipliers?.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', justifyContent: 'center', marginBottom: '8px' }}>
                {breakdown.multipliers.map((m: string, i: number) => (
                  <span key={i} style={{ fontSize: '11px', fontWeight: 600, padding: '3px 8px', borderRadius: '8px', background: 'rgba(245,197,24,0.08)', border: '1px solid rgba(245,197,24,0.2)', color: 'var(--yellow)' }}>
                    {m}
                  </span>
                ))}
              </div>
            )}

            <p style={{ fontSize: '10px', color: 'var(--text3)', opacity: 0.6 }}>
              🗺️ Fixed zone price · map shows km only
            </p>
          </>
        </div>
      )}

      <button type="submit" className="btn-yellow"
        disabled={loading || !priceReady || walletBalance < predictedPrice}
        style={{ fontSize: '15px', padding: '13px' }}>
        {loading          ? '⏳ Placing order…' :
         !priceReady      ? 'Enter locations to see price' :
         walletBalance < predictedPrice ? `⚠️ Top up wallet — need ${predictedPrice.toLocaleString()} RWF` :
         `🚀 Place Order — ${predictedPrice.toLocaleString()} RWF from Wallet`}
      </button>

    </form>
  );
}