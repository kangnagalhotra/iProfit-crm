import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Notification } from '../api/types';
import {
  listNotifications, markNotificationRead, markAllNotificationsRead,
} from '../api/notifications';

export function NotificationBell() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  function load() {
    listNotifications().then(setNotifications).catch(() => {});
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  async function handleClick(n: Notification) {
    setOpen(false);
    if (!n.isRead) {
      await markNotificationRead(n.id);
      setNotifications((ns) => ns.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
    }
    if (n.linkUrl) navigate(n.linkUrl);
  }

  async function markAllRead() {
    await markAllNotificationsRead();
    setNotifications((ns) => ns.map((n) => ({ ...n, isRead: true })));
  }

  return (
    <div className="dropdown-wrap" ref={ref}>
      <button className="notification-bell" onClick={() => setOpen((o) => !o)}>
        🔔
        {unreadCount > 0 && <span className="notification-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>
      {open && (
        <div className="dropdown-menu notification-dropdown">
          <div className="notification-header">
            <strong>Notifications</strong>
            {unreadCount > 0 && <button className="copy-btn" onClick={markAllRead}>Mark all read</button>}
          </div>
          {notifications.length === 0 ? (
            <p style={{ color: 'var(--muted)', padding: '10px 14px' }}>No notifications yet.</p>
          ) : notifications.map((n) => (
            <button
              key={n.id}
              className={`notification-item${n.isRead ? '' : ' unread'}`}
              onClick={() => handleClick(n)}
            >
              <div>{n.message}</div>
              <div className="notification-time">{new Date(n.createdAt).toLocaleString()}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
