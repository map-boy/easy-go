import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Bike, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface AuthProps { onBack: () => void; }

export function Auth({ onBack }: AuthProps) {
  const { signIn, signUp } = useAuth();
  const [isLogin, setIsLogin]     = useState(true);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [showPw, setShowPw]       = useState(false);
  const [plateNumber, setPlateNumber] = useState('');
  const [vehicleType, setVehicleType] = useState('motorcycle');

  const [formData, setFormData] = useState({
    email: '', password: '', full_name: '', phone_number: '',
    district: '', location: '',
    user_category: 'sender' as 'sender' | 'receiver' | 'motari',
  });

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setFormData({ ...formData, [k]: e.target.value });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!isLogin && formData.user_category === 'motari' && !plateNumber.trim()) {
      setError('Please enter your plate number');
      return;
    }

    setLoading(true);
    try {
      if (isLogin) {
        await signIn(formData.email, formData.password);
      } else {
        const newUser = await signUp(formData.email, formData.password, {
          full_name:     formData.full_name,
          phone_number:  formData.phone_number,
          district:      formData.district,
          location:      formData.location,
          user_category: formData.user_category,
          role:          formData.user_category === 'motari' ? 'driver' : formData.user_category,
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
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', background: '#080c14',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px', position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: '-80px', right: '-80px',
        width: '280px', height: '280px',
        background: 'radial-gradient(circle, rgba(245,200,66,0.06) 0%, transparent 70%)',
        borderRadius: '50%',
      }} />

      <div style={{ maxWidth: '420px', width: '100%', position: 'relative', zIndex: 1 }} className="fade-in">
        <button onClick={onBack} style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          background: 'none', border: 'none', color: '#5a6a80',
          cursor: 'pointer', fontSize: '14px', marginBottom: '20px',
          fontFamily: 'Space Grotesk, sans-serif',
        }}>
          <ArrowLeft size={16} /> Back
        </button>

        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: '56px', height: '56px',
            background: 'linear-gradient(135deg,#f5c842,#e8b820)',
            borderRadius: '16px', marginBottom: '12px',
            boxShadow: '0 4px 20px rgba(245,200,66,0.25)',
          }}>
            <Bike size={26} color="#080c14" />
          </div>
          <h2 style={{
            fontFamily: 'Space Grotesk, sans-serif', fontSize: '24px', fontWeight: '800',
            color: '#e8edf5', margin: '0 0 4px', letterSpacing: '-0.02em',
          }}>
            {isLogin ? 'Welcome Back' : 'Create Account'}
          </h2>
          <p style={{ color: '#5a6a80', fontSize: '13px', margin: 0 }}>
            {isLogin ? 'Sign in to Easy GO' : 'Join Easy GO today'}
          </p>
        </div>

        <div className="eg-card">
          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: '10px', padding: '12px', color: '#f87171',
              fontSize: '13px', marginBottom: '16px',
            }}>
              ⚠️ {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {!isLogin && (
              <>
                <div>
                  <label className="eg-label">Full Name</label>
                  <input className="eg-input" required placeholder="Your full name"
                    value={formData.full_name} onChange={set('full_name')} />
                </div>
                <div>
                  <label className="eg-label">Phone Number</label>
                  <input className="eg-input" required placeholder="+250 7XX XXX XXX"
                    value={formData.phone_number} onChange={set('phone_number')} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label className="eg-label">District</label>
                    <input className="eg-input" required placeholder="e.g. Gasabo"
                      value={formData.district} onChange={set('district')} />
                  </div>
                  <div>
                    <label className="eg-label">Location</label>
                    <input className="eg-input" required placeholder="Area / street"
                      value={formData.location} onChange={set('location')} />
                  </div>
                </div>

                <div>
                  <label className="eg-label">I am joining as</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {[
                      { value: 'sender',   emoji: '📤', label: 'Sender',          desc: 'I send packages to people' },
                      { value: 'receiver', emoji: '📥', label: 'Receiver',         desc: 'I receive packages from people' },
                      { value: 'motari',   emoji: '🏍️', label: 'Motari (Driver)', desc: 'I deliver packages and earn money' },
                    ].map(r => (
                      <button
                        key={r.value}
                        type="button"
                        onClick={() => setFormData({ ...formData, user_category: r.value as any })}
                        style={{
                          background: formData.user_category === r.value ? 'rgba(245,197,24,0.08)' : 'rgba(255,255,255,0.02)',
                          border: `2px solid ${formData.user_category === r.value ? 'rgba(245,197,24,0.5)' : '#1e2a3a'}`,
                          borderRadius: '12px', padding: '12px 14px', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: '12px',
                          transition: 'all .15s', textAlign: 'left',
                        }}
                      >
                        <span style={{ fontSize: '22px' }}>{r.emoji}</span>
                        <div style={{ flex: 1 }}>
                          <p style={{
                            fontSize: '13px', fontWeight: 700, margin: '0 0 2px',
                            color: formData.user_category === r.value ? '#f5c842' : '#e8edf5',
                            fontFamily: 'Space Grotesk, sans-serif',
                          }}>
                            {r.label}
                            {r.value === 'motari' && (
                              <span style={{
                                marginLeft: '8px', fontSize: '9px',
                                background: 'rgba(245,197,24,0.15)', color: '#f5c842',
                                padding: '2px 6px', borderRadius: '6px', fontWeight: 700,
                                verticalAlign: 'middle',
                              }}>
                                EARN MONEY
                              </span>
                            )}
                          </p>
                          <p style={{ fontSize: '11px', color: '#5a6a80', margin: 0, fontFamily: 'Space Grotesk, sans-serif' }}>
                            {r.desc}
                          </p>
                        </div>
                        {formData.user_category === r.value && (
                          <div style={{
                            width: '20px', height: '20px', background: '#f5c842',
                            borderRadius: '50%', display: 'flex', alignItems: 'center',
                            justifyContent: 'center', flexShrink: 0,
                          }}>
                            <span style={{ fontSize: '11px', color: '#080c14', fontWeight: 800 }}>✓</span>
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {formData.user_category === 'motari' && (
                  <div style={{
                    background: 'rgba(245,197,24,0.04)',
                    border: '1px solid rgba(245,197,24,0.2)',
                    borderRadius: '12px', padding: '14px',
                  }}>
                    <p style={{
                      fontSize: '11px', fontWeight: 700, color: '#f5c842',
                      textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '12px',
                    }}>
                      🏍️ Motari Details
                    </p>
                    <div style={{ marginBottom: '12px' }}>
                      <label className="eg-label">Plate Number</label>
                      <input
                        className="eg-input"
                        type="text"
                        placeholder="e.g. RAD 123 A"
                        value={plateNumber}
                        onChange={e => setPlateNumber(e.target.value.toUpperCase())}
                        required
                      />
                    </div>
                    <div>
                      <label className="eg-label">Vehicle Type</label>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                        {[
                          { value: 'motorcycle', label: '🏍️', name: 'Moto' },
                          { value: 'bicycle',    label: '🚲', name: 'Bicycle' },
                          { value: 'car',        label: '🚗', name: 'Car' },
                        ].map(v => (
                          <button
                            key={v.value}
                            type="button"
                            onClick={() => setVehicleType(v.value)}
                            style={{
                              background: vehicleType === v.value ? 'rgba(245,197,24,0.15)' : 'rgba(255,255,255,0.02)',
                              border: `1px solid ${vehicleType === v.value ? 'rgba(245,197,24,0.5)' : '#1e2a3a'}`,
                              borderRadius: '8px', padding: '10px 6px', cursor: 'pointer',
                              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                            }}
                          >
                            <span style={{ fontSize: '20px' }}>{v.label}</span>
                            <span style={{
                              fontSize: '11px', fontWeight: 700,
                              color: vehicleType === v.value ? '#f5c842' : '#5a6a80',
                              fontFamily: 'Space Grotesk, sans-serif',
                            }}>
                              {v.name}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            <div>
              <label className="eg-label">Email</label>
              <input className="eg-input" type="email" required placeholder="your@email.com"
                value={formData.email} onChange={set('email')} />
            </div>

            <div>
              <label className="eg-label">Password</label>
              <div style={{ position: 'relative' }}>
                <input className="eg-input" type={showPw ? 'text' : 'password'} required
                  placeholder="••••••••" value={formData.password} onChange={set('password')}
                  style={{ paddingRight: '40px' }} />
                <button type="button" onClick={() => setShowPw(!showPw)} style={{
                  position: 'absolute', right: '12px', top: '50%',
                  transform: 'translateY(-50%)', background: 'none',
                  border: 'none', cursor: 'pointer', color: '#5a6a80', display: 'flex',
                }}>
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {!isLogin && (
                <p style={{ fontSize: '11px', color: '#5a6a80', marginTop: '4px' }}>
                  Minimum 6 characters
                </p>
              )}
            </div>

            <button
              type="submit"
              className="eg-btn-primary"
              disabled={loading}
              style={{ marginTop: '4px' }}
            >
              {loading ? 'Please wait...' : isLogin ? 'Sign In →' : 'Create Account →'}
            </button>
          </form>

          <div style={{
            textAlign: 'center', marginTop: '18px',
            paddingTop: '18px', borderTop: '1px solid #1e2a3a',
          }}>
            <button
              onClick={() => { setIsLogin(!isLogin); setError(''); }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: '13px', color: '#f5c842',
                fontFamily: 'Space Grotesk, sans-serif',
              }}
            >
              {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
