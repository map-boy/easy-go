import { supabase } from './supabase';

export async function createNotification(
  userId: string,
  title: string,
  body: string,
  type: string,
  orderId?: string
) {
  await supabase.from('notifications').insert({
    user_id:  userId,
    title,
    body,
    type,
    order_id: orderId || null,
  });
}

export async function markNotificationRead(notificationId: string) {
  await supabase.from('notifications').update({ read: true }).eq('id', notificationId);
}

export async function getUnreadCount(userId: string): Promise<number> {
  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact' })
    .eq('user_id', userId)
    .eq('read', false);
  return count || 0;
}
