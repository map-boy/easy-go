import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Bike, ArrowLeft, Eye, EyeOff, MapPin, ChevronDown, ChevronUp, Play } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface AuthProps { onBack: () => void; onDemo?: () => void; }

const AFRICAN_CODES = [
  { code: '+250', flag: '🇷🇼', name: 'Rwanda',       digits: 9  },
  { code: '+254', flag: '🇰🇪', name: 'Kenya',        digits: 9  },
  { code: '+255', flag: '🇹🇿', name: 'Tanzania',     digits: 9  },
  { code: '+256', flag: '🇺🇬', name: 'Uganda',       digits: 9  },
  { code: '+257', flag: '🇧🇮', name: 'Burundi',      digits: 8  },
  { code: '+243', flag: '🇨🇩', name: 'DR Congo',     digits: 9  },
  { code: '+242', flag: '🇨🇬', name: 'Congo',        digits: 9  },
  { code: '+251', flag: '🇪🇹', name: 'Ethiopia',     digits: 9  },
  { code: '+252', flag: '🇸🇴', name: 'Somalia',      digits: 8  },
  { code: '+253', flag: '🇩🇯', name: 'Djibouti',     digits: 8  },
  { code: '+212', flag: '🇲🇦', name: 'Morocco',      digits: 9  },
  { code: '+213', flag: '🇩🇿', name: 'Algeria',      digits: 9  },
  { code: '+216', flag: '🇹🇳', name: 'Tunisia',      digits: 8  },
  { code: '+20',  flag: '🇪🇬', name: 'Egypt',        digits: 10 },
  { code: '+218', flag: '🇱🇾', name: 'Libya',        digits: 9  },
  { code: '+221', flag: '🇸🇳', name: 'Senegal',      digits: 9  },
  { code: '+223', flag: '🇲🇱', name: 'Mali',         digits: 8  },
  { code: '+225', flag: '🇨🇮', name: "Côte d'Ivoire",digits: 10 },
  { code: '+233', flag: '🇬🇭', name: 'Ghana',        digits: 9  },
  { code: '+234', flag: '🇳🇬', name: 'Nigeria',      digits: 10 },
  { code: '+237', flag: '🇨🇲', name: 'Cameroon',     digits: 9  },
  { code: '+260', flag: '🇿🇲', name: 'Zambia',       digits: 9  },
  { code: '+263', flag: '🇿🇼', name: 'Zimbabwe',     digits: 9  },
  { code: '+264', flag: '🇳🇦', name: 'Namibia',      digits: 9  },
  { code: '+265', flag: '🇲🇼', name: 'Malawi',       digits: 9  },
  { code: '+266', flag: '🇱🇸', name: 'Lesotho',      digits: 8  },
  { code: '+267', flag: '🇧🇼', name: 'Botswana',     digits: 8  },
  { code: '+268', flag: '🇸🇿', name: 'Eswatini',     digits: 8  },
  { code: '+27',  flag: '🇿🇦', name: 'South Africa', digits: 9  },
  { code: '+258', flag: '🇲🇿', name: 'Mozambique',   digits: 9  },
  { code: '+261', flag: '🇲🇬', name: 'Madagascar',   digits: 9  },
  { code: '+249', flag: '🇸🇩', name: 'Sudan',        digits: 9  },
  { code: '+211', flag: '🇸🇸', name: 'South Sudan',  digits: 9  },
  { code: '+236', flag: '🇨🇫', name: 'CAR',          digits: 8  },
  { code: '+235', flag: '🇹🇩', name: 'Chad',         digits: 8  },
  { code: '+227', flag: '🇳🇪', name: 'Niger',        digits: 8  },
];

const RWANDA_DISTRICTS = [
  'Bugesera','Burera','Gakenke','Gasabo','Gatsibo','Gicumbi','Gisagara',
  'Huye','Kamonyi','Karongi','Kayonza','Kicukiro','Kirehe','Muhanga',
  'Musanze','Ngoma','Ngororero','Nyabihu','Nyagatare','Nyamagabe',
  'Nyamasheke','Nyanza','Nyarugenge','Nyaruguru','Rubavu','Ruhango',
  'Rulindo','Rusizi','Rutsiro','Rwamagana',
];

