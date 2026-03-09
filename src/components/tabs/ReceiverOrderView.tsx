import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Search, ShoppingCart, X, Plus, Minus, ChevronLeft, Star, Clock, MapPin, Check } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────
interface FoodItem {
  id: string;
  name: string;
  description: string;
  ingredients: string;
  price: number;
  image_url: string;
  category: string;
  restaurant_name: string;
  restaurant_id: string;
  estimated_minutes: number;
  rating: number;
  is_available: boolean;
}

interface CartItem extends FoodItem { qty: number; }

type Screen = 'list' | 'detail' | 'cart' | 'checkout' | 'success';
type FilterType = 'all' | 'popular' | 'fast' | 'cheap';

const CATEGORIES = [
  { id: 'all',        emoji: '🍽️', label: 'All'       },
  { id: 'fast_food',  emoji: '🍔', label: 'Fast Food' },
  { id: 'local',      emoji: '🍛', label: 'Local'     },
  { id: 'drinks',     emoji: '🥤', label: 'Drinks'    },
  { id: 'snacks',     emoji: '🍿', label: 'Snacks'    },
  { id: 'desserts',   emoji: '🍰', label: 'Desserts'  },
];

const DEMO_FOODS: FoodItem[] = [
  { id: '1', name: 'Brochettes', description: 'Grilled meat skewers — a Rwandan classic served with chips and salad.', ingredients: 'Beef, onions, peppers, spices, chips', price: 2500, image_url: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=400', category: 'local', restaurant_name: 'Mama Cantine', restaurant_id: 'r1', estimated_minutes: 20, rating: 4.8, is_available: true },
  { id: '2', name: 'Isombe na Ibinyobwa', description: 'Traditional cassava leaves cooked with groundnuts and spices.', ingredients: 'Cassava leaves, groundnuts, onion, palm oil, spices', price: 1800, image_url: 'https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?w=400', category: 'local', restaurant_name: 'Inzozi Kitchen', restaurant_id: 'r2', estimated_minutes: 30, rating: 4.6, is_available: true },
  { id: '3', name: 'Chicken Burger', description: 'Crispy chicken burger with lettuce, tomato and special sauce.', ingredients: 'Chicken fillet, bun, lettuce, tomato, sauce', price: 4500, image_url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400', category: 'fast_food', restaurant_name: 'Quick Bites KG', restaurant_id: 'r3', estimated_minutes: 15, rating: 4.4, is_available: true },
  { id: '4', name: 'Samosas (3 pcs)', description: 'Crispy fried samosas filled with spiced vegetables.', ingredients: 'Flour, potatoes, peas, onion, spices', price: 1200, image_url: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=400', category: 'snacks', restaurant_name: 'Spice Corner', restaurant_id: 'r4', estimated_minutes: 10, rating: 4.5, is_available: true },
  { id: '5', name: 'Fresh Mango Juice', description: 'Cold freshly squeezed mango juice.', ingredients: 'Mangoes, water, sugar', price: 1000, image_url: 'https://images.unsplash.com/photo-1546173159-315724a31696?w=400', category: 'drinks', restaurant_name: 'Fruit Paradise', restaurant_id: 'r5', estimated_minutes: 5, rating: 4.9, is_available: true },
  { id: '6', name: 'Chocolate Cake Slice', description: 'Rich chocolate cake with cream frosting.', ingredients: 'Chocolate, flour, eggs, butter, cream', price: 3000, image_url: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=400', category: 'desserts', restaurant_name: 'Sweet Dreams', restaurant_id: 'r6', estimated_minutes: 5, rating: 4.7, is_available: true },
  { id: '7', name: 'Pizza Margherita', description: 'Classic pizza with tomato sauce and mozzarella.', ingredients: 'Dough, tomato, mozzarella, basil, olive oil', price: 8000, image_url: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=400', category: 'fast_food', restaurant_name: 'Roma Pizza', restaurant_id: 'r7', estimated_minutes: 25, rating: 4.3, is_available: true },
  { id: '8', name: 'Ugali na Nyama', description: 'Stiff maize porridge served with beef stew.', ingredients: 'Maize flour, beef, tomatoes, onion, spices', price: 2000, image_url: 'https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?w=400', category: 'local', restaurant_name: 'Mama Cantine', restaurant_id: 'r1', estimated_minutes: 25, rating: 4.5, is_available: true },
];

export function ReceiverOrderView({ onClose }: { onClose: () => void }) {
  const { profile } = useAuth();

  const [screen,    setScreen]    = useState<Screen>('list');
  const [foods,     setFoods]     = useState<FoodItem[]>(DEMO_FOODS);
  const [selected,  setSelected]  = useState<FoodItem | null>(null);
  const [cart,      setCart]      = useState<CartItem[]>([]);
  const [category,  setCategory]  = useState('all');
  const [search,    setSearch]    = useState('');
  const [filter,    setFilter]    = useState<FilterType>('all');
  const [qty,       setQty]       = useState(1);
  const [address,   setAddress]   = useState(profile?.location || '');
  const [payMethod, setPayMethod] = useState<'momo' | 'cash'>('momo');
  const [placing,   setPlacing]   = useState(false);
  const [orderId,   setOrderId]   = useState('');
  const catRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadFoods(); }, []);

  async function loadFoods() {
    const { data } = await supabase.from('food_items').select('*').eq('is_available', true).order('rating', { ascending: false });
    if (data && data.length > 0) setFoods(data);
  }

  const filtered = foods.filter(f => {
    const matchCat    = category === 'all' || f.category === category;
    const matchSearch = !search || f.name.toLowerCase().includes(search.toLowerCase()) || f.restaurant_name.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === 'all' ? true : filter === 'popular' ? f.rating >= 4.5 : filter === 'fast' ? f.estimated_minutes <= 15 : filter === 'cheap' ? f.price <= 2000 : true;
    return matchCat && matchSearch && matchFilter && f.is_available;
  });

  const cartCount   = cart.reduce((s, i) => s + i.qty, 0);
  const subtotal    = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const deliveryFee = subtotal > 0 ? 500 : 0;
  const total       = subtotal + deliveryFee;

  function addToCart(item: FoodItem, q = 1) {
    setCart(prev => {
      const ex = prev.find(c => c.id === item.id);
      if (ex) return prev.map(c => c.id === item.id ? { ...c, qty: c.qty + q } : c);
      return [...prev, { ...item, qty: q }];
    });
  }

  function updateQty(id: string, delta: number) {
    setCart(prev => prev.map(c => c.id === id ? { ...c, qty: Math.max(0, c.qty + delta) } : c).filter(c => c.qty > 0));
  }

  async function placeOrder() {
    if (!profile || cart.length === 0) return;
    setPlacing(true);
    try {
      const { data, error } = await supabase.from('food_orders').insert({
        user_id: profile.id,
        items: cart.map(c => ({ id: c.id, name: c.name, qty: c.qty, price: c.price })),
        subtotal, delivery_fee: deliveryFee, total,
        delivery_address: address, payment_method: payMethod, status: 'pending',
      }).select('id').single();
      if (error) throw error;
      setOrderId(data?.id?.slice(0, 8) || 'XXXXX');
      setCart([]);
      setScreen('success');
    } catch {
      alert('Failed to place order. Please try again.');
    } finally {
      setPlacing(false);
    }
  }

  if (screen === 'success') return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 24px', textAlign: 'center' }}>
      <div style={{ fontSize: '64px', marginBottom: '16px' }}>🎉</div>
      <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '24px', fontWeight: 800, color: 'var(--text)', marginBottom: '8px' }}>Order Placed!</h2>
      <p style={{ fontSize: '14px', color: 'var(--text3)', marginBottom: '6px' }}>Your food is being prepared</p>
      <div style={{ background: 'rgba(245,197,24,0.1)', border: '1px solid rgba(245,197,24,0.3)', borderRadius: '12px', padding: '12px 24px', marginBottom: '24px' }}>
        <p style={{ fontSize: '13px', color: 'var(--text3)' }}>Order ID</p>
        <p style={{ fontSize: '20px', fontWeight: 800, color: 'var(--yellow)', fontFamily: 'monospace' }}>#{orderId}</p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', maxWidth: '300px' }}>
        {[
          { emoji: '👨‍🍳', label: 'Preparing',      done: true  },
          { emoji: '🏍️', label: 'Driver Assigned', done: false },
          { emoji: '🚀', label: 'On the Way',       done: false },
          { emoji: '📦', label: 'Delivered',        done: false },
        ].map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px', background: s.done ? 'rgba(34,197,94,0.08)' : 'var(--card)', borderRadius: '10px', border: `1px solid ${s.done ? 'rgba(34,197,94,0.2)' : 'var(--border)'}` }}>
            <span style={{ fontSize: '20px' }}>{s.emoji}</span>
            <span style={{ fontSize: '13px', fontWeight: 700, color: s.done ? 'var(--green)' : 'var(--text3)' }}>{s.label}</span>
            {s.done && <Check size={14} color="var(--green)" style={{ marginLeft: 'auto' }} />}
          </div>
        ))}
      </div>
      <button onClick={onClose} style={{ marginTop: '24px', padding: '13px 32px', background: 'var(--yellow)', border: 'none', borderRadius: '12px', fontWeight: 800, fontSize: '14px', color: '#080c14', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif' }}>
        Back to Home
      </button>
    </div>
  );

  if (screen === 'checkout') return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: '100px' }}>
      <div style={{ background: 'var(--bg2)', padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '12px', position: 'sticky', top: 0, zIndex: 100 }}>
        <button onClick={() => setScreen('cart')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex' }}><ChevronLeft size={22} /></button>
        <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '18px', fontWeight: 800, color: 'var(--text)' }}>Checkout</h2>
      </div>
      <div style={{ padding: '20px' }}>
        <div style={{ background: 'var(--card)', borderRadius: '14px', padding: '16px', marginBottom: '16px', border: '1px solid var(--border)' }}>
          <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '10px' }}>Order Summary</p>
          {cart.map(c => (
            <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontSize: '13px', color: 'var(--text)' }}>{c.name} × {c.qty}</span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>{(c.price * c.qty).toLocaleString()} RWF</span>
            </div>
          ))}
          <div style={{ borderTop: '1px solid var(--border)', marginTop: '10px', paddingTop: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text3)' }}>Subtotal</span>
              <span style={{ fontSize: '12px', color: 'var(--text)' }}>{subtotal.toLocaleString()} RWF</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text3)' }}>Delivery fee</span>
              <span style={{ fontSize: '12px', color: 'var(--text)' }}>{deliveryFee.toLocaleString()} RWF</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text)' }}>Total</span>
              <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--yellow)' }}>{total.toLocaleString()} RWF</span>
            </div>
          </div>
        </div>
        <div style={{ background: 'var(--card)', borderRadius: '14px', padding: '16px', marginBottom: '16px', border: '1px solid var(--border)' }}>
          <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '10px' }}>📍 Delivery Address</p>
          <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Enter your delivery address"
            style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: '10px', padding: '11px 12px', fontSize: '13px', color: 'var(--text)', fontFamily: 'Space Grotesk, sans-serif', outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <div style={{ background: 'var(--card)', borderRadius: '14px', padding: '16px', marginBottom: '24px', border: '1px solid var(--border)' }}>
          <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '10px' }}>💳 Payment Method</p>
          <div style={{ display: 'flex', gap: '8px' }}>
            {[{ id: 'momo', emoji: '📱', label: 'MTN MoMo' }, { id: 'cash', emoji: '💵', label: 'Cash' }].map(p => (
              <button key={p.id} onClick={() => setPayMethod(p.id as any)}
                style={{ flex: 1, padding: '12px', background: payMethod === p.id ? 'rgba(245,197,24,0.1)' : 'var(--bg3)', border: `2px solid ${payMethod === p.id ? 'rgba(245,197,24,0.5)' : 'var(--border)'}`, borderRadius: '10px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                <span style={{ fontSize: '22px' }}>{p.emoji}</span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: payMethod === p.id ? 'var(--yellow)' : 'var(--text3)', fontFamily: 'Space Grotesk, sans-serif' }}>{p.label}</span>
              </button>
            ))}
          </div>
        </div>
        <button onClick={placeOrder} disabled={placing || !address.trim()}
          style={{ width: '100%', padding: '15px', background: 'var(--yellow)', border: 'none', borderRadius: '14px', fontWeight: 800, fontSize: '16px', color: '#080c14', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', opacity: placing || !address.trim() ? 0.6 : 1 }}>
          {placing ? '⏳ Placing Order…' : `🍔 Place Order — ${total.toLocaleString()} RWF`}
        </button>
      </div>
    </div>
  );

  if (screen === 'cart') return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: '100px' }}>
      <div style={{ background: 'var(--bg2)', padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => setScreen('list')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex' }}><ChevronLeft size={22} /></button>
          <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '18px', fontWeight: 800, color: 'var(--text)' }}>🛒 My Cart ({cartCount})</h2>
        </div>
        {cart.length > 0 && <button onClick={() => setCart([])} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: 'var(--red)', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600 }}>Clear</button>}
      </div>
      {cart.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 24px' }}>
          <p style={{ fontSize: '48px', marginBottom: '12px' }}>🛒</p>
          <p style={{ fontWeight: 700, fontSize: '16px', color: 'var(--text)', marginBottom: '8px' }}>Your cart is empty</p>
          <p style={{ fontSize: '13px', color: 'var(--text3)', marginBottom: '24px' }}>Add some food to get started</p>
          <button onClick={() => setScreen('list')} style={{ padding: '12px 24px', background: 'var(--yellow)', border: 'none', borderRadius: '12px', fontWeight: 800, fontSize: '14px', color: '#080c14', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif' }}>Browse Food</button>
        </div>
      ) : (
        <div style={{ padding: '16px' }}>
          {cart.map(item => (
            <div key={item.id} style={{ background: 'var(--card)', borderRadius: '14px', padding: '14px', marginBottom: '10px', border: '1px solid var(--border)', display: 'flex', gap: '12px', alignItems: 'center' }}>
              <img src={item.image_url} alt={item.name} style={{ width: '60px', height: '60px', borderRadius: '10px', objectFit: 'cover', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text)', marginBottom: '2px' }}>{item.name}</p>
                <p style={{ fontSize: '12px', color: 'var(--text3)' }}>{item.restaurant_name}</p>
                <p style={{ fontSize: '14px', fontWeight: 800, color: 'var(--yellow)', marginTop: '4px' }}>{(item.price * item.qty).toLocaleString()} RWF</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button onClick={() => updateQty(item.id, -1)} style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'var(--bg3)', border: '1px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text)' }}><Minus size={12} /></button>
                <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text)', minWidth: '16px', textAlign: 'center' }}>{item.qty}</span>
                <button onClick={() => updateQty(item.id, 1)} style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'var(--yellow)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#080c14' }}><Plus size={12} /></button>
              </div>
            </div>
          ))}
          <div style={{ background: 'var(--card)', borderRadius: '14px', padding: '16px', marginTop: '8px', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontSize: '13px', color: 'var(--text3)' }}>Subtotal</span>
              <span style={{ fontSize: '13px', color: 'var(--text)' }}>{subtotal.toLocaleString()} RWF</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontSize: '13px', color: 'var(--text3)' }}>Delivery fee</span>
              <span style={{ fontSize: '13px', color: 'var(--text)' }}>{deliveryFee.toLocaleString()} RWF</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '10px', borderTop: '1px solid var(--border)' }}>
              <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text)' }}>Total</span>
              <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--yellow)' }}>{total.toLocaleString()} RWF</span>
            </div>
          </div>
          <button onClick={() => setScreen('checkout')} style={{ width: '100%', marginTop: '14px', padding: '15px', background: 'var(--yellow)', border: 'none', borderRadius: '14px', fontWeight: 800, fontSize: '16px', color: '#080c14', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif' }}>
            Proceed to Checkout →
          </button>
        </div>
      )}
    </div>
  );

  if (screen === 'detail' && selected) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: '100px' }}>
      <div style={{ position: 'relative' }}>
        <img src={selected.image_url} alt={selected.name} style={{ width: '100%', height: '260px', objectFit: 'cover' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, transparent 40%, rgba(8,12,20,0.8) 100%)' }} />
        <button onClick={() => setScreen('list')} style={{ position: 'absolute', top: '16px', left: '16px', background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: '50%', width: '36px', height: '36px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
          <ChevronLeft size={20} />
        </button>
        {cartCount > 0 && (
          <button onClick={() => setScreen('cart')} style={{ position: 'absolute', top: '16px', right: '16px', background: 'var(--yellow)', border: 'none', borderRadius: '20px', padding: '6px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 800, fontSize: '13px', color: '#080c14' }}>
            <ShoppingCart size={14} /> {cartCount}
          </button>
        )}
      </div>
      <div style={{ padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
          <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '22px', fontWeight: 800, color: 'var(--text)', flex: 1, marginRight: '12px' }}>{selected.name}</h2>
          <p style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '22px', fontWeight: 800, color: 'var(--yellow)', whiteSpace: 'nowrap' }}>{selected.price.toLocaleString()} RWF</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Star size={13} color="#f5c518" fill="#f5c518" /><span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>{selected.rating}</span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={13} color="var(--text3)" /><span style={{ fontSize: '13px', color: 'var(--text3)' }}>{selected.estimated_minutes} min</span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><MapPin size={13} color="var(--text3)" /><span style={{ fontSize: '13px', color: 'var(--text3)' }}>{selected.restaurant_name}</span></div>
        </div>
        <p style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.6, marginBottom: '14px' }}>{selected.description}</p>
        {selected.ingredients && (
          <div style={{ background: 'var(--card)', borderRadius: '12px', padding: '14px', marginBottom: '16px', border: '1px solid var(--border)' }}>
            <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '6px' }}>🥗 Ingredients</p>
            <p style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.6 }}>{selected.ingredients}</p>
          </div>
        )}
        <div style={{ background: 'rgba(245,197,24,0.06)', border: '1px solid rgba(245,197,24,0.2)', borderRadius: '12px', padding: '14px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Clock size={16} color="var(--yellow)" />
          <div>
            <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--yellow)' }}>Estimated delivery</p>
            <p style={{ fontSize: '13px', color: 'var(--text)' }}>{selected.estimated_minutes}–{selected.estimated_minutes + 10} minutes</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>Quantity</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button onClick={() => setQty(q => Math.max(1, q - 1))} style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'var(--bg3)', border: '1px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text)' }}><Minus size={14} /></button>
            <span style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text)', minWidth: '24px', textAlign: 'center' }}>{qty}</span>
            <button onClick={() => setQty(q => q + 1)} style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'var(--yellow)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#080c14' }}><Plus size={14} /></button>
          </div>
        </div>
        <button onClick={() => { addToCart(selected, qty); setQty(1); setScreen('list'); }}
          style={{ width: '100%', padding: '15px', background: 'var(--yellow)', border: 'none', borderRadius: '14px', fontWeight: 800, fontSize: '16px', color: '#080c14', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif' }}>
          🛒 Add to Cart — {(selected.price * qty).toLocaleString()} RWF
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: '80px' }}>
      <div style={{ background: 'var(--bg2)', padding: '16px 20px 0', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex' }}><ChevronLeft size={22} /></button>
            <div>
              <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '18px', fontWeight: 800, color: 'var(--text)', margin: 0 }}>🍔 Order Food</h2>
              <p style={{ fontSize: '11px', color: 'var(--text3)', margin: 0 }}>Fast delivery in Kigali</p>
            </div>
          </div>
          <button onClick={() => setScreen('cart')} style={{ background: cartCount > 0 ? 'var(--yellow)' : 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 800, fontSize: '13px', color: cartCount > 0 ? '#080c14' : 'var(--text)' }}>
            <ShoppingCart size={16} />{cartCount > 0 && <span>{cartCount}</span>}
          </button>
        </div>
        <div style={{ position: 'relative', marginBottom: '12px' }}>
          <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
          <input placeholder="Search food or restaurant…" value={search} onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: '12px', padding: '10px 12px 10px 34px', fontSize: '13px', color: 'var(--text)', fontFamily: 'Space Grotesk, sans-serif', outline: 'none', boxSizing: 'border-box' }} />
          {search && <button onClick={() => setSearch('')} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex' }}><X size={14} /></button>}
        </div>
        <div ref={catRef} style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '12px', scrollbarWidth: 'none' }}>
          {CATEGORIES.map(c => (
            <button key={c.id} onClick={() => setCategory(c.id)}
              style={{ flexShrink: 0, padding: '7px 14px', borderRadius: '20px', border: `1px solid ${category === c.id ? 'var(--yellow)' : 'var(--border)'}`, background: category === c.id ? 'var(--yellow)' : 'var(--card)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '12px', color: category === c.id ? '#080c14' : 'var(--text3)' }}>
              <span>{c.emoji}</span><span>{c.label}</span>
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '6px', paddingBottom: '12px', overflowX: 'auto', scrollbarWidth: 'none' }}>
          {([{ id: 'all', label: 'All' }, { id: 'popular', label: '⭐ Popular' }, { id: 'fast', label: '⚡ Fast ≤15m' }, { id: 'cheap', label: '💰 ≤2000 RWF' }] as { id: FilterType; label: string }[]).map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              style={{ flexShrink: 0, padding: '5px 12px', borderRadius: '16px', border: `1px solid ${filter === f.id ? 'rgba(245,197,24,0.5)' : 'var(--border)'}`, background: filter === f.id ? 'rgba(245,197,24,0.1)' : 'transparent', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: '11px', color: filter === f.id ? 'var(--yellow)' : 'var(--text3)' }}>
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ padding: '16px' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 24px' }}>
            <p style={{ fontSize: '40px', marginBottom: '12px' }}>🔍</p>
            <p style={{ fontWeight: 700, color: 'var(--text)', marginBottom: '6px' }}>No food found</p>
            <p style={{ fontSize: '13px', color: 'var(--text3)' }}>Try a different category or search</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
            {filtered.map(food => {
              const inCart = cart.find(c => c.id === food.id);
              return (
                <div key={food.id} onClick={() => { setSelected(food); setQty(1); setScreen('detail'); }}
                  style={{ background: 'var(--card)', borderRadius: '16px', overflow: 'hidden', border: '1px solid var(--border)', cursor: 'pointer', transition: 'transform .15s' }}
                  onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.02)')}
                  onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}>
                  <div style={{ position: 'relative' }}>
                    <img src={food.image_url} alt={food.name} style={{ width: '100%', height: '110px', objectFit: 'cover' }} />
                    <div style={{ position: 'absolute', top: '6px', left: '6px', background: 'rgba(0,0,0,0.55)', borderRadius: '8px', padding: '3px 7px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <Star size={10} color="#f5c518" fill="#f5c518" /><span style={{ fontSize: '10px', fontWeight: 700, color: '#fff' }}>{food.rating}</span>
                    </div>
                    <div style={{ position: 'absolute', top: '6px', right: '6px', background: 'rgba(0,0,0,0.55)', borderRadius: '8px', padding: '3px 7px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <Clock size={9} color="#fff" /><span style={{ fontSize: '10px', fontWeight: 700, color: '#fff' }}>{food.estimated_minutes}m</span>
                    </div>
                  </div>
                  <div style={{ padding: '10px' }}>
                    <p style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text)', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{food.name}</p>
                    <p style={{ fontSize: '10px', color: 'var(--text3)', marginBottom: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{food.restaurant_name}</p>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <p style={{ fontWeight: 800, fontSize: '13px', color: 'var(--yellow)' }}>{food.price.toLocaleString()} RWF</p>
                      <button onClick={e => { e.stopPropagation(); addToCart(food); }}
                        style={{ width: '28px', height: '28px', borderRadius: '8px', background: inCart ? 'var(--green)' : 'var(--yellow)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#080c14' }}>
                        {inCart ? <Check size={13} /> : <Plus size={13} />}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}