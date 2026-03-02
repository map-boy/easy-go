import { useState, useEffect, useRef } from 'react';
import {
  Package, DollarSign, AlertCircle, CloudRain,
  CheckCircle, User, Search, X, MapPin, ChevronDown,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { predictPrice, isRushHour, haversineKm } from '../../../lib/pricePredictor';

// ── Rwanda districts ───────────────────────────────────────────────────────
const RWANDA_DISTRICTS = [
  'Gasabo','Kicukiro','Nyarugenge',
  'Burera','Gakenke','Gicumbi','Musanze','Rulindo',
  'Gisagara','Huye','Kamonyi','Muhanga','Nyamagabe','Nyanza','Nyaruguru','Ruhango',
  'Bugesera','Gatsibo','Kayonza','Kirehe','Ngoma','Nyagatare','Rwamagana',
  'Karongi','Ngororero','Nyabihu','Nyamasheke','Rubavu','Rusizi','Rutsiro',
];

// ── Country codes ──────────────────────────────────────────────────────────
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
];

// ── Validators ─────────────────────────────────────────────────────────────
function validatePhone(code: string, number: string): string | null {
  const d = number.replace(/\D/g, '');
  if (!d.length) return 'Phone number is required';
  if (code === '+250') {
    if (d.length !== 9) return 'Rwanda numbers need exactly 9 digits after +250';
    if (!['7','2'].includes(d[0])) return 'Must start with 7 or 2';
  } else {
    if (d.length < 7 || d.length > 12) return 'Enter 7–12 digits';
  }
  return null;
}

function validateDistrict(val: string): string | null {
  if (!val.trim()) return 'District is required';
  if (!RWANDA_DISTRICTS.find(d => d.toLowerCase() === val.trim().toLowerCase()))
    return 'Not a valid Rwanda district';
  return null;
}

async function validateLocation(loc: string, district: string) {
  if (!loc.trim()) return { valid: false };
  try {
    const q    = encodeURIComponent(`${loc}, ${district}, Rwanda`);
    const res  = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&countrycodes=rw`, { headers: { 'Accept-Language': 'en' } });
    const data = await res.json();
    if (!data.length) return { valid: false };
    return { valid: true, lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), display: data[0].display_name.split(',').slice(0,3).join(', ') };
  } catch { return { valid: false }; }
}

async function getRoadKm(from: [number,number], to: [number,number]): Promise<number> {
  try {
    const res  = await fetch(`https://router.project-osrm.org/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=false`);
    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes?.[0]) return 5.0;
    return data.routes[0].distance / 1000;
  } catch { return 5.0; }
}

// ── Section header ─────────────────────────────────────────────────────────
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

// ── Phone input ────────────────────────────────────────────────────────────
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

// ── District input ─────────────────────────────────────────────────────────
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

// ── Location input with geocode validation ─────────────────────────────────
function LocationInput({ value, onChange, district, onValidated, error, setError }: {
  value: string; onChange: (v: string) => void; district: string;
  onValidated: (lat: number, lng: number, display: string) => void;
  error?: string | null; setError: (e: string | null) => void;
}) {
  const [checking, setChecking] = useState(false);
  const [verified, setVerified] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    setVerified(false);
    if (!value.trim() || value.length < 4) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setChecking(true);
      const r = await validateLocation(value, district);
      setChecking(false);
      if (r.valid && r.lat && r.lng && r.display) {
        setVerified(true); setError(null); onValidated(r.lat, r.lng, r.display);
      } else {
        setVerified(false); setError('Location not found on map — try a more specific name');
      }
    }, 900);
  }, [value, district]);
  return (
    <div>
      <label className="eg-label">Location / Street</label>
      <div style={{ position: 'relative' }}>
        <MapPin size={13} color="var(--text3)" style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
        <input className="eg-input" placeholder="e.g. KG 11 Ave, Kimihurura" value={value}
          onChange={e => { onChange(e.target.value); setVerified(false); setError(null); }}
          style={{ paddingLeft: '32px', paddingRight: '32px', border: `1px solid ${error ? 'var(--red)' : verified ? 'rgba(34,197,94,0.5)' : 'var(--border2)'}` }} />
        <div style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)' }}>
          {checking && <div className="spinner" style={{ width: '14px', height: '14px' }} />}
          {verified && !checking && <CheckCircle size={14} color="var(--green)" />}
        </div>
      </div>
      {error    && <p style={{ fontSize: '11px', color: 'var(--red)',   marginTop: '5px' }}>⚠️ {error}</p>}
      {verified && <p style={{ fontSize: '11px', color: 'var(--green)', marginTop: '5px' }}>✓ Location verified on map</p>}
    </div>
  );
}

