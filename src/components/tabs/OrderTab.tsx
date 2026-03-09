import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import {
  Search, ShoppingCart, X, Plus, Minus, ChevronLeft,
  Star, Clock, Check, Package, ShoppingBag,
  Pill, Utensils, ChevronRight, AlertCircle
} from 'lucide-react';

type Category = 'food' | 'parcel' | 'shop' | 'pharmacy';
type Screen   = 'home' | 'restaurant' | 'cart' | 'checkout' | 'success';

interface MenuItem   { id: string; name: string; price: number; }
interface Restaurant { id: string; name: string; image: string; rating: number; deliveryTime: string; items: MenuItem[]; }
interface ShopItem   { id: string; name: string; price: number; image: string; store: string; }
interface CartEntry  { id: string; name: string; price: number; qty: number; source: string; }

// ── Demo data (swap with Supabase queries later) ──────────────────────────────

const RESTAURANTS: Restaurant[] = [
  { id: 'r1', name: 'Fast Bites',    rating: 4.7, deliveryTime: '15–25 min', image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&q=80', items: [{ id: 'r1-1', name: 'Burger Combo', price: 5000 }, { id: 'r1-2', name: 'Chicken Wrap', price: 4000 }, { id: 'r1-3', name: 'Fries', price: 2000 }] },
  { id: 'r2', name: 'Kigali Kitchen',rating: 4.5, deliveryTime: '20–35 min', image: 'https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?w=600&q=80', items: [{ id: 'r2-1', name: 'Rice & Chicken', price: 6000 }, { id: 'r2-2', name: 'Beans & Plantain', price: 4000 }, { id: 'r2-3', name: 'African Tea', price: 2000 }] },
  { id: 'r3', name: 'Pizza Corner',  rating: 4.3, deliveryTime: '25–40 min', image: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=600&q=80', items: [{ id: 'r3-1', name: 'Small Pizza', price: 7000 }, { id: 'r3-2', name: 'Large Pizza', price: 10000 }, { id: 'r3-3', name: 'Soda', price: 1500 }] },
];

const SHOP_ITEMS: ShopItem[] = [
  { id: 's1', name: 'Bread',        price: 1200, store: 'EasyGO Mini Market', image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400&q=80' },
  { id: 's2', name: 'Milk',         price: 1000, store: 'EasyGO Mini Market', image: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=400&q=80' },
  { id: 's3', name: 'Eggs (tray)',  price: 4000, store: 'EasyGO Mini Market', image: 'https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?w=400&q=80' },
  { id: 's4', name: 'Rice (1 kg)',  price: 2000, store: 'EasyGO Mini Market', image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400&q=80' },
  { id: 's5', name: 'Sugar (1 kg)', price: 1500, store: 'EasyGO Mini Market', image: 'https://images.unsplash.com/photo-1558642891-54be180ea339?w=400&q=80' },
];

const PHARMACY_ITEMS: ShopItem[] = [
  { id: 'p1', name: 'Paracetamol',   price: 2000, store: 'HealthPlus Pharmacy', image: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400&q=80' },
  { id: 'p2', name: 'Vitamin C',     price: 3000, store: 'HealthPlus Pharmacy', image: 'https://images.unsplash.com/photo-1576602976047-174e57a47881?w=400&q=80' },
  { id: 'p3', name: 'Cough Syrup',   price: 4000, store: 'HealthPlus Pharmacy', image: 'https://images.unsplash.com/photo-1550572017-edd951b55104?w=400&q=80' },
  { id: 'p4', name: 'First Aid Kit', price: 6000, store: 'HealthPlus Pharmacy', image: 'https://images.unsplash.com/photo-1603398938378-e54eab446dde?w=400&q=80' },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function ParcelForm() {
  const [form, setForm] = useState({ senderName: '', receiverName: '', pickup: '', dropoff: '', parcelType: 'package', weight: '' });
  const [submitted, setSubmitted] = useState(false);
  const valid = form.senderName && form.receiverName && form.pickup && form.dropoff;
  const inp = (label: string, key: keyof typeof form, ph: string) => (
    <div style={{ marginBottom: '14px' }}>
      <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: '6px' }}>{label}</p>
      <input value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} placeholder={ph}
        style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: '10px', padding: '11px 14px', fontSize: '13px', color: 'var(--text)', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
    </div>
  );
  if (submitted) return (
    <div style={{ textAlign: 'center', padding: '56px 24px' }}>
      <div style={{ fontSize: '52px', marginBottom: '16px' }}>📦</div>
      <h3 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text)', marginBottom: '8px' }}>Pickup Requested!</h3>
      <p style={{ fontSize: '13px', color: 'var(--text3)', marginBottom: '24px' }}>A driver will be assigned shortly</p>
      <button onClick={() => { setSubmitted(false); setForm({ senderName: '', receiverName: '', pickup: '', dropoff: '', parcelType: 'package', weight: '' }); }}
        style={{ padding: '11px 24px', background: 'var(--text)', border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '13px', color: 'var(--bg)', cursor: 'pointer' }}>New Request</button>
    </div>
  );
  return (
    <div style={{ padding: '20px' }}>
      <div style={{ background: 'var(--card)', borderRadius: '16px', padding: '18px', border: '1px solid var(--border)', marginBottom: '14px' }}>
        <p style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '16px', lineHeight: 1.5 }}>Example: Parcel from <strong style={{ color: 'var(--text)' }}>Kigali Heights</strong> → <strong style={{ color: 'var(--text)' }}>Nyamirambo</strong></p>
        {inp('Sender Name', 'senderName', 'Your name')}
        {inp('Receiver Name', 'receiverName', "Receiver's name")}
        {inp('Pickup Location', 'pickup', 'e.g. Kigali Heights, KG 7 Ave')}
        {inp('Delivery Location', 'dropoff', 'e.g. Nyamirambo, KN 4 St')}
        <div style={{ marginBottom: '14px' }}>
          <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: '8px' }}>Parcel Type</p>
          <div style={{ display: 'flex', gap: '8px' }}>
            {['document', 'package', 'fragile'].map(t => (
              <button key={t} onClick={() => setForm(f => ({ ...f, parcelType: t }))}
                style={{ flex: 1, padding: '9px', borderRadius: '10px', border: `1px solid ${form.parcelType === t ? 'var(--text)' : 'var(--border)'}`, background: form.parcelType === t ? 'var(--text)' : 'transparent', cursor: 'pointer', fontSize: '11px', fontWeight: 700, textTransform: 'capitalize', color: form.parcelType === t ? 'var(--bg)' : 'var(--text3)' }}>
                {t}
              </button>
            ))}
          </div>
        </div>
        {inp('Estimated Weight (kg)', 'weight', 'e.g. 2.5')}
      </div>
      <button onClick={() => setSubmitted(true)} disabled={!valid}
        style={{ width: '100%', padding: '14px', background: 'var(--text)', border: 'none', borderRadius: '12px', fontWeight: 800, fontSize: '15px', color: 'var(--bg)', cursor: 'pointer', opacity: valid ? 1 : 0.4 }}>
        🚴 Request Pickup
      </button>
    </div>
  );
}

