import { useEffect, useState } from 'react';
import { CheckCircle, Clock, Package, Phone, ShoppingBag } from 'lucide-react';

// Change these lines at the top of DriverOrderView.tsx
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';

// ── DriverOrderView ───────────────────────────────────────────────────────────
// Handles all SHOP / FOOD orders for the driver.
// Shown as a separate tab/view alongside DriverTab (which handles sender orders).
// ─────────────────────────────────────────────────────────────────────────────

export function DriverOrderView() {
  const { profile } = useAuth();

  const [driverInfo,       setDriverInfo]       = useState<any>(null);
  const [pendingFoodOrders, setPendingFoodOrders] = useState<any[]>([]);
  const [activeFoodOrder,   setActiveFoodOrder]   = useState<any>(null);
  const [acceptingFoodId,   setAcceptingFoodId]   = useState<string | null>(null);
  const [loading,           setLoading]           = useState(true);
  const [msg,               setMsg]               = useState('');
  const [msgType,           setMsgType]           = useState<'success' | 'error'>('success');

  useEffect(() => {
    loadAll();

    const channel = supabase.channel('driver-food-orders')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'food_orders' }, () => loadPendingFoodOrders())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'food_orders' }, () => loadAll())
      .subscribe();

    // Poll every 8s as backup in case realtime misses inserts
    const poll = setInterval(() => loadPendingFoodOrders(), 8000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
    };
  }, [profile?.id]);

  async function loadAll() {
    if (!profile) return;
    const { data: driver } = await supabase.from('drivers').select('*').eq('user_id', profile.id).single();
    setDriverInfo(driver);
    await loadPendingFoodOrders();
    await loadActiveFoodOrder(profile.id);
    setLoading(false);
  }

  async function loadPendingFoodOrders() {
    const { data, error } = await supabase
      .from('food_orders')
      .select('*')
      .eq('status', 'pending')
      .is('driver_user_id', null)
      .order('created_at', { ascending: false });
    if (!error) setPendingFoodOrders(data || []);
  }

  async function loadActiveFoodOrder(userId: string) {
    const { data } = await supabase
      .from('food_orders')
      .select('*')
      .eq('driver_user_id', userId)
      .in('status', ['accepted', 'in_transit', 'delivered'])
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setActiveFoodOrder(data || null);
  }

  function notify(m: string, type: 'success' | 'error' = 'success') {
    setMsg(m); setMsgType(type); setTimeout(() => setMsg(''), 3500);
  }

  async function acceptFoodOrder(order: any) {
    if (!driverInfo || !profile) return;
    setAcceptingFoodId(order.id);
    const { error } = await supabase.from('food_orders').update({
      driver_user_id: profile.id,
      driver_plate:   driverInfo.plate_number || '',
      status:         'accepted',
      updated_at:     new Date().toISOString(),
    }).eq('id', order.id);
    setAcceptingFoodId(null);
    if (error) { notify('❌ Failed to accept order', 'error'); return; }
    setPendingFoodOrders(prev => prev.filter(o => o.id !== order.id));
    notify('✅ Shop order accepted! Go collect the items.');
    await loadActiveFoodOrder(profile.id);
  }

  async function markFoodPickedUp() {
    if (!activeFoodOrder) return;
    await supabase.from('food_orders').update({
      status:     'in_transit',
      updated_at: new Date().toISOString(),
    }).eq('id', activeFoodOrder.id);
    notify('📦 Picked up — now delivering!');
    await loadActiveFoodOrder(profile!.id);
  }

  async function markFoodDelivered() {
    if (!activeFoodOrder || !profile) return;
    await supabase.from('food_orders').update({
      status:           'delivered',
      driver_confirmed: true,
      updated_at:       new Date().toISOString(),
    }).eq('id', activeFoodOrder.id);
    notify('🎉 Marked as delivered! Waiting for receiver to confirm.');
    await loadActiveFoodOrder(profile.id);
  }

  // Driver earns 70% of delivery_fee only
  const foodEarnings = activeFoodOrder
    ? Math.round((activeFoodOrder.delivery_fee || 0) * 0.70)
    : 0;

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '60px 0' }}>
      <div className="spinner" />
    </div>
  );

  if (!driverInfo?.is_on_duty) return (
    <div className="card" style={{ margin: '16px', textAlign: 'center', padding: '40px 24px' }}>
      <p style={{ fontSize: '40px', marginBottom: '12px' }}>🔴</p>
      <p style={{ fontWeight: 800, fontSize: '16px', color: 'var(--text)', marginBottom: '6px' }}>You are Off Duty</p>
      <p style={{ fontSize: '13px', color: 'var(--text3)' }}>Go on duty in the Driver tab to receive shop orders</p>
    </div>
  );

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100%', paddingBottom: '100px' }}>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Header */}
      <div style={{ padding: '16px 16px 0', background: 'var(--bg2)', borderBottom: '1px solid var(--border)', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '14px' }}>
          <div>
            <h2 style={{ fontWeight: 800, fontSize: '20px', color: 'var(--text)', letterSpacing: '-.02em', marginBottom: '2px' }}>
              🛍️ Shop Orders
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--text3)' }}>
              {pendingFoodOrders.length} waiting · earn 70% of delivery fee
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: '20px', padding: '5px 12px' }}>
            <ShoppingBag size={12} color="#8b5cf6" />
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#8b5cf6' }}>SHOP</span>
          </div>
        </div>
      </div>

      <div style={{ padding: '0 16px' }}>

        {/* Toast */}
        {msg && (
          <div style={{ background: msgType === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${msgType === 'success' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`, borderRadius: '10px', padding: '10px 14px', marginBottom: '12px', fontSize: '13px', fontWeight: 600, color: msgType === 'success' ? 'var(--green)' : 'var(--red)' }}>
            {msg}
          </div>
        )}

        {/* ── ACTIVE SHOP ORDER ── */}
        {activeFoodOrder && activeFoodOrder.status !== 'delivered' && (
          <div style={{ background: 'rgba(139,92,246,0.06)', border: '2px solid rgba(139,92,246,0.3)', borderRadius: '14px', padding: '16px', marginBottom: '16px' }}>

            {/* Header row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <p style={{ fontWeight: 800, fontSize: '15px', color: '#8b5cf6' }}>🛍️ Active Shop Order</p>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#8b5cf6', background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '8px', padding: '3px 10px', textTransform: 'capitalize' }}>
                {activeFoodOrder.status}
              </span>
            </div>

            {/* Earnings */}
            <div style={{ background: 'rgba(245,197,24,0.08)', border: '1px solid rgba(245,197,24,0.2)', borderRadius: '10px', padding: '10px 14px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: 600, marginBottom: '2px' }}>Your earnings (70% of delivery fee)</p>
                <p style={{ fontSize: '10px', color: 'var(--text3)' }}>
                  Delivery fee: {(activeFoodOrder.delivery_fee || 0).toLocaleString()} RWF
                </p>
              </div>
              <p style={{ fontSize: '20px', fontWeight: 900, color: 'var(--yellow)', fontFamily: 'Space Grotesk, sans-serif' }}>
                {foodEarnings.toLocaleString()} <span style={{ fontSize: '11px', fontWeight: 600 }}>RWF</span>
              </p>
            </div>

            {/* Delivery address */}
            <div style={{ background: 'var(--bg2)', borderRadius: '10px', padding: '10px 14px', marginBottom: '12px' }}>
              <p style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '4px' }}>📍 Deliver to</p>
              <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>{activeFoodOrder.delivery_address}</p>
            </div>

            {/* Items */}
            <div style={{ background: 'var(--bg2)', borderRadius: '10px', padding: '10px 14px', marginBottom: '12px' }}>
              <p style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '8px' }}>🛒 Items to deliver</p>
              {(Array.isArray(activeFoodOrder.items) ? activeFoodOrder.items : []).map((item: any, i: number) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                  <span style={{ fontSize: '13px', color: 'var(--text)' }}>{item.name} × {item.qty}</span>
                  <span style={{ fontSize: '12px', color: 'var(--text3)' }}>{(item.price * item.qty).toLocaleString()} RWF</span>
                </div>
              ))}
              <div style={{ borderTop: '1px solid var(--border)', marginTop: '8px', paddingTop: '8px', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '12px', color: 'var(--text3)' }}>Order total</span>
                <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--yellow)' }}>{(activeFoodOrder.total || 0).toLocaleString()} RWF</span>
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '8px' }}>
              {activeFoodOrder.status === 'accepted' && (
                <button onClick={markFoodPickedUp}
                  style={{ flex: 1, background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.35)', borderRadius: '10px', padding: '13px', color: '#8b5cf6', cursor: 'pointer', fontWeight: 800, fontSize: '14px', fontFamily: 'Space Grotesk, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                  <Package size={15} /> Mark Picked Up
                </button>
              )}
              {activeFoodOrder.status === 'in_transit' && (
                <button onClick={markFoodDelivered}
                  style={{ flex: 1, background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.35)', borderRadius: '10px', padding: '13px', color: 'var(--green)', cursor: 'pointer', fontWeight: 800, fontSize: '14px', fontFamily: 'Space Grotesk, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                  <CheckCircle size={15} /> Confirm Delivered
                </button>
              )}
            </div>
          </div>
        )}

        {/* Waiting for receiver confirmation */}
        {activeFoodOrder?.status === 'delivered' && activeFoodOrder?.driver_confirmed && !activeFoodOrder?.receiver_confirmed && (
          <div style={{ background: 'rgba(245,197,24,0.06)', border: '2px solid rgba(245,197,24,0.3)', borderRadius: '14px', padding: '20px', marginBottom: '16px', textAlign: 'center' }}>
            <p style={{ fontSize: '36px', marginBottom: '10px' }}>⏳</p>
            <p style={{ fontWeight: 800, fontSize: '16px', color: 'var(--yellow)', marginBottom: '6px' }}>Waiting for receiver to confirm</p>
            <p style={{ fontSize: '13px', color: 'var(--text3)', marginBottom: '12px' }}>
              Once confirmed, <strong style={{ color: 'var(--yellow)' }}>{foodEarnings.toLocaleString()} RWF</strong> will be added to your wallet.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '6px' }}>
              {[0,1,2].map(i => (
                <div key={i} style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--yellow)', animation: `spin 1.4s ease ${i * 0.2}s infinite` }} />
              ))}
            </div>
          </div>
        )}

        {/* Payment received */}
        {activeFoodOrder?.status === 'delivered' && activeFoodOrder?.receiver_confirmed && (
          <div style={{ background: 'rgba(34,197,94,0.06)', border: '2px solid rgba(34,197,94,0.3)', borderRadius: '14px', padding: '20px', marginBottom: '16px', textAlign: 'center' }}>
            <p style={{ fontSize: '36px', marginBottom: '10px' }}>🎉</p>
            <p style={{ fontWeight: 800, fontSize: '16px', color: 'var(--green)', marginBottom: '4px' }}>Payment received!</p>
            <p style={{ fontSize: '14px', color: 'var(--text3)' }}>
              <strong style={{ color: 'var(--green)' }}>{foodEarnings.toLocaleString()} RWF</strong> added to your wallet
            </p>
            {activeFoodOrder.driver_rating > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', marginTop: '10px' }}>
                {[1,2,3,4,5].map(s => (
                  <span key={s} style={{ fontSize: '18px' }}>{s <= activeFoodOrder.driver_rating ? '⭐' : '☆'}</span>
                ))}
                {activeFoodOrder.driver_comment && (
                  <span style={{ fontSize: '12px', color: 'var(--text3)', marginLeft: '6px' }}>"{activeFoodOrder.driver_comment}"</span>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── PENDING SHOP ORDERS ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <h3 style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text)' }}>
            📋 Available Shop Orders ({pendingFoodOrders.length})
          </h3>
          <span style={{ fontSize: '10px', fontWeight: 700, color: '#8b5cf6', background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.25)', borderRadius: '8px', padding: '2px 8px' }}>
            70% of delivery fee
          </span>
        </div>

        {pendingFoodOrders.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '40px 24px' }}>
            <p style={{ fontSize: '44px', marginBottom: '12px' }}>🛍️</p>
            <p style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text)', marginBottom: '6px' }}>No shop orders right now</p>
            <p style={{ fontSize: '12px', color: 'var(--text3)' }}>New orders appear here automatically every 8 seconds</p>
          </div>
        ) : (
          pendingFoodOrders.map(order => {
            const items: any[] = Array.isArray(order.items) ? order.items : [];
            const driverEarning = Math.round((order.delivery_fee || 0) * 0.70);
            return (
              <div key={order.id} style={{ background: 'var(--bg2)', border: '1px solid rgba(139,92,246,0.25)', borderRadius: '14px', padding: '14px', marginBottom: '12px', opacity: acceptingFoodId === order.id ? 0.6 : 1, transition: 'opacity 0.2s' }}>

                {/* Order header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                  <div>
                    <p style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: 'monospace', marginBottom: '2px' }}>#{(order.id as string).slice(0, 8)}</p>
                    <p style={{ fontSize: '11px', color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Clock size={10} /> {new Date(order.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontWeight: 800, fontSize: '15px', color: 'var(--yellow)' }}>
                      {(order.total || 0).toLocaleString()} RWF
                    </p>
                    <p style={{ fontSize: '11px', color: 'var(--green)', fontWeight: 700 }}>
                      You earn: {driverEarning.toLocaleString()} RWF
                    </p>
                  </div>
                </div>

                {/* Delivery destination */}
                <div style={{ background: 'var(--bg3)', borderRadius: '8px', padding: '10px 12px', marginBottom: '10px' }}>
                  <p style={{ fontSize: '10px', color: 'var(--text3)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '.06em', marginBottom: '4px' }}>
                    📍 Deliver to
                  </p>
                  <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>{order.delivery_address}</p>
                  {order.delivery_fee && (
                    <p style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>
                      Delivery fee: {order.delivery_fee.toLocaleString()} RWF
                    </p>
                  )}
                </div>

                {/* Items preview */}
                <div style={{ background: 'var(--bg3)', borderRadius: '8px', padding: '10px 12px', marginBottom: '10px' }}>
                  <p style={{ fontSize: '10px', color: 'var(--text3)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '.06em', marginBottom: '6px' }}>
                    🛒 Items ({items.length})
                  </p>
                  {items.slice(0, 3).map((item: any, i: number) => (
                    <p key={i} style={{ fontSize: '12px', color: 'var(--text)', marginBottom: '3px' }}>
                      {item.name} × {item.qty}
                    </p>
                  ))}
                  {items.length > 3 && (
                    <p style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>+{items.length - 3} more items</p>
                  )}
                </div>

                {/* Accept button */}
                <button
                  onClick={() => acceptFoodOrder(order)}
                  disabled={acceptingFoodId === order.id}
                  style={{ width: '100%', background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '10px', padding: '13px', color: '#8b5cf6', cursor: acceptingFoodId === order.id ? 'not-allowed' : 'pointer', fontWeight: 800, fontSize: '14px', fontFamily: 'Space Grotesk, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', opacity: acceptingFoodId === order.id ? 0.5 : 1 }}>
                  <CheckCircle size={15} />
                  {acceptingFoodId === order.id ? '⏳ Accepting...' : `Accept — Earn ${driverEarning.toLocaleString()} RWF`}
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}