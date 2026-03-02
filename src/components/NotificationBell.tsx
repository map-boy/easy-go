import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { markNotificationRead } from '../lib/notifications';
import { useAuth } from '../contexts/AuthContext';

export function NotificationBell() {
  const { profile } = useAuth();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!profile) return;
    loadNotifications();

    const channel = supabase
      .channel('notifications-' + profile.id)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${profile.id}`,
      }, (payload) => {
        setNotifications(prev => [payload.new, ...prev]);
        if (Notification.permission === 'granted') {
          new Notification(payload.new.title, { body: payload.new.body, icon: '/vite.svg' });
        }
      })
      .subscribe();

    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }

    return () => { supabase.removeChannel(channel); };
  }, [profile]);

  async function loadNotifications() {
    if (!profile) return;
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(20);
    setNotifications(data || []);
  }

  async function handleRead(id: string) {
    await markNotificationRead(id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }

  async function clearAll() {
    if (!profile) return;
    await supabase.from('notifications').update({ read: true }).eq('user_id', profile.id);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }

  const unread = notifications.filter(n => !n.read).length;

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{ position: 'relative', background: 'none', border: 'none', cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <Bell size={20} color="var(--text2)" />
        {unread > 0 && (
          <span style={{ position: 'absolute', top: '2px', right: '2px', width: '16px', height: '16px', background: 'var(--red)', borderRadius: '50%', fontSize: '9px', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 998 }} />
          <div style={{ position: 'absolute', top: '36px', right: 0, width: '300px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '14px', boxShadow: '0 8px 32px rgba(0,0,0,0.2)', zIndex: 999, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text)' }}>Notifications {unread > 0 && <span style={{ color: 'var(--yellow)' }}>({unread})</span>}</p>
              {unread > 0 && <button onClick={clearAll} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', color: 'var(--text3)', fontFamily: 'Space Grotesk, sans-serif' }}>Mark all read</button>}
            </div>
            <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
              {notifications.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text3)', fontSize: '13px' }}>No notifications yet</div>
              ) : notifications.map(n => (
                <div
                  key={n.id}
                  onClick={() => handleRead(n.id)}
                  style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: n.read ? 'transparent' : 'rgba(245,197,24,0.04)', cursor: 'pointer', transition: 'background .15s' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: '13px', fontWeight: n.read ? 500 : 700, color: 'var(--text)', marginBottom: '2px' }}>{n.title}</p>
                      <p style={{ fontSize: '12px', color: 'var(--text3)', lineHeight: 1.4 }}>{n.body}</p>
                      <p style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '4px' }}>{new Date(n.created_at).toLocaleString()}</p>
                    </div>
                    {!n.read && <div style={{ width: '7px', height: '7px', background: 'var(--yellow)', borderRadius: '50%', flexShrink: 0, marginTop: '4px' }} />}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