function PhoneInput({ value, onChange, error, label = 'Phone Number' }: {
  value: { code: string; number: string };
  onChange: (v: { code: string; number: string }) => void;
  error?: string; label?: string;
}) {
  const [showDrop, setShowDrop] = useState(false);
  const [search,   setSearch]   = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setShowDrop(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const sel      = AFRICAN_CODES.find(c => c.code === value.code) ?? AFRICAN_CODES[0];
  const filtered = search ? AFRICAN_CODES.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.code.includes(search)) : AFRICAN_CODES;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <label className="eg-label">{label}</label>
      <div style={{ display: 'flex', gap: '8px' }}>
        {/* Country code button */}
        <button type="button" onClick={() => { setShowDrop(!showDrop); setSearch(''); }}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0 10px', height: '44px', borderRadius: '10px', cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: `1px solid ${error ? '#ef4444' : '#1e2a3a'}`, fontFamily: 'Space Grotesk, sans-serif', fontSize: '13px', fontWeight: 700, color: '#e8edf5', whiteSpace: 'nowrap', flexShrink: 0 }}>
          <span style={{ fontSize: '18px' }}>{sel.flag}</span>
          <span>{sel.code}</span>
          <ChevronDown size={11} color="#5a6a80" />
        </button>
        {/* Number input */}
        <input
          style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: `1px solid ${error ? '#ef4444' : '#1e2a3a'}`, borderRadius: '10px', padding: '0 12px', fontSize: '14px', color: '#e8edf5', fontFamily: 'Space Grotesk, sans-serif', outline: 'none', height: '44px' }}
          placeholder={`${sel.digits} digits`}
          value={value.number}
          onChange={e => onChange({ ...value, number: e.target.value.replace(/[^\d\s]/g, '') })}
          inputMode="tel"
        />
      </div>
      {error && <p style={{ fontSize: '11px', color: '#ef4444', marginTop: '4px' }}>⚠️ {error}</p>}

      {/* Dropdown */}
      {showDrop && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 9999, background: '#0f1923', border: '1px solid #1e2a3a', borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.6)', width: '260px', maxHeight: '280px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '8px' }}>
            <input
              placeholder="Search country…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid #1e2a3a', borderRadius: '8px', padding: '8px 10px', fontSize: '12px', color: '#e8edf5', fontFamily: 'Space Grotesk, sans-serif', outline: 'none', boxSizing: 'border-box' }}
              autoFocus
            />
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {filtered.map(c => (
              <div key={c.code}
                onClick={() => { onChange({ code: c.code, number: '' }); setShowDrop(false); setSearch(''); }}
                style={{ padding: '9px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', background: c.code === value.code ? 'rgba(245,197,24,0.1)' : 'transparent', borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                onMouseEnter={e => { if (c.code !== value.code) (e.currentTarget as HTMLElement).style.background = '#1e2a3a'; }}
                onMouseLeave={e => { if (c.code !== value.code) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <span style={{ fontSize: '20px' }}>{c.flag}</span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#e8edf5', flex: 1 }}>{c.name}</span>
                <span style={{ fontSize: '12px', color: '#5a6a80' }}>{c.code}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function Auth({ onBack, onDemo }: AuthProps) {
  const { signIn, signInWithPhone, signUp } = useAuth();
  const [isLogin, setIsLogin]           = useState(true);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [plateNumber, setPlateNumber]   = useState('');
  const [vehicleType, setVehicleType]   = useState('motorcycle');
  const [showPw,      setShowPw]        = useState(false);
  const [showLoginPw, setShowLoginPw]   = useState(false);

  // Login fields
  const [loginPhone,    setLoginPhone]    = useState({ code: '+250', number: '' });
  const [loginPassword, setLoginPassword] = useState('');
  const [loginEmail,    setLoginEmail]    = useState('');
  const [loginPhoneErr, setLoginPhoneErr] = useState('');

  // Gmail prefix signup
  const [gmailPrefix, setGmailPrefix] = useState('');

  // Signup phone
  const [signupPhone, setSignupPhone] = useState({ code: '+250', number: '' });

  // Location autocomplete
  const [locationSuggestions, setLocationSuggestions] = useState<any[]>([]);
  const [detectedSector,      setDetectedSector]      = useState('');
  const [showLocationDrop,    setShowLocationDrop]     = useState(false);
  const [locationLoading,     setLocationLoading]      = useState(false);
  const locationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locationRef   = useRef<HTMLDivElement>(null);

  // District autocomplete
  const [districtFiltered, setDistrictFiltered] = useState<string[]>(RWANDA_DISTRICTS);
  const [showDistrictDrop, setShowDistrictDrop] = useState(false);
  const districtRef = useRef<HTMLDivElement>(null);

  // Validation errors
  const [phoneErr,    setPhoneErr]    = useState('');
  const [districtErr, setDistrictErr] = useState('');
  const [locationErr, setLocationErr] = useState('');

  const [formData, setFormData] = useState({
    password: '', full_name: '',
    district: '', location: '',
    user_category: 'sender' as 'sender' | 'motari',
  });

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (locationRef.current && !locationRef.current.contains(e.target as Node)) setShowLocationDrop(false);
      if (districtRef.current && !districtRef.current.contains(e.target as Node)) setShowDistrictDrop(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  function handleLocationChange(val: string) {
    setFormData(f => ({ ...f, location: val }));
    setDetectedSector('');
    setLocationErr('');
    if (locationTimer.current) clearTimeout(locationTimer.current);
    if (!val.trim() || val.length < 3) { setLocationSuggestions([]); setShowLocationDrop(false); return; }
    locationTimer.current = setTimeout(async () => {
      setLocationLoading(true);
      try {
        const q   = encodeURIComponent(`${val}, ${formData.district || 'Kigali'}, Rwanda`);
        const res = await fetch(`https://photon.komoot.io/api/?q=${q}&limit=5&bbox=28.8,-2.9,30.9,-1.0&lang=en`);
        const d   = await res.json();
        const formatted = (d.features || []).map((f: any) => ({
          display: [f.properties.name, f.properties.street, f.properties.city || 'Kigali'].filter(Boolean).join(', '),
          sector:  f.properties.suburb || f.properties.quarter || f.properties.city_district || f.properties.district || '',
        }));
        setLocationSuggestions(formatted);
        setShowLocationDrop(formatted.length > 0);
      } catch { setLocationSuggestions([]); }
      setLocationLoading(false);
    }, 500);
  }

  function handleDistrictChange(val: string) {
    setFormData(f => ({ ...f, district: val }));
    setDistrictErr('');
    setDistrictFiltered(RWANDA_DISTRICTS.filter(d => d.toLowerCase().includes(val.toLowerCase())));
    setShowDistrictDrop(true);
  }

  function validateLoginPhone(): boolean {
    const sel = AFRICAN_CODES.find(c => c.code === loginPhone.code) ?? AFRICAN_CODES[0];
    const d   = loginPhone.number.replace(/\D/g, '');
    if (!d.length) { setLoginPhoneErr('Phone number is required'); return false; }
    if (d.length !== sel.digits) { setLoginPhoneErr(`${sel.name} numbers need ${sel.digits} digits`); return false; }
    setLoginPhoneErr('');
    return true;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // ── SIGN IN ──
    if (isLogin) {
      if (!loginEmail.trim()) { setError('Please enter your Gmail username'); return; }
      if (!loginPassword)     { setError('Password is required'); return; }
      setLoading(true);
      try {
        const email = `${loginEmail.trim().toLowerCase()}@gmail.com`;
        await signIn(email, loginPassword);
      } catch (err: any) {
        setError('Wrong email or password. Please try again.');
      } finally { setLoading(false); }
      return;
    }

    // ── SIGN UP VALIDATION ──
    const sel    = AFRICAN_CODES.find(c => c.code === signupPhone.code) ?? AFRICAN_CODES[0];
    const digits = signupPhone.number.replace(/\D/g, '');
    if (!digits.length || digits.length !== sel.digits) {
      setPhoneErr(`${sel.name} numbers need ${sel.digits} digits`);
      return;
    }

    const validDistrict = RWANDA_DISTRICTS.find(d => d.toLowerCase() === formData.district.trim().toLowerCase());
    if (!validDistrict) { setDistrictErr('Please select a valid Rwanda district from the list'); return; }
    if (!formData.location.trim()) { setLocationErr('Location is required'); return; }
    if (formData.user_category === 'motari' && !plateNumber.trim()) { setError('Please enter your plate number'); return; }
    if (!gmailPrefix.trim()) { setError('Please enter your Gmail username'); return; }
    if (formData.password.length < 6) { setError('Password must be at least 6 characters'); return; }

    setLoading(true);
    try {
      const email     = `${gmailPrefix.trim().toLowerCase()}@gmail.com`;
      const fullPhone = `${signupPhone.code}${digits}`;

      const newUser = await signUp(email, formData.password, {
        full_name:     formData.full_name,
        phone_number:  fullPhone,
        district:      validDistrict,
        location:      formData.location,
        sector:        detectedSector || '',
        user_category: formData.user_category,
        role:          formData.user_category === 'motari' ? 'driver' : 'sender',
      });

      if (formData.user_category === 'motari' && newUser?.id) {
        await supabase.from('drivers').insert({
          user_id:      newUser.id,
          plate_number: plateNumber.trim().toUpperCase(),
          vehicle_type: vehicleType,
          is_available: false,
          is_on_duty:   false,
        });
      }

      // ── AUTO LOGIN after signup ──
      await signIn(email, formData.password);

    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', background: '#080c14',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px 16px', position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: '-80px', right: '-80px', width: '280px', height: '280px', background: 'radial-gradient(circle, rgba(245,200,66,0.06) 0%, transparent 70%)', borderRadius: '50%' }} />

      <div style={{ maxWidth: '420px', width: '100%', position: 'relative', zIndex: 1 }}>
        <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'none', border: 'none', color: '#5a6a80', cursor: 'pointer', fontSize: '14px', marginBottom: '20px', fontFamily: 'Space Grotesk, sans-serif' }}>
          <ArrowLeft size={16} /> Back
        </button>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '56px', height: '56px', background: 'linear-gradient(135deg,#f5c842,#e8b820)', borderRadius: '16px', marginBottom: '12px', boxShadow: '0 4px 20px rgba(245,200,66,0.25)' }}>
            <Bike size={26} color="#080c14" />
          </div>
          <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '24px', fontWeight: '800', color: '#e8edf5', margin: '0 0 4px', letterSpacing: '-0.02em' }}>
            {isLogin ? 'Welcome Back' : 'Create Account'}
          </h2>
          <p style={{ color: '#5a6a80', fontSize: '13px', margin: 0 }}>
            {isLogin ? 'Sign in to Easy GO' : 'Join Easy GO today'}
          </p>
        </div>

        {/* Demo button */}
        {onDemo && (
          <button type="button" onClick={onDemo}
            style={{ width: '100%', marginBottom: '14px', padding: '14px', background: 'rgba(245,197,24,0.06)', border: '2px dashed rgba(245,197,24,0.3)', borderRadius: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', fontFamily: 'Space Grotesk, sans-serif', transition: 'all .2s' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(245,197,24,0.1)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(245,197,24,0.06)')}
          >
            <div style={{ width: '32px', height: '32px', background: 'rgba(245,197,24,0.15)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Play size={16} color="#f5c842" />
            </div>
            <div style={{ textAlign: 'left' }}>
              <p style={{ fontSize: '13px', fontWeight: 700, color: '#f5c842', margin: 0 }}>Try Demo — No account needed</p>
              <p style={{ fontSize: '11px', color: '#5a6a80', margin: 0 }}>Explore the app before signing up</p>
            </div>
          </button>
        )}

        <div className="eg-card">
          {error && (
            <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '10px', padding: '12px', color: '#f87171', fontSize: '13px', marginBottom: '16px' }}>
              ⚠️ {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

            {/* ══ LOGIN ══ */}
            {isLogin && (
              <>
                <div>
                  <label className="eg-label">Gmail Address</label>
                  <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #1e2a3a', borderRadius: '10px', overflow: 'hidden', background: 'rgba(255,255,255,0.04)' }}>
                    <input
                      style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', padding: '11px 12px', fontSize: '14px', color: '#e8edf5', fontFamily: 'Space Grotesk, sans-serif' }}
                      placeholder="yourname"
                      value={loginEmail}
                      onChange={e => setLoginEmail(e.target.value.replace(/\s/g, ''))}
                      autoComplete="email"
                      autoCapitalize="none"
                      required
                    />
                    <span style={{ padding: '0 12px', fontSize: '13px', color: '#5a6a80', fontWeight: 700, whiteSpace: 'nowrap', borderLeft: '1px solid #1e2a3a', height: '44px', display: 'flex', alignItems: 'center' }}>
                      @gmail.com
                    </span>
                  </div>
                </div>
                <div>
                  <label className="eg-label">Password</label>
                  <div style={{ position: 'relative' }}>
                    <input className="eg-input" type={showLoginPw ? 'text' : 'password'} required
                      placeholder="••••••••" value={loginPassword}
                      onChange={e => setLoginPassword(e.target.value)}
                      style={{ paddingRight: '40px' }} />
                    <button type="button" onClick={() => setShowLoginPw(!showLoginPw)}
                      style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#5a6a80', display: 'flex' }}>
                      {showLoginPw ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* ══ SIGN UP ══ */}
            {!isLogin && (
              <>
                {/* Full name */}
                <div>
                  <label className="eg-label">Full Name</label>
                  <input className="eg-input" required placeholder="Your full name"
                    value={formData.full_name}
                    onChange={e => setFormData(f => ({ ...f, full_name: e.target.value }))} />
                </div>

                {/* Phone with Africa codes */}
                <PhoneInput
                  label="Phone Number"
                  value={signupPhone}
                  onChange={v => { setSignupPhone(v); setPhoneErr(''); }}
                  error={phoneErr}
                />

                {/* District */}
                <div ref={districtRef} style={{ position: 'relative' }}>
                  <label className="eg-label">District</label>
                  <input className="eg-input" required placeholder="Type your district…"
                    value={formData.district}
                    onChange={e => handleDistrictChange(e.target.value)}
                    onFocus={() => { setDistrictFiltered(RWANDA_DISTRICTS.filter(d => d.toLowerCase().includes(formData.district.toLowerCase()))); setShowDistrictDrop(true); }}
                    style={{ border: `1px solid ${districtErr ? '#ef4444' : '#1e2a3a'}` }}
                    autoComplete="off"
                  />
                  {districtErr && <p style={{ fontSize: '11px', color: '#ef4444', marginTop: '4px' }}>⚠️ {districtErr}</p>}
                  {showDistrictDrop && districtFiltered.length > 0 && (
                    <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 9999, background: '#0f1923', border: '1px solid #1e2a3a', borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.5)', maxHeight: '180px', overflowY: 'auto' }}>
                      {districtFiltered.map(d => (
                        <div key={d}
                          onClick={() => { setFormData(f => ({ ...f, district: d })); setShowDistrictDrop(false); setDistrictErr(''); }}
                          style={{ padding: '10px 14px', cursor: 'pointer', fontSize: '13px', color: '#e8edf5', borderBottom: '1px solid #1e2a3a' }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#1e2a3a')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          📍 {d}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Location */}
                <div ref={locationRef} style={{ position: 'relative' }}>
                  <label className="eg-label">Location / Street</label>
                  <div style={{ position: 'relative' }}>
                    <MapPin size={13} color="#5a6a80" style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                    <input className="eg-input" required placeholder="e.g. KG 11 Ave, Kimihurura"
                      value={formData.location}
                      onChange={e => handleLocationChange(e.target.value)}
                      style={{ paddingLeft: '32px', border: `1px solid ${locationErr ? '#ef4444' : '#1e2a3a'}` }}
                      autoComplete="off"
                    />
                    {locationLoading && <div className="spinner" style={{ position: 'absolute', right: '11px', top: '50%', transform: 'translateY(-50%)', width: '13px', height: '13px' }} />}
                  </div>
                  {locationErr && <p style={{ fontSize: '11px', color: '#ef4444', marginTop: '4px' }}>⚠️ {locationErr}</p>}
                  {/* Auto-detected sector badge */}
                  {detectedSector && !locationErr && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', padding: '5px 10px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '8px' }}>
                      <span style={{ fontSize: '12px' }}>✅</span>
                      <p style={{ fontSize: '11px', color: '#22c55e', fontWeight: 600 }}>Neighbourhood detected: <strong>{detectedSector}</strong></p>
                    </div>
                  )}
                  {!detectedSector && formData.location.length > 3 && !locationErr && (
                    <p style={{ fontSize: '11px', color: '#5a6a80', marginTop: '4px' }}>💡 Pick a suggestion from the list to auto-detect your area</p>
                  )}
                  {showLocationDrop && locationSuggestions.length > 0 && (
                    <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 9999, background: '#0f1923', border: '1px solid #1e2a3a', borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.5)', maxHeight: '200px', overflowY: 'auto' }}>
                      {locationSuggestions.map((s, i) => (
                        <div key={i}
                          onClick={() => { setFormData(f => ({ ...f, location: s.display })); setDetectedSector(s.sector || ''); setShowLocationDrop(false); setLocationErr(''); }}
                          style={{ padding: '10px 14px', cursor: 'pointer', fontSize: '12px', color: '#e8edf5', borderBottom: '1px solid #1e2a3a', display: 'flex', alignItems: 'center', gap: '8px' }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#1e2a3a')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <MapPin size={11} color="#f5c842" style={{ flexShrink: 0 }} />
                          {s.display}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Role */}
                <div>
                  <label className="eg-label">I am joining as</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {[
                      { value: 'sender', emoji: '📤📥', label: 'Sender & Receiver', desc: 'Send and receive packages' },
                      { value: 'motari', emoji: '🏍️',  label: 'Motari (Driver)',   desc: 'Deliver packages and earn money' },
                    ].map(r => (
                      <button key={r.value} type="button"
                        onClick={() => setFormData(f => ({ ...f, user_category: r.value as any }))}
                        style={{ background: formData.user_category === r.value ? 'rgba(245,197,24,0.08)' : 'rgba(255,255,255,0.02)', border: `2px solid ${formData.user_category === r.value ? 'rgba(245,197,24,0.5)' : '#1e2a3a'}`, borderRadius: '12px', padding: '12px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px', transition: 'all .15s', textAlign: 'left' }}>
                        <span style={{ fontSize: '22px' }}>{r.emoji}</span>
                        <div style={{ flex: 1 }}>
                          <p style={{ fontSize: '13px', fontWeight: 700, margin: '0 0 2px', color: formData.user_category === r.value ? '#f5c842' : '#e8edf5', fontFamily: 'Space Grotesk, sans-serif' }}>
                            {r.label}
                            {r.value === 'motari' && (
                              <span style={{ marginLeft: '8px', fontSize: '9px', background: 'rgba(245,197,24,0.15)', color: '#f5c842', padding: '2px 6px', borderRadius: '6px', fontWeight: 700, verticalAlign: 'middle' }}>EARN MONEY</span>
                            )}
                          </p>
                          <p style={{ fontSize: '11px', color: '#5a6a80', margin: 0, fontFamily: 'Space Grotesk, sans-serif' }}>{r.desc}</p>
                        </div>
                        {formData.user_category === r.value && (
                          <div style={{ width: '20px', height: '20px', background: '#f5c842', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <span style={{ fontSize: '11px', color: '#080c14', fontWeight: 800 }}>✓</span>
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                  <p style={{ fontSize: '11px', color: '#5a6a80', marginTop: '6px' }}>💡 Sender & Receiver can switch roles anytime in profile</p>
                </div>

                {/* Motari details */}
                {formData.user_category === 'motari' && (
                  <div style={{ background: 'rgba(245,197,24,0.04)', border: '1px solid rgba(245,197,24,0.2)', borderRadius: '12px', padding: '14px' }}>
                    <p style={{ fontSize: '11px', fontWeight: 700, color: '#f5c842', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '12px' }}>🏍️ Motari Details</p>
                    <div style={{ marginBottom: '12px' }}>
                      <label className="eg-label">Plate Number</label>
                      <input className="eg-input" type="text" placeholder="e.g. RAD 123 A"
                        value={plateNumber} onChange={e => setPlateNumber(e.target.value.toUpperCase())} required />
                    </div>
                    <div>
                      <label className="eg-label">Vehicle Type</label>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                        {[{ value: 'motorcycle', label: '🏍️', name: 'Moto' }, { value: 'bicycle', label: '🚲', name: 'Bicycle' }, { value: 'car', label: '🚗', name: 'Car' }].map(v => (
                          <button key={v.value} type="button" onClick={() => setVehicleType(v.value)}
                            style={{ background: vehicleType === v.value ? 'rgba(245,197,24,0.15)' : 'rgba(255,255,255,0.02)', border: `1px solid ${vehicleType === v.value ? 'rgba(245,197,24,0.5)' : '#1e2a3a'}`, borderRadius: '8px', padding: '10px 6px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                            <span style={{ fontSize: '20px' }}>{v.label}</span>
                            <span style={{ fontSize: '11px', fontWeight: 700, color: vehicleType === v.value ? '#f5c842' : '#5a6a80', fontFamily: 'Space Grotesk, sans-serif' }}>{v.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Gmail prefix */}
                <div>
                  <label className="eg-label">Gmail Address</label>
                  <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #1e2a3a', borderRadius: '10px', overflow: 'hidden', background: 'rgba(255,255,255,0.04)' }}>
                    <input
                      style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', padding: '11px 12px', fontSize: '14px', color: '#e8edf5', fontFamily: 'Space Grotesk, sans-serif' }}
                      placeholder="yourname"
                      value={gmailPrefix}
                      onChange={e => setGmailPrefix(e.target.value.replace(/\s/g, ''))}
                      required
                    />
                    <span style={{ padding: '0 12px', fontSize: '13px', color: '#5a6a80', fontWeight: 700, whiteSpace: 'nowrap', borderLeft: '1px solid #1e2a3a', height: '44px', display: 'flex', alignItems: 'center' }}>
                      @gmail.com
                    </span>
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label className="eg-label">Password</label>
                  <div style={{ position: 'relative' }}>
                    <input className="eg-input" type={showPw ? 'text' : 'password'} required
                      placeholder="••••••••" value={formData.password}
                      onChange={e => setFormData(f => ({ ...f, password: e.target.value }))}
                      style={{ paddingRight: '40px' }} />
                    <button type="button" onClick={() => setShowPw(!showPw)}
                      style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#5a6a80', display: 'flex' }}>
                      {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  <p style={{ fontSize: '11px', color: '#5a6a80', marginTop: '4px' }}>Minimum 6 characters</p>
                </div>
              </>
            )}

            {/* Submit */}
            <button type="submit" className="eg-btn-primary" disabled={loading} style={{ marginTop: '4px' }}>
              {loading
                ? (isLogin ? '⏳ Signing in…' : '⏳ Creating account…')
                : (isLogin ? 'Sign In →' : 'Create Account →')}
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: '18px', paddingTop: '18px', borderTop: '1px solid #1e2a3a' }}>
            <button
              onClick={() => { setIsLogin(!isLogin); setError(''); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: '#f5c842', fontFamily: 'Space Grotesk, sans-serif' }}
            >
              {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}