// ── MOMO CHECKLIST ─────────────────────────────────────────────────────────
async function runMomoChecklist(): Promise<{ key: string; label: string; ok: boolean; detail: string }[]> {
  const results = [];

  // 1. Check Edge Function: request-payment exists
  try {
    const { error } = await supabase.functions.invoke('request-payment', {
      body: { __ping: true, orderId: 'test', amount: 0, phoneNumber: '250700000000' },
    });
    results.push({ key: 'fn_request', label: 'Edge Function: request-payment', ok: !error || !error.message?.includes('not found'), detail: error ? error.message : 'Deployed ✓' });
  } catch (e: any) {
    results.push({ key: 'fn_request', label: 'Edge Function: request-payment', ok: false, detail: e.message });
  }

  // 2. Check Edge Function: check-payment exists
  try {
    const { error } = await supabase.functions.invoke('check-payment', {
      body: { __ping: true, paymentId: 'test', orderId: 'test' },
    });
    results.push({ key: 'fn_check', label: 'Edge Function: check-payment', ok: !error || !error.message?.includes('not found'), detail: error ? error.message : 'Deployed ✓' });
  } catch (e: any) {
    results.push({ key: 'fn_check', label: 'Edge Function: check-payment', ok: false, detail: e.message });
  }

  // 3. Check orders table has momo_payment_id column
  try {
    const { data, error } = await supabase.from('orders').select('momo_payment_id, payment_status, sender_paid').limit(1);
    results.push({ key: 'db_cols', label: 'DB columns: momo_payment_id, payment_status, sender_paid', ok: !error, detail: error ? error.message : 'All columns exist ✓' });
  } catch (e: any) {
    results.push({ key: 'db_cols', label: 'DB columns', ok: false, detail: e.message });
  }

  // 4. Check Supabase connection
  try {
    const { error } = await supabase.from('profiles').select('id').limit(1);
    results.push({ key: 'supabase', label: 'Supabase connection', ok: !error, detail: error ? error.message : 'Connected ✓' });
  } catch (e: any) {
    results.push({ key: 'supabase', label: 'Supabase connection', ok: false, detail: e.message });
  }

  return results;
}

