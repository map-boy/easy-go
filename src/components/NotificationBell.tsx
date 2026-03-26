import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export function NotificationBell() {
  const { profile } = useAuth();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!profile) return;
    
    // 1. Load existing real notifications from the database
    loadNotifications();

    // 2. Real-time Listener for the 'notifications' table
    const notifyChannel = supabase
      .channel('notifications-' + profile.id)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${profile.id}`,
      }, (payload) => {
        setNotifications(prev => [payload.new, ...prev]);
        if (window.Notification?.permission === 'granted') {
          new window.Notification(payload.new.title, { body: payload.new.body });
        }
      })
      .subscribe();

    // 3. Real-time Listener for 'orders' status changes
    // This creates "Action" notifications automatically when an order updates
    const orderChannel = supabase
      .channel('order-updates-' + profile.id)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'orders',
        filter: profile.role === 'driver' ? `driver_id=eq.${profile.id}` : `sender_id=eq.${profile.id}`,
      }, (payload) => {
        const newStatus = payload.new.status;
        const oldStatus = payload.old.status;

        // Only notify if the status actually changed
        if (newStatus !== oldStatus) {
          const actionMsg = {
            id: Math.random().toString(),
            title: 'Order Update',
            body: `Order #${payload.new.id.slice(0, 8)} is now ${newStatus.replace('_', ' ')}`,
            created_at: new Date().toISOString(),
            read: false
          };
          setNotifications(prev => [actionMsg, ...prev]);
        }
      })
      .subscribe();

    return () => { 
      supabase.removeChannel(notifyChannel); 
      supabase.removeChannel(orderChannel);
    };
  }, [profile]);

  async function loadNotifications() {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', profile?.id)
      .order('created_at', { ascending: false })
      .limit(10); // Get the 10 most recent real messages
    
    if (data) setNotifications(data);
  }

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div style={{ position: 'relative' }}>
      <button 
        onClick={() => setOpen(!open)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', position: 'relative', padding: '8px' }}
      >
        <Bell size={24} color={unreadCount > 0 ? 'var(--yellow)' : '#888'} />
        {unreadCount > 0 && (
          <div style={{
            position: 'absolute', top: '6px', right: '6px',
            background: 'red', color: 'white', fontSize: '10px',
            borderRadius: '50%', width: '16px', height: '16px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 'bold', border: '2px solid var(--bg)'
          }}>
            {unreadCount}
          </div>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '50px', right: '0',
          width: '280px', maxHeight: '350px',
          background: '#1a1a1a', border: '1px solid #333',
          borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
          zIndex: 2000, display: 'flex', flexDirection: 'column', overflow: 'hidden'
        }}>
          <div style={{ padding: '12px', borderBottom: '1px solid #333', fontWeight: 800, color: 'white', fontSize: '14px', display: 'flex', justifyContent: 'space-between' }}>
            <span>Notifications</span>
            {unreadCount > 0 && <span style={{ color: 'var(--yellow)', fontSize: '10px' }}>{unreadCount} New</span>}
          </div>
          
          <div style={{ overflowY: 'auto', flex: 1, background: '#121212' }}>
            {notifications.length === 0 ? (
              <div style={{ padding: '30px 20px', textAlign: 'center', color: '#666', fontSize: '13px' }}>
                No new activity
              </div>
            ) : (
              notifications.map(n => (
                <div key={n.id} style={{
                  padding: '12px', borderBottom: '1px solid #222',
                  background: n.read ? 'transparent' : 'rgba(245,200,66,0.05)',
                  transition: 'background 0.2s'
                }}>
                  <div style={{ color: 'var(--yellow)', fontSize: '12px', fontWeight: 700, marginBottom: '2px' }}>{n.title}</div>
                  <div style={{ color: '#bbb', fontSize: '11px', lineHeight: '1.4' }}>{n.body}</div>
                  <div style={{ color: '#555', fontSize: '9px', marginTop: '6px' }}>
                    {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}