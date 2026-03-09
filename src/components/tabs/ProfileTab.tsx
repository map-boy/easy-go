import { useState, useRef, useEffect } from 'react';
import { User, Edit2, Save, LogOut, Info, MessageCircle,
         CheckCircle, XCircle, ChevronRight, Camera,
         Wallet, Plus, ArrowDownLeft, ArrowUpRight,
         Clock, RefreshCw, X } from 'lucide-react';
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

  // ── Wallet state ──────────────────────────────────────────────────────────
  const [walletBalance,    setWalletBalance]    = useState<number>(0);
  const [walletTxs,        setWalletTxs]        = useState<any[]>([]);
  const [walletLoading,    setWalletLoading]    = useState(true);
  const [showTopup,        setShowTopup]        = useState(false);
  const [topupAmount,      setTopupAmount]      = useState('');
  const [topupPhone,       setTopupPhone]       = useState('');
  const [topupStep,        setTopupStep]        = useState<'form'|'requesting'|'pending'|'success'|'failed'>('form');
  const [topupError,       setTopupError]       = useState('');

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
    setTopupPhone((profile as any)?.phone_number || '');
    loadWallet();
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

  // ── Wallet functions ──────────────────────────────────────────────────────
  async function loadWallet() {
    if (!profile?.id) return;
    setWalletLoading(true);
    const { data: prof } = await supabase
      .from('profiles').select('wallet_balance').eq('id', profile.id).single();
    setWalletBalance(prof?.wallet_balance ?? 0);

    const { data: txs } = await supabase
      .from('wallet_transactions').select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false }).limit(20);
    setWalletTxs(txs || []);
    setWalletLoading(false);
  }

  async function handleTopup() {
    const amount = parseInt(topupAmount.replace(/\D/g, ''));
    if (!amount || amount < 500) { setTopupError('Minimum top-up is 500 RWF'); return; }
    if (!topupPhone.trim())       { setTopupError('Enter your MoMo phone number'); return; }
    setTopupError('');
    setTopupStep('requesting');
    try {
      const NOOR_URL = (import.meta as any).env?.VITE_NOOR_URL || 'http://localhost:3001';
      const NOOR_KEY = (import.meta as any).env?.VITE_NOOR_API_KEY || '';

      // Insert pending transaction
      const { data: tx } = await supabase.from('wallet_transactions').insert({
        user_id: profile!.id, type: 'topup', amount,
        status: 'pending', description: `Wallet top-up ${amount.toLocaleString()} RWF`,
      }).select('id').single();

      const phone = topupPhone.startsWith('+') ? topupPhone : `+250${topupPhone.replace(/^0/, '')}`;
      const res = await fetch(`${NOOR_URL}/payments/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': NOOR_KEY },
        body: JSON.stringify({ orderId: tx?.id || 'topup', amount, phoneNumber: phone, payerName: profile!.full_name }),
      });
      const data = await res.json();
      if (!res.ok || !data.transactionId) throw new Error(data.error || 'Payment request failed');

      setTopupStep('pending');
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        if (attempts > 24) {
          clearInterval(poll);
          setTopupStep('failed');
          if (tx?.id) await supabase.from('wallet_transactions').update({ status: 'failed' }).eq('id', tx.id);
          return;
        }
        try {
          const chkRes = await fetch(`${NOOR_URL}/payments/status/${data.transactionId}`, { headers: { 'x-api-key': NOOR_KEY } });
          const chk = await chkRes.json();
          if (chk.status === 'SUCCESSFUL') {
            clearInterval(poll);
            if (tx?.id) await supabase.from('wallet_transactions').update({ status: 'completed', reference: data.transactionId }).eq('id', tx.id);
            // Increment balance in DB
            await supabase.rpc('increment_wallet_balance', { uid: profile!.id, delta: amount });
            setTopupStep('success');
            loadWallet();
            refreshProfile();
          } else if (chk.status === 'FAILED') {
            clearInterval(poll);
            setTopupStep('failed');
            if (tx?.id) await supabase.from('wallet_transactions').update({ status: 'failed' }).eq('id', tx.id);
          }
        } catch { /* keep polling */ }
      }, 5000);
    } catch (err: any) {
      setTopupStep('failed');
      setTopupError(err.message || 'Payment failed. Try again.');
    }
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
      <style>{`@keyframes tt-dot { 0%,100%{opacity:1;transform:scale(1);} 50%{opacity:.3;transform:scale(.6);} }`}</style>

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

      {/* ── WALLET CARD ── */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {/* Balance header */}
        <div style={{ background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%)', padding: '20px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Wallet size={16} color="#f5c518" />
              <span style={{ fontWeight: 800, fontSize: '14px', color: '#fff', fontFamily: 'Space Grotesk, sans-serif' }}>My Wallet</span>
            </div>
            <button onClick={loadWallet} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', display: 'flex', padding: '4px' }}>
              <RefreshCw size={13} />
            </button>
          </div>
          {walletLoading ? (
            <div style={{ height: '36px', background: 'rgba(255,255,255,0.07)', borderRadius: '8px', width: '140px' }} />
          ) : (
            <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '32px', fontWeight: 900, color: '#fff', letterSpacing: '-.02em' }}>
              {walletBalance.toLocaleString()} <span style={{ fontSize: '14px', fontWeight: 600, color: 'rgba(255,255,255,0.5)' }}>RWF</span>
            </p>
          )}
          <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', marginTop: '4px' }}>Available balance</p>
          <button
            onClick={() => { setShowTopup(true); setTopupStep('form'); setTopupAmount(''); setTopupError(''); }}
            style={{ marginTop: '14px', width: '100%', padding: '11px', background: '#f5c518', border: 'none', borderRadius: '10px', fontWeight: 800, fontSize: '13px', color: '#0a0a0a', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            <Plus size={14} /> Top Up Wallet
          </button>
        </div>

        {/* Transaction history */}
        <div style={{ padding: '14px 18px' }}>
          <p style={{ fontWeight: 700, fontSize: '12px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '10px' }}>Recent Transactions</p>
          {walletLoading ? (
            [1,2,3].map(i => <div key={i} style={{ height: '48px', background: 'var(--bg3)', borderRadius: '8px', marginBottom: '6px' }} />)
          ) : walletTxs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <p style={{ fontSize: '24px', marginBottom: '6px' }}>💳</p>
              <p style={{ fontSize: '12px', color: 'var(--text3)' }}>No transactions yet</p>
            </div>
          ) : walletTxs.map(tx => (
            <div key={tx.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: tx.type === 'payment' ? 'rgba(245,158,11,0.1)' : 'rgba(34,197,94,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {tx.type === 'payment'
                  ? <ArrowUpRight size={14} color="#f59e0b" />
                  : <ArrowDownLeft size={14} color="#22c55e" />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.description}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                  {tx.status === 'completed' && <CheckCircle size={10} color="#22c55e" />}
                  {tx.status === 'pending'   && <Clock       size={10} color="#f59e0b" />}
                  {tx.status === 'failed'    && <XCircle     size={10} color="#ef4444" />}
                  <p style={{ fontSize: '10px', color: 'var(--text3)' }}>{new Date(tx.created_at).toLocaleString()}</p>
                </div>
              </div>
              <p style={{ fontWeight: 800, fontSize: '13px', color: tx.type === 'payment' ? '#f59e0b' : '#22c55e', whiteSpace: 'nowrap', fontFamily: 'Space Grotesk, sans-serif' }}>
                {tx.type === 'payment' ? '−' : '+'}{tx.amount.toLocaleString()} RWF
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ── TOP-UP MODAL ── */}
      {showTopup && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
          onClick={() => { if (topupStep === 'form') setShowTopup(false); }}>
          <div style={{ background: 'var(--card)', borderRadius: '20px 20px 0 0', padding: '24px 20px 40px', width: '100%', maxWidth: '480px', border: '1px solid var(--border)' }}
            onClick={e => e.stopPropagation()}>

            {/* Modal header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 800, fontSize: '18px', color: 'var(--text)' }}>💳 Top Up Wallet</p>
              {(topupStep === 'form' || topupStep === 'failed') && (
                <button onClick={() => setShowTopup(false)} style={{ background: 'var(--bg3)', border: 'none', borderRadius: '50%', width: '30px', height: '30px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)' }}>
                  <X size={14} />
                </button>
              )}
            </div>

            {/* FORM */}
            {topupStep === 'form' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '6px' }}>Amount (RWF)</p>
                  {/* Quick amounts */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: '10px' }}>
                    {[1000, 2000, 5000, 10000].map(a => (
                      <button key={a} onClick={() => setTopupAmount(String(a))}
                        style={{ padding: '8px 4px', background: topupAmount === String(a) ? 'var(--yellow)' : 'var(--bg3)', border: `1px solid ${topupAmount === String(a) ? 'var(--yellow)' : 'var(--border)'}`, borderRadius: '8px', cursor: 'pointer', fontSize: '11px', fontWeight: 700, color: topupAmount === String(a) ? '#0a0a0a' : 'var(--text)', fontFamily: 'Space Grotesk, sans-serif' }}>
                        {a.toLocaleString()}
                      </button>
                    ))}
                  </div>
                  <input
                    type="number" placeholder="Or enter custom amount…"
                    value={topupAmount} onChange={e => setTopupAmount(e.target.value)}
                    style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px 14px', fontSize: '15px', fontWeight: 800, color: 'var(--text)', fontFamily: 'Space Grotesk, sans-serif', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '6px' }}>📱 MoMo Phone Number</p>
                  <input
                    type="tel" placeholder="+250 7XX XXX XXX"
                    value={topupPhone} onChange={e => setTopupPhone(e.target.value)}
                    style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px 14px', fontSize: '14px', color: 'var(--text)', fontFamily: 'Space Grotesk, sans-serif', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                {topupError && <p style={{ fontSize: '12px', color: '#ef4444', fontWeight: 600 }}>⚠️ {topupError}</p>}
                <button onClick={handleTopup}
                  style={{ width: '100%', padding: '14px', background: 'var(--yellow)', border: 'none', borderRadius: '12px', fontWeight: 800, fontSize: '15px', color: '#0a0a0a', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif' }}>
                  Pay via MTN MoMo →
                </button>
                <p style={{ fontSize: '11px', color: 'var(--text3)', textAlign: 'center' }}>You will receive a prompt on your phone to confirm</p>
              </div>
            )}

            {/* REQUESTING */}
            {topupStep === 'requesting' && (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{ fontSize: '48px', marginBottom: '14px' }}>📲</div>
                <p style={{ fontWeight: 800, fontSize: '16px', color: 'var(--text)', marginBottom: '8px' }}>Sending payment request…</p>
                <p style={{ fontSize: '13px', color: 'var(--text3)' }}>Connecting to MTN MoMo</p>
              </div>
            )}

            {/* PENDING */}
            {topupStep === 'pending' && (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{ fontSize: '48px', marginBottom: '14px' }}>⏳</div>
                <p style={{ fontWeight: 800, fontSize: '16px', color: 'var(--text)', marginBottom: '8px' }}>Waiting for your approval</p>
                <p style={{ fontSize: '13px', color: 'var(--text3)', marginBottom: '16px' }}>Check your phone and confirm the MoMo payment</p>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '6px' }}>
                  {[0,1,2].map(i => <div key={i} style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--yellow)', animation: `tt-dot 1.4s ease ${i * 0.2}s infinite` }} />)}
                </div>
              </div>
            )}

            {/* SUCCESS */}
            {topupStep === 'success' && (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{ fontSize: '56px', marginBottom: '14px' }}>🎉</div>
                <p style={{ fontWeight: 800, fontSize: '18px', color: 'var(--text)', marginBottom: '8px' }}>Top-up Successful!</p>
                <p style={{ fontSize: '14px', color: '#22c55e', fontWeight: 700, marginBottom: '6px' }}>+{parseInt(topupAmount).toLocaleString()} RWF added</p>
                <p style={{ fontSize: '13px', color: 'var(--text3)', marginBottom: '20px' }}>Your wallet balance has been updated</p>
                <button onClick={() => { setShowTopup(false); setTopupStep('form'); }}
                  style={{ padding: '12px 32px', background: 'var(--yellow)', border: 'none', borderRadius: '12px', fontWeight: 800, fontSize: '14px', color: '#0a0a0a', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif' }}>
                  Done ✓
                </button>
              </div>
            )}

            {/* FAILED */}
            {topupStep === 'failed' && (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{ fontSize: '48px', marginBottom: '14px' }}>❌</div>
                <p style={{ fontWeight: 800, fontSize: '16px', color: 'var(--text)', marginBottom: '8px' }}>Payment Failed</p>
                <p style={{ fontSize: '13px', color: 'var(--text3)', marginBottom: '20px' }}>{topupError || 'The payment was not completed. Please try again.'}</p>
                <button onClick={() => setTopupStep('form')}
                  style={{ padding: '12px 28px', background: 'var(--yellow)', border: 'none', borderRadius: '12px', fontWeight: 800, fontSize: '14px', color: '#0a0a0a', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif' }}>
                  Try Again
                </button>
              </div>
            )}
          </div>
        </div>
      )}

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