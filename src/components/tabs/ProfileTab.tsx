import { useState, useRef, useEffect } from 'react';
import { User, Edit2, Save, LogOut, Info, MessageCircle,
         CheckCircle, XCircle, ChevronRight, Camera } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { supabase } from '../../lib/supabase';

export function ProfileTab() {
  const { profile, signOut, refreshProfile } = useAuth();
  const { isDark } = useTheme();
  const [isEditing, setIsEditing]     = useState(false);
  const [showAbout, setShowAbout]     = useState(false);
  const [showSupport, setShowSupport] = useState(false);
  const [loading, setLoading]         = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [driverInfo, setDriverInfo]   = useState<any>(null);
  const [msg, setMsg]                 = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    full_name:    profile?.full_name    || '',
    phone_number: profile?.phone_number || '',
    district:     profile?.district     || '',
    location:     profile?.location     || '',
  });

  useEffect(() => {
    if (profile?.user_category === 'motari' || profile?.role === 'driver') {
      loadDriverInfo();
    }
    const saved = localStorage.getItem(`eg-photo-${profile?.id}`);
    if (saved) setPhotoPreview(saved);
  }, [profile?.id]);

  async function loadDriverInfo() {
    if (!profile) return;
    const { data } = await supabase
      .from('drivers')
      .select('*')
      .eq('user_id', profile.id)
      .maybeSingle();
    if (data) setDriverInfo(data);
  }

  function notify(m: string) {
    setMsg(m); setTimeout(() => setMsg(''), 3000);
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) { alert('Photo must be under 3MB'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setPhotoPreview(dataUrl);
      localStorage.setItem(`eg-photo-${profile?.id}`, dataUrl);
    };
    reader.readAsDataURL(file);
  }

  async function handleSave() {
    setLoading(true);
    try {
      await supabase.from('profiles').update({
        full_name:    form.full_name,
        phone_number: form.phone_number,
        district:     form.district,
        location:     form.location,
        updated_at:   new Date().toISOString(),
      }).eq('id', profile!.id);
      await refreshProfile();
      setIsEditing(false);
      notify('✅ Profile updated');
    } catch {
      alert('Failed to update profile');
    } finally {
      setLoading(false);
    }
  }

  async function switchRole(newRole: 'sender' | 'receiver') {
    if (!profile) return;
    if (profile.user_category === newRole || profile.role === newRole) return;
    await supabase.from('profiles').update({
      role:          newRole,
      user_category: newRole,
      updated_at:    new Date().toISOString(),
    }).eq('id', profile.id);
    await refreshProfile();
    notify(`✅ Switched to ${newRole}`);
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
    notify(newDuty ? '🟢 You are now On Duty' : '🔴 You are now Off Duty');
  }

  if (!profile) return (
    <div style={{ textAlign: 'center', padding: '48px 0' }}>
      <div className="spinner" />
    </div>
  );

  const isDriver   = profile.user_category === 'motari' || profile.role === 'driver';
  const isSender   = profile.user_category === 'sender'   || profile.role === 'sender';
  const isReceiver = profile.user_category === 'receiver' || profile.role === 'receiver';

  const roleLabel: Record<string, string> = {
    sender:   '📤 Sender',
    receiver: '📥 Receiver',
    motari:   '🏍️ Motari (Driver)',
    driver:   '🏍️ Motari (Driver)',
  };

  return (
    <div style={{
      padding: '20px', display: 'flex', flexDirection: 'column',
      gap: '12px', background: 'var(--bg)', minHeight: '100%',
    }}>

      {/* Toast message */}
      {msg && (
        <div style={{
          background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)',
          borderRadius: '10px', padding: '10px 14px',
          fontSize: '13px', fontWeight: 600, color: 'var(--green)',
        }}>
          {msg}
        </div>
      )}

      {/* ── PROFILE CARD ── */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
          <h2 style={{ fontWeight: 700, fontSize: '18px', color: 'var(--text)', letterSpacing: '-.02em' }}>
            My Account
          </h2>
          {!isEditing ? (
            <button
              onClick={() => setIsEditing(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: '9px', padding: '6px 12px', cursor: 'pointer', color: 'var(--text)', fontSize: '12px', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600 }}
            >
              <Edit2 size={12} /> Edit
            </button>
          ) : (
            <button
              onClick={handleSave}
              disabled={loading}
              style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: '9px', padding: '6px 12px', cursor: 'pointer', color: 'var(--green)', fontSize: '12px', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600 }}
            >
              <Save size={12} /> {loading ? 'Saving…' : 'Save'}
            </button>
          )}
        </div>

        {/* Avatar */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
          <div style={{ position: 'relative', display: 'inline-block' }}>
            {(photoPreview || (profile as any).profile_picture) ? (
              <img
                src={photoPreview || (profile as any).profile_picture}
                alt="Profile"
                style={{ width: '84px', height: '84px', borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--yellow)', boxShadow: '0 0 20px rgba(245,197,24,0.2)' }}
              />
            ) : (
              <div style={{ width: '84px', height: '84px', borderRadius: '50%', background: 'rgba(245,197,24,0.1)', border: '2px solid rgba(245,197,24,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <User size={34} color="var(--yellow)" />
              </div>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{ position: 'absolute', bottom: 0, right: 0, width: '28px', height: '28px', borderRadius: '50%', background: 'var(--yellow)', border: '2px solid var(--card)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
              <Camera size={13} color={isDark ? '#0a0a0a' : '#fff'} />
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoChange} />
          </div>
        </div>
        <p style={{ textAlign: 'center', fontSize: '11px', color: 'var(--text3)', marginBottom: '14px' }}>
          📱 Photo saved on your device only
        </p>

        {/* Active badge */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            background: (profile as any).is_active ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
            border: `1px solid ${(profile as any).is_active ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
            borderRadius: '20px', padding: '5px 14px',
          }}>
            {(profile as any).is_active
              ? <CheckCircle size={12} color="var(--green)" />
              : <XCircle    size={12} color="var(--red)" />
            }
            <span style={{ fontSize: '12px', fontWeight: 700, color: (profile as any).is_active ? 'var(--green)' : 'var(--red)' }}>
              {(profile as any).is_active ? 'Active Member' : 'Inactive Member'}
            </span>
          </div>
        </div>

        {/* Fields */}
        {isEditing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {[
              { label: 'Full Name', k: 'full_name',    ph: 'Your name' },
              { label: 'Phone',     k: 'phone_number', ph: '+250 7XX XXX XXX' },
              { label: 'District',  k: 'district',     ph: 'e.g. Gasabo' },
              { label: 'Location',  k: 'location',     ph: 'Area / street' },
            ].map(f => (
              <div key={f.k}>
                <label className="eg-label">{f.label}</label>
                <input
                  className="eg-input"
                  placeholder={f.ph}
                  value={(form as any)[f.k]}
                  onChange={e => setForm({ ...form, [f.k]: e.target.value })}
                />
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
            {[
              { label: 'Name',     value: profile.full_name },
              { label: 'Phone',    value: profile.phone_number },
              { label: 'District', value: (profile as any).district },
              { label: 'Location', value: (profile as any).location },
              { label: 'Role',     value: roleLabel[profile.user_category || profile.role] || profile.role },
            ].map(f => (
              <div key={f.label} className="card-inner" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: 'var(--text3)', fontWeight: 600 }}>{f.label}</span>
                <span style={{ fontSize: '13px', color: 'var(--text)', fontWeight: 500 }}>{f.value || '—'}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── DRIVER INFO CARD — motari only ── */}
      {isDriver && driverInfo && (
        <div className="card">
          <p style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text)', marginBottom: '12px' }}>
            🏍️ Driver Details
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', marginBottom: '14px' }}>
            {[
              { label: 'Plate Number', value: driverInfo.plate_number },
              { label: 'Vehicle Type', value: driverInfo.vehicle_type || 'motorcycle' },
              { label: 'Total Deliveries', value: driverInfo.total_deliveries || 0 },
              { label: 'Rating', value: driverInfo.rating ? `⭐ ${driverInfo.rating}` : '⭐ 5.0' },
              { label: 'Total Earnings', value: `${(driverInfo.total_earnings || 0).toLocaleString()} RWF` },
            ].map(f => (
              <div key={f.label} className="card-inner" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: 'var(--text3)', fontWeight: 600 }}>{f.label}</span>
                <span style={{ fontSize: '13px', color: 'var(--text)', fontWeight: 600 }}>{f.value}</span>
              </div>
            ))}
          </div>

          {/* On/Off duty toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: driverInfo.is_on_duty ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.05)', border: `1px solid ${driverInfo.is_on_duty ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.15)'}`, borderRadius: '10px' }}>
            <div>
              <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)', marginBottom: '2px' }}>
                {driverInfo.is_on_duty ? '🟢 On Duty' : '🔴 Off Duty'}
              </p>
              <p style={{ fontSize: '11px', color: 'var(--text3)' }}>
                {driverInfo.is_on_duty ? 'You are receiving orders' : 'Toggle to receive orders'}
              </p>
            </div>
            <button
              onClick={toggleDuty}
              style={{
                width: '56px', height: '30px',
                background: driverInfo.is_on_duty ? '#22c55e' : 'var(--border2)',
                borderRadius: '15px', border: 'none', cursor: 'pointer',
                position: 'relative', transition: 'background .25s',
                boxShadow: driverInfo.is_on_duty ? '0 0 12px rgba(34,197,94,0.4)' : 'none',
              }}
            >
              <div style={{
                position: 'absolute', top: '4px',
                left: driverInfo.is_on_duty ? '30px' : '4px',
                width: '22px', height: '22px',
                background: '#ffffff', borderRadius: '50%',
                transition: 'left .25s',
                boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
              }} />
            </button>
          </div>
        </div>
      )}

      {/* ── ROLE SWITCHER — sender/receiver only ── */}
      {!isDriver && (
        <div className="card">
          <p style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text)', marginBottom: '4px' }}>
            Switch Role
          </p>
          <p style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '12px' }}>
            You can switch between sender and receiver anytime
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            {[
              { value: 'sender',   emoji: '📤', label: 'Sender',   desc: 'Send packages' },
              { value: 'receiver', emoji: '📥', label: 'Receiver', desc: 'Receive packages' },
            ].map(r => {
              const isActive = profile.user_category === r.value || profile.role === r.value;
              return (
                <button
                  key={r.value}
                  onClick={() => switchRole(r.value as 'sender' | 'receiver')}
                  style={{
                    background: isActive ? 'rgba(245,197,24,0.1)' : 'var(--bg3)',
                    border: `2px solid ${isActive ? 'rgba(245,197,24,0.45)' : 'var(--border)'}`,
                    borderRadius: '12px', padding: '14px', cursor: 'pointer', textAlign: 'left',
                    transition: 'all .15s',
                  }}
                >
                  <p style={{ fontSize: '20px', marginBottom: '6px' }}>{r.emoji}</p>
                  <p style={{ fontSize: '13px', fontWeight: 700, color: isActive ? 'var(--yellow)' : 'var(--text)', marginBottom: '3px', fontFamily: 'Space Grotesk, sans-serif' }}>
                    {r.label}
                  </p>
                  <p style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: 'Space Grotesk, sans-serif' }}>
                    {r.desc}
                  </p>
                  {isActive && (
                    <p style={{ fontSize: '10px', color: 'var(--yellow)', fontWeight: 700, marginTop: '6px' }}>
                      ✓ Current
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── ABOUT & SUPPORT ── */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {[
          {
            icon: Info, label: 'About Us', open: showAbout,
            toggle: () => setShowAbout(!showAbout),
            content: (
              <div style={{ padding: '0 18px 16px', color: 'var(--text2)', fontSize: '13px', lineHeight: 1.7 }}>
                <p><strong style={{ color: 'var(--text)' }}>Easy GO</strong> connects senders with reliable motor drivers across Rwanda.</p>
                <p style={{ marginTop: '8px' }}>Making delivery simple, fast, and affordable for everyone.</p>
                <p style={{ marginTop: '8px', color: 'var(--yellow)', fontWeight: 600 }}>Your Delivery is our duty. 🇷🇼</p>
              </div>
            ),
          },
          {
            icon: MessageCircle, label: 'Support & Feedback', open: showSupport,
            toggle: () => setShowSupport(!showSupport),
            content: (
              <div style={{ padding: '0 18px 16px' }}>
                {[
                  { l: 'Email',   v: 'wandaatech@gmail.com' },
                  { l: 'Phone 1', v: '+250 780 867 473' },
                  { l: 'Phone 2', v: '+250 789 136 987' },
                  { l: 'Phone 3', v: '+250 798 582 533' },
                  { l: 'Hours',   v: '24/7 Available' },
                ].map(i => (
                  <div key={i.l} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text3)' }}>{i.l}</span>
                    <span style={{ fontSize: '12px', color: 'var(--text)', fontWeight: 600 }}>{i.v}</span>
                  </div>
                ))}
              </div>
            ),
          },
        ].map(({ icon: Icon, label, open, toggle, content }, idx) => (
          <div key={label}>
            {idx > 0 && <div className="divider" style={{ margin: 0 }} />}
            <button
              onClick={toggle}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px 18px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Icon size={15} color="var(--yellow)" />
                <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text)' }}>{label}</span>
              </div>
              <ChevronRight size={14} color="var(--text3)" style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }} />
            </button>
            {open && content}
          </div>
        ))}
      </div>

      {/* ── LOGOUT ── */}
      <button
        onClick={signOut}
        style={{ width: '100%', padding: '13px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '10px', color: 'var(--red)', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
      >
        <LogOut size={15} /> Log Out
      </button>

    </div>
  );
}