// ── MAIN COMPONENT ─────────────────────────────────────────────────────────
export function SenderOrderView({ onPriceRequest }: {
  onPriceRequest?: (tripDetails: {
    dist_to_sender: number; dist_to_receiver: number;
    is_rush_hour: number; bad_weather: number; bad_roads?: number;
  }) => Promise<number | null>;
} = {}) {
  const { profile } = useAuth();

  // ── receiver ──
  const [receiverHasApp,   setReceiverHasApp]   = useState<boolean | null>(null);
  const [searchName,       setSearchName]       = useState('');
  const [searchResults,    setSearchResults]    = useState<any[]>([]);
  const [selectedReceiver, setSelectedReceiver] = useState<any>(null);
  const [manualPhone,      setManualPhone]      = useState({ code: '+250', number: '' });
  const [manualName,       setManualName]       = useState('');
  const [manualDistrict,   setManualDistrict]   = useState('');
  const [manualLocation,   setManualLocation]   = useState('');
  const [manualLocCoords,  setManualLocCoords]  = useState<{ lat: number; lng: number } | null>(null);
  const [phoneErr,         setPhoneErr]         = useState<string | null>(null);
  const [districtErr,      setDistrictErr]      = useState<string | null>(null);
  const [locationErr,      setLocationErr]      = useState<string | null>(null);

  // ── package + conditions ──
  const [packageSize,   setPackageSize]   = useState<'small'|'medium'|'large'>('medium');
  const [packageWeight, setPackageWeight] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('MTN MoMo');
  const [payerName,     setPayerName]     = useState('');
  const [payerPhone,    setPayerPhone]    = useState({ code: '+250', number: '' });
  const [payerPhoneErr, setPayerPhoneErr] = useState<string | null>(null);
  const [weatherCond,   setWeatherCond]   = useState<'normal'|'rain'>('normal');
  const [roadCond,      setRoadCond]      = useState<'good'|'moderate'|'poor'>('good');
  const [emergencyNote, setEmergencyNote] = useState('');

  // ── price ──
  const [predictedPrice, setPredictedPrice] = useState(0);
  const [priceLoading,   setPriceLoading]   = useState(false);
  const [priceReady,     setPriceReady]     = useState(false);
  const [breakdown,      setBreakdown]      = useState<any>(null);
  const [routeKm,        setRouteKm]        = useState<{ d2s: number; s2r: number } | null>(null);

  // ── payment flow ──
  type PayStep = 'requesting'|'pending'|'paid'|'failed'|'timeout'|'error'|null;
  const [paymentStep, setPaymentStep] = useState<PayStep>(null);
  const [loading,     setLoading]     = useState(false);
  const [success,     setSuccess]     = useState(false);

  // ── momo checklist ──
  const [showChecklist,   setShowChecklist]   = useState(false);
  const [checklistItems,  setChecklistItems]  = useState<any[]>([]);
  const [checklistLoading,setChecklistLoading]= useState(false);

  // ── misc ──
  const [senderPos, setSenderPos] = useState<[number,number]>([-1.9441, 30.0619]);
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      pos => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        // Only accept coordinates inside Rwanda/Africa — reject Dublin WiFi triangulation
        const inAfrica = lat >= -30 && lat <= 15 && lng >= 28 && lng <= 46;
        if (inAfrica) {
          setSenderPos([lat, lng]);
        } else {
          console.log('GPS outside Rwanda, using Kigali default');
          setSenderPos([-1.9441, 30.0619]);
        }
      },
      () => setSenderPos([-1.9441, 30.0619])
    );
  }, []);

  // live name search
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

  const allFilled = receiverReady && !!packageWeight && !!paymentMethod && !!payerName && !validatePhone(payerPhone.code, payerPhone.number);

  useEffect(() => {
    if (allFilled) calculatePrice();
    else { setPredictedPrice(0); setPriceReady(false); setBreakdown(null); setRouteKm(null); }
  }, [allFilled, selectedReceiver?.id, manualLocCoords?.lat, packageSize, weatherCond, roadCond]);

  async function calculatePrice() {
    setPriceLoading(true); setPriceReady(false);
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
      let distS2R = 5.0;
      if (receiverHasApp && selectedReceiver?.id) {
        const { data: rp } = await supabase.from('profiles').select('latitude,longitude').eq('id', selectedReceiver.id).maybeSingle();
        if (rp?.latitude && rp?.longitude) distS2R = await getRoadKm(senderPos, [rp.latitude, rp.longitude]);
      } else if (!receiverHasApp && manualLocCoords) {
        distS2R = await getRoadKm(senderPos, [manualLocCoords.lat, manualLocCoords.lng]);
      }
      const rush = isRushHour(); const badWx = weatherCond === 'rain'; const badRoads = roadCond === 'poor';
      // ── Sanity cap: Kigali is ~30km across max. Cap at 50km to prevent insane prices ──
      const safeD2S = Math.min(Math.max(distD2S, 0.5), 50);
      const safeS2R = Math.min(Math.max(distS2R, 0.5), 50);
      console.log(`Distances — Driver→Sender: ${safeD2S.toFixed(2)}km, Sender→Receiver: ${safeS2R.toFixed(2)}km`);
      setRouteKm({ d2s: safeD2S, s2r: safeS2R });

      let base = 0;
      if (onPriceRequest) {
        base = (await onPriceRequest({ dist_to_sender: safeD2S, dist_to_receiver: safeS2R, is_rush_hour: rush ? 1 : 0, bad_weather: badWx ? 1 : 0, bad_roads: badRoads ? 1 : 0 })) ?? 0;
      } else {
        const r = predictPrice({ distDriverToSender: safeD2S, distSenderToReceiver: safeS2R, isRushHour: rush, badWeather: badWx, badRoads: badRoads });
        base = r.totalFrw;
        setBreakdown({ distD2S: safeD2S, distS2R: safeS2R, isHarsh: r.breakdown.isHarsh, rate1: r.breakdown.rate1PerKm, rate2: r.breakdown.rate2PerKm });
      }
      let final = base;
      if (packageSize === 'large') final = Math.round(final * 1.3);
      if (packageSize === 'small') final = Math.round(final * 0.8);
      if (roadCond === 'moderate') final = Math.round(final * 1.1);
      setPredictedPrice(Math.max(final, 1500)); setPriceReady(true);
    } catch (err) {
      console.error(err); setPredictedPrice(3500); setPriceReady(true);
    } finally { setPriceLoading(false); }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || !priceReady) return;
    if (receiverHasApp === false && !validateManualFields()) return;
    setLoading(true);
    try {
      const isNight      = new Date().getHours() >= 18 || new Date().getHours() < 6;
      const receiverName     = receiverHasApp ? selectedReceiver.full_name    : manualName;
      const receiverNumber   = receiverHasApp ? selectedReceiver.phone_number : `${manualPhone.code}${manualPhone.number}`;
      const receiverLocation = receiverHasApp ? selectedReceiver.location     : manualLocation;
      const receiverDistrict = receiverHasApp ? selectedReceiver.district     : manualDistrict;
      const receiverId       = receiverHasApp ? selectedReceiver.id           : null;

      // ── Save order as 'awaiting_payment' — invisible to drivers until paid ──
      const { data: newOrder, error } = await supabase.from('orders').insert({
        sender_id: profile.id, sender_name: (profile as any).full_name,
        sender_number: (profile as any).phone_number,
        sender_location: (profile as any).location, sender_district: (profile as any).district,
        receiver_id: receiverId, receiver_name: receiverName, receiver_number: receiverNumber,
        receiver_location: receiverLocation, receiver_district: receiverDistrict,
        package_size: packageSize, package_weight: packageWeight,
        predicted_price: predictedPrice, payment_method: paymentMethod,
        emergency_note: emergencyNote, is_night_delivery: isNight,
        weather_condition: weatherCond, road_condition: roadCond,
        status: 'awaiting_payment', // hidden from drivers
        sender_paid:   false,
        payer_name:    payerName,
        payer_number:  `${payerPhone.code}${payerPhone.number}`,
      }).select().single();
      if (error) throw error;

      // ── Request MoMo payment ──
      setPaymentStep('requesting');
      const { data: momoData, error: momoErr } = await supabase.functions.invoke('request-payment', {
        body: {
          orderId:     newOrder.id,
          amount:      predictedPrice,
          phoneNumber: `${payerPhone.code}${payerPhone.number}`,
          payerName:   payerName,
        },
      });
      if (momoErr || !momoData?.success) throw new Error(momoData?.error || 'MoMo request failed');

      setPaymentStep('pending');

      // ── Poll every 5 seconds until confirmed ──
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        if (attempts > 24) { // 2 min timeout
          clearInterval(poll);
          setPaymentStep('timeout');
          setLoading(false);
          // Delete unpaid order
          await supabase.from('orders').delete().eq('id', newOrder.id);
          return;
        }
        const { data: checkData } = await supabase.functions.invoke('check-payment', {
          body: { paymentId: momoData.paymentId, orderId: newOrder.id },
        });
        if (checkData?.status === 'SUCCESSFUL') {
          clearInterval(poll);
          setPaymentStep('paid');
          setLoading(false);
          setSuccess(true);
          // Notify receiver if they have app
          if (receiverId) {
            await supabase.from('notifications').insert({
              user_id: receiverId, title: '📦 Package coming your way!',
              body: `${(profile as any).full_name} is sending you a package.`,
              type: 'new_order', order_id: newOrder.id, read: false,
            });
          }
          // Reset form
          setReceiverHasApp(null); setSelectedReceiver(null); setSearchName('');
          setManualName(''); setManualPhone({ code: '+250', number: '' });
          setManualDistrict(''); setManualLocation(''); setManualLocCoords(null);
          setPackageWeight(''); setEmergencyNote('');
        setPayerName(''); setPayerPhone({ code: '+250', number: '' }); setPayerPhoneErr(null);
          setPredictedPrice(0); setPriceReady(false); setBreakdown(null); setRouteKm(null);
          setTimeout(() => { setSuccess(false); setPaymentStep(null); }, 5000);
        } else if (checkData?.status === 'FAILED') {
          clearInterval(poll);
          setPaymentStep('failed');
          setLoading(false);
          await supabase.from('orders').delete().eq('id', newOrder.id);
        }
      }, 5000);
    } catch (err: any) {
      console.error(err);
      setPaymentStep('error');
      setLoading(false);
      alert('Error: ' + err.message);
    }
  }

  // ── Run checklist ──────────────────────────────────────────────────────
  async function handleChecklist() {
    setShowChecklist(true); setChecklistLoading(true);
    const items = await runMomoChecklist();
    setChecklistItems(items); setChecklistLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

      {/* ── MOMO CHECKLIST BLOCK ── */}
      <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showChecklist ? '12px' : 0 }}>
          <div>
            <p style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text)' }}>🔍 MoMo Integration Check</p>
            <p style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>Verify all payment systems are ready</p>
          </div>
          <button type="button" onClick={handleChecklist} disabled={checklistLoading}
            style={{ padding: '7px 14px', background: 'var(--yellow)', border: 'none', borderRadius: '8px', cursor: 'pointer', fontFamily: 'Space Grotesk,sans-serif', fontWeight: 700, fontSize: '12px', color: '#0a0a0a', opacity: checklistLoading ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: '6px' }}>
            {checklistLoading ? <><div className="spinner" style={{ width: '12px', height: '12px' }} /> Checking…</> : 'Run Check'}
          </button>
        </div>

        {showChecklist && !checklistLoading && checklistItems.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {checklistItems.map(item => (
              <div key={item.key} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '9px 12px', background: item.ok ? 'rgba(34,197,94,0.07)' : 'rgba(239,68,68,0.07)', border: `1px solid ${item.ok ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`, borderRadius: '8px' }}>
                <span style={{ fontSize: '14px', flexShrink: 0 }}>{item.ok ? '✅' : '❌'}</span>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: '12px', fontWeight: 700, color: item.ok ? 'var(--green)' : 'var(--red)' }}>{item.label}</p>
                  <p style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>{item.detail}</p>
                </div>
              </div>
            ))}
            <div style={{ marginTop: '6px', padding: '9px 12px', background: checklistItems.every(i => i.ok) ? 'rgba(34,197,94,0.08)' : 'rgba(245,158,11,0.08)', border: `1px solid ${checklistItems.every(i => i.ok) ? 'rgba(34,197,94,0.25)' : 'rgba(245,158,11,0.25)'}`, borderRadius: '8px', textAlign: 'center' }}>
              <p style={{ fontSize: '13px', fontWeight: 700, color: checklistItems.every(i => i.ok) ? 'var(--green)' : 'var(--yellow)' }}>
                {checklistItems.every(i => i.ok)
                  ? '🎉 All systems ready — MoMo payments will work!'
                  : `⚠️ ${checklistItems.filter(i => !i.ok).length} issue(s) found — fix them before testing payments`}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Success banner */}
      {success && (
        <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '10px', padding: '14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <CheckCircle size={18} color="var(--green)" />
          <div>
            <p style={{ fontWeight: 700, fontSize: '14px', color: 'var(--green)' }}>Payment confirmed! Order is live.</p>
            <p style={{ fontSize: '12px', color: 'var(--text3)' }}>A driver will accept your order shortly.</p>
          </div>
        </div>
      )}

      {/* ── RECEIVER ── */}
      <div className="card">
        <Sec icon={User} title="Receiver" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
          {[
            { val: true,  emoji: '📱', label: 'Has Easy GO App', sub: 'Search by name' },
            { val: false, emoji: '👤', label: 'No App',          sub: 'Enter manually' },
          ].map(opt => (
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

        {/* HAS APP */}
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

        {/* NO APP */}
        {receiverHasApp === false && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label className="eg-label">Full Name</label>
              <input className="eg-input" required placeholder="Receiver full name" value={manualName} onChange={e => setManualName(e.target.value)} />
            </div>
            <PhoneInput label="Phone Number" value={manualPhone}
              onChange={v => { setManualPhone(v); setPhoneErr(validatePhone(v.code, v.number)); }} error={phoneErr} />
            <DistrictInput value={manualDistrict}
              onChange={v => { setManualDistrict(v); setDistrictErr(validateDistrict(v)); }} error={districtErr} />
            <LocationInput value={manualLocation} onChange={setManualLocation} district={manualDistrict}
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
      </div>

      {/* ── PAYMENT ── */}
      <div className="card">
        <Sec icon={DollarSign} title="Payment Details" color="var(--green)" />

        {/* Method selector */}
        <p style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '10px', fontWeight: 600 }}>Payment method</p>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          {[{ id:'MTN MoMo',abbr:'MTN',bg:'#FFD600',tc:'#000'},{ id:'Airtel Money',abbr:'AM',bg:'#E30613',tc:'#fff'}].map(m => (
            <div key={m.id} onClick={() => setPaymentMethod(m.id)}
              style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '10px', padding: '12px', borderRadius: '10px', cursor: 'pointer', transition: 'all .15s', background: paymentMethod === m.id ? 'var(--yellow-dim)' : 'var(--bg3)', border: `1px solid ${paymentMethod === m.id ? 'rgba(245,197,24,0.35)' : 'var(--border)'}` }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: m.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: '9px', fontWeight: 900, color: m.tc, fontFamily: 'JetBrains Mono,monospace' }}>{m.abbr}</span>
              </div>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>{m.id}</span>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div style={{ height: '1px', background: 'var(--border)', marginBottom: '16px' }} />

        {/* Payer info */}
        <p style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '10px', fontWeight: 600 }}>
          Who is paying? — MoMo prompt will be sent to this number
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {/* Name on MoMo account */}
          <div>
            <label className="eg-label">Name on {paymentMethod} Account</label>
            <input
              className="eg-input"
              required
              placeholder="Full name registered on MoMo"
              value={payerName}
              onChange={e => setPayerName(e.target.value)}
            />
          </div>

          {/* MoMo phone number */}
          <PhoneInput
            label={`${paymentMethod} Phone Number`}
            value={payerPhone}
            onChange={v => { setPayerPhone(v); setPayerPhoneErr(validatePhone(v.code, v.number)); }}
            error={payerPhoneErr}
          />

          {/* Quick-fill from profile */}
          {(profile as any)?.phone_number && (
            <button
              type="button"
              onClick={() => {
                const raw = ((profile as any).phone_number as string).replace(/\s/g,'');
                const number = raw.startsWith('+') ? raw.slice(raw.indexOf('2')+2) : raw.replace(/^250/,'');
                setPayerName((profile as any).full_name || '');
                setPayerPhone({ code: '+250', number });
                setPayerPhoneErr(null);
              }}
              style={{ alignSelf: 'flex-start', padding: '6px 12px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: '8px', cursor: 'pointer', fontFamily: 'Space Grotesk,sans-serif', fontSize: '11px', fontWeight: 700, color: 'var(--text3)' }}
            >
              👤 Use my account — {(profile as any)?.full_name}
            </button>
          )}

          {/* Preview */}
          {payerName && !validatePhone(payerPhone.code, payerPhone.number) && (
            <div style={{ padding: '10px 14px', background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '20px' }}>{paymentMethod === 'MTN MoMo' ? '🟡' : '🔴'}</span>
              <div>
                <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>{payerName}</p>
                <p style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>
                  {payerPhone.code} {payerPhone.number} · {paymentMethod}
                </p>
              </div>
              <CheckCircle size={16} color="var(--green)" style={{ marginLeft: 'auto', flexShrink: 0 }} />
            </div>
          )}
        </div>
      </div>

      {/* ── CONDITIONS ── */}
      <div className="card">
        <Sec icon={CloudRain} title="Delivery Conditions" color="var(--blue)" />
        <p style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '12px' }}>Added on top of base km price</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div>
            <label className="eg-label">Weather</label>
            <select className="eg-input" value={weatherCond} onChange={e => setWeatherCond(e.target.value as any)} style={{ cursor: 'pointer' }}>
              <option value="normal">☀️ Normal</option>
              <option value="rain">🌧️ Rain (+surge)</option>
            </select>
          </div>
          <div>
            <label className="eg-label">Road</label>
            <select className="eg-input" value={roadCond} onChange={e => setRoadCond(e.target.value as any)} style={{ cursor: 'pointer' }}>
              <option value="good">✅ Good</option>
              <option value="moderate">⚠️ Moderate (+10%)</option>
              <option value="poor">❌ Poor (+surge)</option>
            </select>
          </div>
        </div>
        <div style={{ marginTop: '10px', padding: '9px 12px', background: 'var(--bg3)', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <p style={{ fontSize: '11px', color: 'var(--text3)', lineHeight: 1.7 }}>
            {isRushHour()            && <span style={{ color: 'var(--yellow)', fontWeight: 700 }}>⚡ Rush hour · </span>}
            {weatherCond === 'rain'  && <span style={{ color: '#60a5fa',      fontWeight: 700 }}>🌧️ Rain surge · </span>}
            {roadCond    === 'poor'  && <span style={{ color: 'var(--red)',   fontWeight: 700 }}>❌ Poor road · </span>}
            {roadCond    === 'moderate' && <span style={{ color: '#f97316',   fontWeight: 700 }}>⚠️ Moderate +10% · </span>}
            {!isRushHour() && weatherCond === 'normal' && roadCond === 'good' ? '✅ Normal conditions' : 'Surcharges on km price'}
          </p>
        </div>
      </div>

      {/* ── EMERGENCY NOTE ── */}
      <div className="card">
        <Sec icon={AlertCircle} title="Emergency Note (Optional)" color="var(--red)" />
        <textarea className="eg-input" rows={2} placeholder="Special instructions or emergency contacts…" value={emergencyNote} onChange={e => setEmergencyNote(e.target.value)} style={{ resize: 'none' }} />
      </div>

      {/* ── ROUTE DISTANCES — shown as soon as receiver is confirmed ── */}
      {routeKm && (
        <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px' }}>
          <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: '10px' }}>📍 Route Distance</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            {/* Sender → Receiver */}
            <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
              <p style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>
                📤 You → Receiver
              </p>
              <p style={{ fontSize: '22px', fontWeight: 800, color: 'var(--green)', letterSpacing: '-.02em' }}>
                {routeKm.s2r.toFixed(1)}
                <span style={{ fontSize: '12px', marginLeft: '3px' }}>km</span>
              </p>
              <p style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '3px' }}>
                ~{Math.round(routeKm.s2r * 3)} min drive
              </p>
            </div>
            {/* Driver → Sender */}
            <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
              <p style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>
                🏍️ Driver → You
              </p>
              <p style={{ fontSize: '22px', fontWeight: 800, color: '#f59e0b', letterSpacing: '-.02em' }}>
                {routeKm.d2s.toFixed(1)}
                <span style={{ fontSize: '12px', marginLeft: '3px' }}>km</span>
              </p>
              <p style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '3px' }}>
                ~{Math.round(routeKm.d2s * 3)} min to pickup
              </p>
            </div>
          </div>
          {/* Total route */}
          <div style={{ marginTop: '8px', padding: '9px 14px', background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <p style={{ fontSize: '12px', color: 'var(--text3)', fontWeight: 600 }}>Total trip distance</p>
            <p style={{ fontSize: '14px', fontWeight: 800, color: 'var(--blue)' }}>
              {(routeKm.d2s + routeKm.s2r).toFixed(1)} km
            </p>
          </div>
        </div>
      )}

      {/* ── PRICE ── */}
      {!allFilled ? (
        <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: '14px', padding: '18px', textAlign: 'center' }}>
          <p style={{ fontSize: '13px', color: 'var(--text3)', fontWeight: 600, marginBottom: '12px' }}>📋 Complete all steps to see AI price</p>
          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap' }}>
            {[{ label:'Receiver', done: receiverReady },{ label:'Package', done: !!packageWeight },{ label:'Payer info', done: !!payerName && !validatePhone(payerPhone.code, payerPhone.number) }].map(c => (
              <span key={c.label} style={{ fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: '20px', background: c.done ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.06)', color: c.done ? 'var(--green)' : 'var(--text3)', border: `1px solid ${c.done ? 'rgba(34,197,94,0.25)' : 'var(--border)'}` }}>
                {c.done ? '✓' : '○'} {c.label}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ background: 'var(--yellow-dim)', border: '1px solid rgba(245,197,24,0.25)', borderRadius: '14px', padding: '20px', textAlign: 'center' }}>
          <p style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 600 }}>AI Predicted Price</p>
          {priceLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '10px 0' }}>
              <div className="spinner" /><p style={{ fontSize: '13px', color: 'var(--text3)' }}>Calculating road distance…</p>
            </div>
          ) : (
            <>
              <p style={{ fontWeight: 700, fontSize: '36px', color: 'var(--yellow)', letterSpacing: '-.02em', marginBottom: '4px' }}>
                {predictedPrice.toLocaleString()} <span style={{ fontSize: '16px' }}>RWF</span>
              </p>
              <p style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: breakdown ? '12px' : 0 }}>🤖 ML model · real road km · conditions applied</p>
              {breakdown && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '10px' }}>
                  <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: '8px', padding: '8px' }}>
                    <p style={{ fontSize: '9px', color: '#92400e', fontWeight: 700, textTransform: 'uppercase', marginBottom: '3px' }}>Driver→Sender</p>
                    <p style={{ fontSize: '14px', fontWeight: 800, color: '#f59e0b' }}>{breakdown.distD2S.toFixed(1)} km</p>
                    <p style={{ fontSize: '10px', color: '#78350f' }}>{breakdown.rate1} RWF/km</p>
                  </div>
                  <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: '8px', padding: '8px' }}>
                    <p style={{ fontSize: '9px', color: '#166534', fontWeight: 700, textTransform: 'uppercase', marginBottom: '3px' }}>Sender→Receiver</p>
                    <p style={{ fontSize: '14px', fontWeight: 800, color: '#22c55e' }}>{breakdown.distS2R.toFixed(1)} km</p>
                    <p style={{ fontSize: '10px', color: '#14532d' }}>{breakdown.rate2} RWF/km</p>
                  </div>
                  <div style={{ gridColumn: 'span 2', background: breakdown.isHarsh ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.08)', border: `1px solid ${breakdown.isHarsh ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)'}`, borderRadius: '8px', padding: '8px' }}>
                    <p style={{ fontSize: '12px', fontWeight: 700, color: breakdown.isHarsh ? 'var(--red)' : 'var(--green)' }}>{breakdown.isHarsh ? '⚡ Surge pricing active' : '✅ Normal pricing'}</p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── PAYMENT STATUS MESSAGES ── */}
      {paymentStep === 'requesting' && (
        <div style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '12px', padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="spinner" />
          <p style={{ fontSize: '13px', color: 'var(--blue)', fontWeight: 600 }}>Sending MoMo request to your phone…</p>
        </div>
      )}
      {paymentStep === 'pending' && (
        <div style={{ background: 'rgba(245,197,24,0.08)', border: '1px solid rgba(245,197,24,0.3)', borderRadius: '12px', padding: '16px' }}>
          <p style={{ fontSize: '14px', fontWeight: 800, color: 'var(--yellow)', marginBottom: '6px' }}>📱 Check your phone!</p>
          <p style={{ fontSize: '13px', color: 'var(--text3)', marginBottom: '10px' }}>
            {paymentMethod} sent a request for <strong>{predictedPrice.toLocaleString()} RWF</strong> to <strong>{payerPhone.code} {payerPhone.number}</strong>. Enter your PIN to approve.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div className="spinner" style={{ width: '12px', height: '12px' }} />
            <p style={{ fontSize: '11px', color: 'var(--text3)' }}>Waiting for approval… (up to 2 minutes)</p>
          </div>
        </div>
      )}
      {paymentStep === 'paid' && (
        <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '12px', padding: '16px', textAlign: 'center' }}>
          <p style={{ fontSize: '22px', marginBottom: '6px' }}>✅</p>
          <p style={{ fontSize: '14px', fontWeight: 800, color: 'var(--green)' }}>Payment confirmed!</p>
          <p style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '4px' }}>Your order is live — a driver will accept shortly.</p>
        </div>
      )}
      {paymentStep === 'failed' && (
        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '12px', padding: '16px' }}>
          <p style={{ fontSize: '14px', fontWeight: 800, color: 'var(--red)', marginBottom: '4px' }}>❌ Payment declined or failed</p>
          <p style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '10px' }}>Order cancelled. Check your MoMo balance and try again.</p>
          <button type="button" onClick={() => setPaymentStep(null)} style={{ padding: '8px 16px', background: 'var(--red)', border: 'none', borderRadius: '8px', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '12px' }}>Try Again</button>
        </div>
      )}
      {paymentStep === 'timeout' && (
        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '12px', padding: '16px' }}>
          <p style={{ fontSize: '14px', fontWeight: 800, color: 'var(--red)', marginBottom: '4px' }}>⏱️ Payment timed out</p>
          <p style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '10px' }}>You didn't approve in time. Order was cancelled.</p>
          <button type="button" onClick={() => setPaymentStep(null)} style={{ padding: '8px 16px', background: 'var(--yellow)', border: 'none', borderRadius: '8px', color: '#000', fontWeight: 700, cursor: 'pointer', fontSize: '12px' }}>Try Again</button>
        </div>
      )}

      {/* ── SUBMIT BUTTON — hidden while payment processing ── */}
      {!paymentStep && (
        <button type="submit" className="btn-yellow"
          disabled={loading || priceLoading || !priceReady}
          style={{ fontSize: '15px', padding: '13px' }}>
          {loading       ? 'Processing…'       :
           !priceReady   ? 'Fill all fields first' :
           `📱 Pay ${predictedPrice.toLocaleString()} RWF & Place Order`}
        </button>
      )}

      {priceReady && !paymentStep && (
        <p style={{ fontSize: '11px', color: 'var(--text3)', textAlign: 'center', marginTop: '-6px' }}>
          MoMo prompt will be sent to <strong>{payerPhone.code} {payerPhone.number}</strong> ({payerName})
        </p>
      )}

    </form>
  );
}
