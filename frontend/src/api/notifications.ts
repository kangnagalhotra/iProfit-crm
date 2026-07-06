import { supabase } from '../lib/supabase';
import type { Notification } from './types';

function mapNotification(row: any): Notification {
  return {
    id: row.id, type: row.type, message: row.message, linkUrl: row.link_url ?? undefined, isRead: row.is_read, createdAt: row.created_at,
  };
}

export async function listNotifications(): Promise<Notification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []).map(mapNotification);
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id);
  if (error) throw error;
}

export async function markAllNotificationsRead(): Promise<void> {
  const currentUser = (await supabase.auth.getUser()).data.user;
  const { error } = await supabase.from('notifications').update({ is_read: true }).eq('user_id', currentUser?.id).eq('is_read', false);
  if (error) throw error;
}