function ProductGrid({ items, cart, onAdd, onRemove, pharmNote }: { items: ShopItem[]; cart: CartEntry[]; onAdd: (i: ShopItem) => void; onRemove: (id: string) => void; pharmNote?: boolean; }) {
  return (
    <div style={{ padding: '16px' }}>
      {pharmNote && (
        <div style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '12px', padding: '12px 14px', marginBottom: '16px', display: 'flex', gap: '10px' }}>
          <AlertCircle size={14} color="#f59e0b" style={{ flexShrink: 0, marginTop: '1px' }} />
          <p style={{ fontSize: '12px', color: '#f59e0b', lineHeight: 1.5, margin: 0 }}>Some medicines may require a prescription. Please consult a pharmacist.</p>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
        {items.map(item => {
          const inCart = cart.find(c => c.id === item.id);
          return (
            <div key={item.id} style={{ background: 'var(--card)', borderRadius: '14px', overflow: 'hidden', border: '1px solid var(--border)' }}>
              <img src={item.image} alt={item.name} style={{ width: '100%', height: '100px', objectFit: 'cover' }} />
              <div style={{ padding: '10px' }}>
                <p style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text)', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</p>
                <p style={{ fontSize: '10px', color: 'var(--text3)', marginBottom: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.store}</p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <p style={{ fontWeight: 800, fontSize: '13px', color: 'var(--text)' }}>{item.price.toLocaleString()} RWF</p>
                  {inCart ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <button onClick={() => onRemove(item.id)} style={{ width: '24px', height: '24px', borderRadius: '6px', background: 'var(--bg3)', border: '1px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text)' }}><Minus size={10} /></button>
                      <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text)', minWidth: '14px', textAlign: 'center' }}>{inCart.qty}</span>
                      <button onClick={() => onAdd(item)} style={{ width: '24px', height: '24px', borderRadius: '6px', background: 'var(--text)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--bg)' }}><Plus size={10} /></button>
                    </div>
                  ) : (
                    <button onClick={() => onAdd(item)} style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'var(--text)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--bg)' }}><Plus size={13} /></button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RestaurantList({ search, onSelect }: { search: string; onSelect: (r: Restaurant) => void; }) {
  const filtered = RESTAURANTS.filter(r => !search || r.name.toLowerCase().includes(search.toLowerCase()) || r.items.some(i => i.name.toLowerCase().includes(search.toLowerCase())));
  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {filtered.map(r => (
        <div key={r.id} onClick={() => onSelect(r)} style={{ background: 'var(--card)', borderRadius: '16px', overflow: 'hidden', border: '1px solid var(--border)', cursor: 'pointer' }}>
          <div style={{ position: 'relative' }}>
            <img src={r.image} alt={r.name} style={{ width: '100%', height: '140px', objectFit: 'cover' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 40%, rgba(0,0,0,0.65) 100%)' }} />
            <div style={{ position: 'absolute', bottom: '12px', left: '14px', right: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div>
                <p style={{ fontSize: '16px', fontWeight: 800, color: '#fff', marginBottom: '3px' }}>{r.name}</p>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <Star size={10} color="#fbbf24" fill="#fbbf24" />
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#fff' }}>{r.rating}</span>
                  <Clock size={10} color="rgba(255,255,255,0.7)" />
                  <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.85)' }}>{r.deliveryTime}</span>
                </div>
              </div>
              <div style={{ background: 'white', borderRadius: '8px', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#111' }}>Order</span>
                <ChevronRight size={11} color="#111" />
              </div>
            </div>
          </div>
          <div style={{ padding: '10px 14px 12px', display: 'flex', gap: '6px', flexWrap: 'wrap' as const }}>
            {r.items.map(item => (
              <span key={item.id} style={{ fontSize: '11px', color: 'var(--text3)', background: 'var(--bg3)', borderRadius: '6px', padding: '3px 8px' }}>{item.name} · {item.price.toLocaleString()} RWF</span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function RestaurantDetail({ restaurant, cart, onAdd, onBack }: { restaurant: Restaurant; cart: CartEntry[]; onAdd: (item: MenuItem, name: string) => void; onBack: () => void; }) {
  return (
    <div>
      <div style={{ position: 'relative' }}>
        <img src={restaurant.image} alt={restaurant.name} style={{ width: '100%', height: '180px', objectFit: 'cover' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, transparent 45%, rgba(0,0,0,0.6) 100%)' }} />
        <button onClick={onBack} style={{ position: 'absolute', top: '14px', left: '14px', background: 'rgba(0,0,0,0.45)', border: 'none', borderRadius: '50%', width: '34px', height: '34px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}><ChevronLeft size={18} /></button>
        <div style={{ position: 'absolute', bottom: '12px', left: '14px' }}>
          <p style={{ fontSize: '20px', fontWeight: 800, color: '#fff', marginBottom: '4px' }}>{restaurant.name}</p>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Star size={12} color="#fbbf24" fill="#fbbf24" />
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#fff' }}>{restaurant.rating}</span>
            <Clock size={12} color="rgba(255,255,255,0.7)" />
            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.85)' }}>{restaurant.deliveryTime}</span>
          </div>
        </div>
      </div>
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {restaurant.items.map(item => {
          const inCart = cart.find(c => c.id === item.id);
          return (
            <div key={item.id} style={{ background: 'var(--card)', borderRadius: '14px', padding: '14px 16px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
              <div>
                <p style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text)', marginBottom: '3px' }}>{item.name}</p>
                <p style={{ fontWeight: 800, fontSize: '14px', color: 'var(--text)' }}>{item.price.toLocaleString()} RWF</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {inCart && (
                  <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: '8px', padding: '5px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Check size={11} color="#22c55e" />
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#22c55e' }}>×{inCart.qty}</span>
                  </div>
                )}
                <button onClick={() => onAdd(item, restaurant.name)} style={{ width: '32px', height: '32px', borderRadius: '10px', background: 'var(--text)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--bg)' }}><Plus size={14} /></button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function OrderTab() {
  const { profile } = useAuth();
  const [category,   setCategory]   = useState<Category>('food');
  const [screen,     setScreen]     = useState<Screen>('home');
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [cart,       setCart]       = useState<CartEntry[]>([]);
  const [search,     setSearch]     = useState('');
  const [address,    setAddress]    = useState(profile?.location || '');
  const [payMethod,  setPayMethod]  = useState<'momo' | 'cash' | 'card'>('momo');
  const [placing,    setPlacing]    = useState(false);
  const [orderId,    setOrderId]    = useState('');

  const cartCount = cart.reduce((s, i) => s + i.qty, 0);
  const subtotal  = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const delivery  = subtotal > 0 ? 500 : 0;
  const total     = subtotal + delivery;

  function addFood(item: MenuItem, name: string) {
    setCart(p => { const e = p.find(c => c.id === item.id); if (e) return p.map(c => c.id === item.id ? { ...c, qty: c.qty + 1 } : c); return [...p, { id: item.id, name: item.name, price: item.price, qty: 1, source: name }]; });
  }
  function addShop(item: ShopItem) {
    setCart(p => { const e = p.find(c => c.id === item.id); if (e) return p.map(c => c.id === item.id ? { ...c, qty: c.qty + 1 } : c); return [...p, { id: item.id, name: item.name, price: item.price, qty: 1, source: item.store }]; });
  }
  function removeOne(id: string) { setCart(p => p.map(c => c.id === id ? { ...c, qty: Math.max(0, c.qty - 1) } : c).filter(c => c.qty > 0)); }

  async function placeOrder() {
    setPlacing(true);
    try {
      const { data } = await supabase.from('food_orders').insert({ user_id: profile?.id, items: cart.map(c => ({ id: c.id, name: c.name, qty: c.qty, price: c.price })), subtotal, delivery_fee: delivery, total, delivery_address: address, payment_method: payMethod, status: 'pending' }).select('id').single();
      setOrderId(data?.id?.slice(0, 8) || 'EG' + Math.random().toString(36).slice(2, 7).toUpperCase());
    } catch { setOrderId('EG' + Math.random().toString(36).slice(2, 7).toUpperCase()); }
    finally { setCart([]); setScreen('success'); setPlacing(false); }
  }

  const hdr = (title: string, back: () => void, right?: React.ReactNode) => (
    <div style={{ background: 'var(--bg2)', padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button onClick={back} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex' }}><ChevronLeft size={22} /></button>
        <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: '18px', fontWeight: 800, color: 'var(--text)', margin: 0 }}>{title}</h2>
      </div>
      {right}
    </div>
  );

  if (screen === 'success') return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 24px', textAlign: 'center' }}>
      <div style={{ width: '70px', height: '70px', borderRadius: '50%', background: 'rgba(34,197,94,0.08)', border: '2px solid rgba(34,197,94,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: '30px' }}>🎉</div>
      <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: '24px', fontWeight: 800, color: 'var(--text)', marginBottom: '8px' }}>Order Confirmed!</h2>
      <p style={{ fontSize: '13px', color: 'var(--text3)', marginBottom: '20px' }}>Your order is being prepared</p>
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '14px 28px', marginBottom: '28px' }}>
        <p style={{ fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '4px' }}>Order ID</p>
        <p style={{ fontFamily: 'monospace', fontSize: '22px', fontWeight: 800, color: 'var(--text)' }}>#{orderId}</p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', maxWidth: '280px', marginBottom: '28px' }}>
        {[{ emoji: '👨‍🍳', label: 'Preparing', done: true }, { emoji: '🏍️', label: 'Driver Assigned', done: false }, { emoji: '🚀', label: 'On the Way', done: false }, { emoji: '📦', label: 'Delivered', done: false }].map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: s.done ? 'rgba(34,197,94,0.06)' : 'var(--card)', borderRadius: '10px', border: `1px solid ${s.done ? 'rgba(34,197,94,0.2)' : 'var(--border)'}` }}>
            <span style={{ fontSize: '18px' }}>{s.emoji}</span>
            <span style={{ fontSize: '13px', fontWeight: 700, color: s.done ? '#22c55e' : 'var(--text3)', flex: 1 }}>{s.label}</span>
            {s.done && <Check size={13} color="#22c55e" />}
          </div>
        ))}
      </div>
      <button onClick={() => { setScreen('home'); setCategory('food'); }} style={{ padding: '13px 32px', background: 'var(--text)', border: 'none', borderRadius: '12px', fontWeight: 800, fontSize: '14px', color: 'var(--bg)', cursor: 'pointer', fontFamily: 'Syne, sans-serif' }}>Back to Orders</button>
    </div>
  );

  if (screen === 'checkout') return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: '100px' }}>
      {hdr('Checkout', () => setScreen('cart'))}
      <div style={{ padding: '20px' }}>
        <div style={{ background: 'var(--card)', borderRadius: '14px', padding: '16px', marginBottom: '14px', border: '1px solid var(--border)' }}>
          <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: '12px' }}>Order Summary</p>
          {cart.map(c => (<div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}><span style={{ fontSize: '13px', color: 'var(--text)' }}>{c.name} × {c.qty}</span><span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>{(c.price * c.qty).toLocaleString()} RWF</span></div>))}
          <div style={{ borderTop: '1px solid var(--border)', marginTop: '10px', paddingTop: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}><span style={{ fontSize: '12px', color: 'var(--text3)' }}>Subtotal</span><span style={{ fontSize: '12px', color: 'var(--text)' }}>{subtotal.toLocaleString()} RWF</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}><span style={{ fontSize: '12px', color: 'var(--text3)' }}>Delivery</span><span style={{ fontSize: '12px', color: 'var(--text)' }}>{delivery.toLocaleString()} RWF</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text)' }}>Total</span><span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text)' }}>{total.toLocaleString()} RWF</span></div>
          </div>
        </div>
        <div style={{ background: 'var(--card)', borderRadius: '14px', padding: '16px', marginBottom: '14px', border: '1px solid var(--border)' }}>
          <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: '10px' }}>📍 Delivery Address</p>
          <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Enter delivery address" style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: '10px', padding: '11px 12px', fontSize: '13px', color: 'var(--text)', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <div style={{ background: 'var(--card)', borderRadius: '14px', padding: '16px', marginBottom: '24px', border: '1px solid var(--border)' }}>
          <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: '10px' }}>💳 Payment Method</p>
          <div style={{ display: 'flex', gap: '8px' }}>
            {[{ id: 'momo', emoji: '📱', label: 'MTN MoMo' }, { id: 'cash', emoji: '💵', label: 'Cash' }, { id: 'card', emoji: '💳', label: 'Card' }].map(p => (
              <button key={p.id} onClick={() => setPayMethod(p.id as any)} style={{ flex: 1, padding: '10px 4px', background: payMethod === p.id ? 'var(--text)' : 'var(--bg3)', border: `1px solid ${payMethod === p.id ? 'var(--text)' : 'var(--border)'}`, borderRadius: '10px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                <span style={{ fontSize: '18px' }}>{p.emoji}</span>
                <span style={{ fontSize: '10px', fontWeight: 700, color: payMethod === p.id ? 'var(--bg)' : 'var(--text3)', fontFamily: 'Syne, sans-serif' }}>{p.label}</span>
              </button>
            ))}
          </div>
        </div>
        <button onClick={placeOrder} disabled={placing || !address.trim()} style={{ width: '100%', padding: '15px', background: 'var(--text)', border: 'none', borderRadius: '12px', fontWeight: 800, fontSize: '15px', color: 'var(--bg)', cursor: 'pointer', fontFamily: 'Syne, sans-serif', opacity: placing || !address.trim() ? 0.45 : 1 }}>
          {placing ? '⏳ Placing Order…' : `Place Order · ${total.toLocaleString()} RWF`}
        </button>
      </div>
    </div>
  );

  if (screen === 'cart') return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: '100px' }}>
      {hdr(`Cart (${cartCount})`, () => setScreen('home'), cart.length > 0 ? <button onClick={() => setCart([])} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: 'var(--text3)', fontWeight: 600 }}>Clear all</button> : undefined)}
      {cart.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px 24px' }}>
          <ShoppingCart size={40} color="var(--text3)" style={{ margin: '0 auto 16px', display: 'block' }} />
          <p style={{ fontWeight: 700, fontSize: '16px', color: 'var(--text)', marginBottom: '8px' }}>Your cart is empty</p>
          <p style={{ fontSize: '13px', color: 'var(--text3)', marginBottom: '24px' }}>Add items to get started</p>
          <button onClick={() => setScreen('home')} style={{ padding: '11px 24px', background: 'var(--text)', border: 'none', borderRadius: '10px', fontWeight: 800, fontSize: '13px', color: 'var(--bg)', cursor: 'pointer', fontFamily: 'Syne, sans-serif' }}>Browse</button>
        </div>
      ) : (
        <div style={{ padding: '16px' }}>
          {cart.map(item => (
            <div key={item.id} style={{ background: 'var(--card)', borderRadius: '14px', padding: '14px', marginBottom: '10px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text)', marginBottom: '1px' }}>{item.name}</p>
                <p style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '4px' }}>{item.source}</p>
                <p style={{ fontWeight: 800, fontSize: '13px', color: 'var(--text)' }}>{(item.price * item.qty).toLocaleString()} RWF</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button onClick={() => removeOne(item.id)} style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'var(--bg3)', border: '1px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text)' }}><Minus size={12} /></button>
                <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text)', minWidth: '16px', textAlign: 'center' }}>{item.qty}</span>
                <button onClick={() => setCart(p => p.map(c => c.id === item.id ? { ...c, qty: c.qty + 1 } : c))} style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'var(--text)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--bg)' }}><Plus size={12} /></button>
              </div>
            </div>
          ))}
          <div style={{ background: 'var(--card)', borderRadius: '14px', padding: '16px', marginTop: '8px', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}><span style={{ fontSize: '13px', color: 'var(--text3)' }}>Subtotal</span><span style={{ fontSize: '13px', color: 'var(--text)' }}>{subtotal.toLocaleString()} RWF</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}><span style={{ fontSize: '13px', color: 'var(--text3)' }}>Delivery</span><span style={{ fontSize: '13px', color: 'var(--text)' }}>{delivery.toLocaleString()} RWF</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '10px', borderTop: '1px solid var(--border)' }}><span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text)' }}>Total</span><span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text)' }}>{total.toLocaleString()} RWF</span></div>
          </div>
          <button onClick={() => setScreen('checkout')} style={{ width: '100%', marginTop: '14px', padding: '15px', background: 'var(--text)', border: 'none', borderRadius: '12px', fontWeight: 800, fontSize: '15px', color: 'var(--bg)', cursor: 'pointer', fontFamily: 'Syne, sans-serif' }}>Proceed to Checkout →</button>
        </div>
      )}
    </div>
  );

  if (screen === 'restaurant' && restaurant) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: '100px', position: 'relative' }}>
      <RestaurantDetail restaurant={restaurant} cart={cart} onAdd={addFood} onBack={() => setScreen('home')} />
      {cartCount > 0 && (
        <button onClick={() => setScreen('cart')} style={{ position: 'fixed', bottom: '80px', left: '50%', transform: 'translateX(-50%)', background: 'var(--text)', border: 'none', borderRadius: '999px', padding: '13px 24px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', zIndex: 200, boxShadow: '0 4px 20px rgba(0,0,0,0.3)', whiteSpace: 'nowrap' }}>
          <ShoppingCart size={15} color="var(--bg)" />
          <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: '13px', color: 'var(--bg)' }}>{cartCount} item{cartCount > 1 ? 's' : ''} · {subtotal.toLocaleString()} RWF</span>
        </button>
      )}
    </div>
  );

  // ── Home ──────────────────────────────────────────────────────
  const CATS: { id: Category; label: string; icon: React.ReactNode }[] = [
    { id: 'food',     label: 'Food',     icon: <Utensils    size={18} /> },
    { id: 'parcel',   label: 'Parcel',   icon: <Package     size={18} /> },
    { id: 'shop',     label: 'Shop',     icon: <ShoppingBag size={18} /> },
    { id: 'pharmacy', label: 'Pharmacy', icon: <Pill        size={18} /> },
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: '100px', position: 'relative' }}>
      <div style={{ background: 'var(--bg2)', padding: '16px 20px 0', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div>
            <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: '20px', fontWeight: 800, color: 'var(--text)', margin: 0 }}>Orders</h2>
            <p style={{ fontSize: '11px', color: 'var(--text3)', margin: 0 }}>Fast delivery in Kigali</p>
          </div>
          <button onClick={() => setScreen('cart')} style={{ background: cartCount > 0 ? 'var(--text)' : 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '8px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '7px', fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: '13px', color: cartCount > 0 ? 'var(--bg)' : 'var(--text)' }}>
            <ShoppingCart size={15} />{cartCount > 0 && <span>{cartCount}</span>}
          </button>
        </div>
        <div style={{ position: 'relative', marginBottom: '14px' }}>
          <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
          <input placeholder="Search food, shop items, pharmacy, or send parcel…" value={search} onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: '12px', padding: '10px 12px 10px 34px', fontSize: '13px', color: 'var(--text)', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
          {search && <button onClick={() => setSearch('')} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex' }}><X size={14} /></button>}
        </div>
        <div style={{ display: 'flex', gap: '6px', paddingBottom: '14px' }}>
          {CATS.map(c => (
            <button key={c.id} onClick={() => setCategory(c.id)} style={{ flex: 1, padding: '10px 4px', borderRadius: '10px', border: `1px solid ${category === c.id ? 'var(--text)' : 'var(--border)'}`, background: category === c.id ? 'var(--text)' : 'var(--card)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', transition: 'all .15s' }}>
              <span style={{ color: category === c.id ? 'var(--bg)' : 'var(--text3)' }}>{c.icon}</span>
              <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: '10px', color: category === c.id ? 'var(--bg)' : 'var(--text3)' }}>{c.label}</span>
            </button>
          ))}
        </div>
      </div>

      {category === 'food'     && <RestaurantList search={search} onSelect={r => { setRestaurant(r); setScreen('restaurant'); }} />}
      {category === 'parcel'   && <ParcelForm />}
      {category === 'shop'     && <ProductGrid items={SHOP_ITEMS}     cart={cart} onAdd={addShop} onRemove={removeOne} />}
      {category === 'pharmacy' && <ProductGrid items={PHARMACY_ITEMS} cart={cart} onAdd={addShop} onRemove={removeOne} pharmNote />}

      {cartCount > 0 && category !== 'parcel' && (
        <button onClick={() => setScreen('cart')} style={{ position: 'fixed', bottom: '80px', left: '50%', transform: 'translateX(-50%)', background: 'var(--text)', border: 'none', borderRadius: '999px', padding: '13px 24px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', zIndex: 200, boxShadow: '0 4px 20px rgba(0,0,0,0.25)', whiteSpace: 'nowrap' }}>
          <ShoppingCart size={15} color="var(--bg)" />
          <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: '13px', color: 'var(--bg)' }}>{cartCount} item{cartCount > 1 ? 's' : ''} · {subtotal.toLocaleString()} RWF</span>
        </button>
      )}
    </div>
  );
}