import { useEffect, useState } from 'react';
import { CheckCircle, Package, MapPin, Clock, Phone, ShoppingBag } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

export function DriverShopTab() {
  const { profile } = useAuth();

  const [pendingOrders, setPendingOrders] = useState<any[]>([]);
  const [activeOrder,   setActiveOrder]   = useState<any | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [acceptingId,   setAcceptingId]   = useState<string | null>(null);
  const [lastDelivered, setLastDelivered] = useState<any | null>(null);
  const [msg,           setMsg]           = useState('');
  const [msgType,       setMsgType]       = useState<'success' | 'error'>('success');

  useEffect(() => {
    if (!profile?.id) return;
    loadOrders();
    const ch = supabase.channel('driver-shop-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'food_orders' }, () => loadOrders())
      .subscribe();
    const poll = setInterval(loadOrders, 5000);
    return () => { supabase.removeChannel(ch); clearInterval(poll); };
  }, [profile?.id]);

  async function loadOrders() {
    if (!profile?.id) return;
    setLoading(false);

    // Active order — only accepted/in_transit (not delivered — delivered never blocks new orders)
    const { data: active } = await supabase
      .from('food_orders')
      .select('*, customer:user_id(full_name, phone_number, location)')
      .eq('driver_user_id', profile.id)
      .in('status', ['accepted', 'in_transit'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Separate: last delivered order waiting for receiver confirmation (to show payout status)
    const { data: lastDelivered } = await supabase
      .from('food_orders')
      .select('*, customer:user_id(full_name, phone_number, location)')
      .eq('driver_user_id', profile.id)
      .eq('status', 'delivered')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    setActiveOrder(active || null);
    setLastDelivered(lastDelivered || null);

    // Pending orders with no driver yet
    const { data: pending } = await supabase
      .from('food_orders')
      .select('*, customer:user_id(full_name, phone_number, location)')
      .eq('status', 'pending')
      .is('driver_user_id', null)
      .order('created_at', { ascending: false });

    setPendingOrders(pending || []);
  }

  function showMsg(text: string, type: 'success' | 'error' = 'success') {
    setMsg(text);
    setMsgType(type);
    setTimeout(() => setMsg(''), 3500);
  }

  async function acceptOrder(order: any) {
    if (!profile?.id) return;
    setAcceptingId(order.id);
    try {
      // Build update — only include driver_name/driver_phone if columns exist
      const updatePayload: any = {
        driver_user_id: profile.id,
        status:         'accepted',
        updated_at:     new Date().toISOString(),
      };
      // Try to set name/phone — will be ignored if columns don't exist yet
      if ((profile as any).full_name)    updatePayload.driver_name  = (profile as any).full_name;
      if ((profile as any).phone_number) updatePayload.driver_phone = (profile as any).phone_number;

      const { error } = await supabase.from('food_orders').update(updatePayload).eq('id', order.id);

      if (error) throw error;
      showMsg('✅ Order accepted! Go pick it up.');
      loadOrders();
    } catch (e: any) {
      showMsg('❌ Failed: ' + e.message, 'error');
    } finally {
      setAcceptingId(null);
    }
  }

  async function markPickedUp(order: any) {
    const { error } = await supabase.from('food_orders').update({
      status:     'in_transit',
      updated_at: new Date().toISOString(),
    }).eq('id', order.id);
    if (error) showMsg('❌ ' + error.message, 'error');
    else { showMsg('🚀 On the way to customer!'); loadOrders(); }
  }

  async function markDelivered(order: any) {
    const { error } = await supabase.from('food_orders').update({
      status:           'delivered',
      driver_confirmed: true,
      updated_at:       new Date().toISOString(),
    }).eq('id', order.id);
    if (error) showMsg('❌ ' + error.message, 'error');
    else { showMsg('📦 Marked as delivered! Waiting for customer to confirm receipt.'); loadOrders(); }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function itemsSummary(items: any[]) {
    if (!items?.length) return '—';
    return items.map((i: any) => `${i.name} ×${i.qty}`).join(', ');
  }

  function timeAgo(ts: string) {
    const mins = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
    if (mins < 1)  return 'just now';
    if (mins < 60) return `${mins}m ago`;
    return `${Math.round(mins / 60)}h ago`;
  }

  const statusColor = (s: string) =>
    s === 'accepted'  ? '#8b5cf6' :
    s === 'in_transit'? '#3b82f6' :
    s === 'delivered' ? '#22c55e' : '#f5c518';

  const statusLabel = (s: string) =>
    s === 'accepted'   ? '🏍️ Accepted — Go Pick Up' :
    s === 'in_transit' ? '🚀 In Transit'              :
    s === 'delivered'  ? '✅ Delivered'                : s;

  // ── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', paddingBottom: '100px' }}>

      {/* Header */}
      <div style={{ background: 'var(--bg2)', padding: '16px 16px 12px', borderBottom: '1px solid var(--border)' }}>
        <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: '18px', fontWeight: 800, color: 'var(--text)', marginBottom: '2px' }}>
          🛍️ Shop Orders
        </h2>
        <p style={{ fontSize: '12px', color: 'var(--text3)' }}>
          {activeOrder ? '1 active delivery' : `${pendingOrders.length} order${pendingOrders.length !== 1 ? 's' : ''} waiting`}
        </p>
      </div>

      {/* Toast */}
      {msg && (
        <div style={{ margin: '12px 16px 0', padding: '12px 14px', borderRadius: '10px', background: msgType === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${msgType === 'success' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`, fontSize: '13px', fontWeight: 700, color: msgType === 'success' ? 'var(--green)' : 'var(--red)' }}>
          {msg}
        </div>
      )}

      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

        {/* ── ACTIVE ORDER ── */}
        {activeOrder && (
          <div>
            <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '10px' }}>
              🔴 Your Active Delivery
            </p>
            <div style={{ background: 'var(--bg2)', border: `2px solid ${statusColor(activeOrder.status)}44`, borderRadius: '16px', overflow: 'hidden' }}>

              {/* Status banner */}
              <div style={{ background: `${statusColor(activeOrder.status)}14`, padding: '12px 16px', borderBottom: `1px solid ${statusColor(activeOrder.status)}22`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={{ fontWeight: 800, fontSize: '14px', color: statusColor(activeOrder.status) }}>
                  {statusLabel(activeOrder.status)}
                </p>
                <p style={{ fontWeight: 800, fontSize: '16px', color: 'var(--yellow)' }}>
                  {(activeOrder.total || 0).toLocaleString()} RWF
                </p>
              </div>

              <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>

                {/* Customer info */}
                <div style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '10px', padding: '11px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ fontSize: '10px', color: 'var(--green)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '3px' }}>📥 Customer</p>
                    <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>{activeOrder.customer?.full_name || 'Customer'}</p>
                    <p style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>
                      <MapPin size={10} style={{ display: 'inline', marginRight: '3px' }} />
                      {activeOrder.delivery_address || activeOrder.customer?.location || '—'}
                    </p>
                  </div>
                  {activeOrder.customer?.phone_number && (
                    <a href={`tel:${activeOrder.customer.phone_number}`}
                      style={{ background: 'rgba(34,197,94,0.15)', borderRadius: '10px', padding: '10px', textDecoration: 'none', fontSize: '18px', flexShrink: 0 }}>
                      📞
                    </a>
                  )}
                </div>

                {/* Items */}
                <div style={{ background: 'var(--bg3)', borderRadius: '10px', padding: '11px 14px' }}>
                  <p style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: '6px' }}>🛍️ Items</p>
                  {(activeOrder.items || []).map((item: any, i: number) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: '13px', color: 'var(--text)' }}>{item.name} <span style={{ color: 'var(--text3)' }}>×{item.qty}</span></span>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>{(item.price * item.qty).toLocaleString()} RWF</span>
                    </div>
                  ))}
                  <div style={{ borderTop: '1px solid var(--border)', marginTop: '8px', paddingTop: '8px', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text3)' }}>Delivery fee</span>
                    <span style={{ fontSize: '12px', color: 'var(--text)' }}>{(activeOrder.delivery_fee || 0).toLocaleString()} RWF</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text)' }}>Total</span>
                    <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--yellow)' }}>{(activeOrder.total || 0).toLocaleString()} RWF</span>
                  </div>
                </div>

                {/* Action buttons */}
                {activeOrder.status === 'accepted' && (
                  <button onClick={() => markPickedUp(activeOrder)}
                    style={{ width: '100%', padding: '14px', background: '#3b82f6', border: 'none', borderRadius: '12px', fontWeight: 800, fontSize: '15px', color: '#fff', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    <Package size={16} /> I Picked Up the Order
                  </button>
                )}
                {activeOrder.status === 'in_transit' && (
                  <button onClick={() => markDelivered(activeOrder)}
                    style={{ width: '100%', padding: '14px', background: '#22c55e', border: 'none', borderRadius: '12px', fontWeight: 800, fontSize: '15px', color: '#fff', cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    <CheckCircle size={16} /> Mark as Delivered
                  </button>
                )}


              </div>
            </div>
          </div>
        )}

        {/* ── LAST DELIVERY PAYOUT STATUS ── */}
        {lastDelivered && (
          <div style={{ marginBottom: '4px' }}>
            <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '10px' }}>
              📬 Last Delivery
            </p>
            <div style={{ background: 'var(--bg2)', border: `1px solid ${lastDelivered.receiver_confirmed ? 'rgba(34,197,94,0.3)' : 'rgba(245,197,24,0.3)'}`, borderRadius: '14px', padding: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <p style={{ fontWeight: 800, fontSize: '14px', color: lastDelivered.receiver_confirmed ? 'var(--green)' : 'var(--yellow)' }}>
                  {lastDelivered.receiver_confirmed ? '✅ Confirmed & Paid' : '⏳ Waiting for Customer'}
                </p>
                <p style={{ fontWeight: 800, fontSize: '15px', color: 'var(--yellow)' }}>
                  +{Math.round((lastDelivered.delivery_fee || 0) * 0.7).toLocaleString()} RWF
                </p>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '4px' }}>
                {lastDelivered.customer?.full_name || 'Customer'} · #{(lastDelivered.id as string).slice(0, 8)}
              </p>
              {lastDelivered.receiver_confirmed ? (
                <p style={{ fontSize: '12px', color: 'var(--green)', fontWeight: 700 }}>
                  🎉 {Math.round((lastDelivered.delivery_fee || 0) * 0.7).toLocaleString()} RWF added to your wallet!
                </p>
              ) : (
                <p style={{ fontSize: '12px', color: 'var(--text3)' }}>
                  Customer needs to confirm receipt in their app to release your payment.
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── PENDING ORDERS ── */}
        {!activeOrder && (
          <div>
            <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '10px' }}>
              📋 Available Shop Orders ({pendingOrders.length})
            </p>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text3)' }}>
                <div className="spinner" />
              </div>
            ) : pendingOrders.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 24px', background: 'var(--bg2)', borderRadius: '16px', border: '1px solid var(--border)' }}>
                <p style={{ fontSize: '40px', marginBottom: '12px' }}>🛍️</p>
                <p style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text)', marginBottom: '6px' }}>No shop orders yet</p>
                <p style={{ fontSize: '12px', color: 'var(--text3)' }}>New orders from customers appear here automatically</p>
              </div>
            ) : pendingOrders.map(order => (
              <div key={order.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '14px', marginBottom: '10px', overflow: 'hidden', opacity: acceptingId === order.id ? 0.6 : 1, transition: 'opacity 0.2s' }}>

                {/* Order header */}
                <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                      <span style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--text3)' }}>#{order.id.slice(0, 8)}</span>
                      <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--green)', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '6px', padding: '2px 7px' }}>✅ Paid</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Clock size={11} color="var(--text3)" />
                      <span style={{ fontSize: '11px', color: 'var(--text3)' }}>{timeAgo(order.created_at)}</span>
                    </div>
                  </div>
                  <p style={{ fontWeight: 800, fontSize: '18px', color: 'var(--yellow)' }}>
                    {(order.total || 0).toLocaleString()} RWF
                  </p>
                </div>

                <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>

                  {/* Customer */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '20px' }}>👤</span>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>{order.customer?.full_name || 'Customer'}</p>
                      <p style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '1px' }}>
                        <MapPin size={10} style={{ display: 'inline', marginRight: '3px' }} />
                        {order.delivery_address || order.customer?.location || '—'}
                      </p>
                    </div>
                    {order.customer?.phone_number && (
                      <a href={`tel:${order.customer.phone_number}`}
                        style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '8px', padding: '7px 10px', textDecoration: 'none', fontSize: '12px', fontWeight: 700, color: '#3b82f6', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Phone size={11} /> Call
                      </a>
                    )}
                  </div>

                  {/* Items summary */}
                  <div style={{ background: 'var(--bg3)', borderRadius: '8px', padding: '9px 12px' }}>
                    <p style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: '5px' }}>Items</p>
                    {(order.items || []).map((item: any, i: number) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                        <span style={{ fontSize: '12px', color: 'var(--text)' }}>{item.name} <span style={{ color: 'var(--text3)' }}>×{item.qty}</span></span>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)' }}>{(item.price * item.qty).toLocaleString()}</span>
                      </div>
                    ))}
                    <div style={{ borderTop: '1px solid var(--border)', marginTop: '6px', paddingTop: '6px', display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text3)' }}>Delivery fee</span>
                      <span style={{ fontSize: '11px', color: 'var(--text)' }}>{(order.delivery_fee || 0).toLocaleString()} RWF</span>
                    </div>
                  </div>

                  {/* Accept button */}
                  <button
                    onClick={() => acceptOrder(order)}
                    disabled={!!acceptingId}
                    style={{ width: '100%', padding: '13px', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '10px', color: 'var(--green)', cursor: acceptingId ? 'not-allowed' : 'pointer', fontWeight: 800, fontSize: '14px', fontFamily: 'Space Grotesk, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: acceptingId ? 0.6 : 1 }}>
                    {acceptingId === order.id ? '⏳ Accepting…' : <><CheckCircle size={15} /> Accept & Deliver</>}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* If driver has active order, still show count of waiting orders */}
        {activeOrder && pendingOrders.length > 0 && (
          <div style={{ background: 'rgba(245,197,24,0.06)', border: '1px solid rgba(245,197,24,0.2)', borderRadius: '12px', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ShoppingBag size={16} color="var(--yellow)" />
            <p style={{ fontSize: '13px', color: 'var(--text3)', fontWeight: 600 }}>
              <span style={{ color: 'var(--yellow)', fontWeight: 800 }}>{pendingOrders.length}</span> more order{pendingOrders.length > 1 ? 's' : ''} waiting — finish current delivery first
            </p>
          </div>
        )}
      </div>
    </div>
  );
}