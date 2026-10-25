import { useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { notificationsApi } from '../api/client';
import { clock, date, todayISO } from '../lib/format';
import { navigate } from '../lib/nav';
import { cx } from './ui';

// The bell (Phase E): what waits for this person and decisions on what they asked for, newest first.
// The server decides who is told about what (backend/core/notify.py); this only shows the person's own list.
// It checks again every minute, when the window comes back into focus and when the person opens another page. The
// sidebar (desktop) and the top bar (phone) each show a bell; they share one list and one timer.

const POLL_MS = 60000;
let shared = { unread: 0, items: [] };
const listeners = new Set();
let timer = null;
const publish = (next) => { shared = next; listeners.forEach((set) => set(next)); };
const refresh = () => notificationsApi.list().then(publish).catch(() => {});

// The first bell on screen starts the timer, the last one to go stops it
function subscribe(listener) {
  listeners.add(listener);
  if (listeners.size === 1) {
    refresh();
    timer = setInterval(refresh, POLL_MS);
    window.addEventListener('focus', refresh);
    window.addEventListener('hashchange', refresh);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('hashchange', refresh);
      shared = { unread: 0, items: [] }; // the next person to sign in starts with their own list
    }
  };
}

function useNotifications() {
  const [data, setData] = useState(shared);
  useEffect(() => subscribe(setData), []);
  return data;
}

const when = (iso) => (String(iso).slice(0, 10) === todayISO() ? clock(iso) : `${date(String(iso).slice(0, 10))} ${clock(iso)}`);

export default function NotificationBell({ align = 'left', className }) {
  const data = useNotifications();
  const [open, setOpen] = useState(false);
  const box = useRef(null);

  // Closes on a click outside or Escape
  useEffect(() => {
    if (!open) return undefined;
    const outside = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const escape = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);

  const pick = (n) => {
    setOpen(false);
    if (!n.read) notificationsApi.read([n.id]).then(refresh).catch(() => {});
    if (n.link) navigate(n.link.replace(/^#\/?/, ''));
  };
  const readAll = () => notificationsApi.readAll().then(refresh).catch(() => {});
  const label = data.unread ? `Notifikasi: ${data.unread} belum dibaca` : 'Notifikasi';

  return (
    <div ref={box} className={cx('relative', className)}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-label={label} title={label} aria-expanded={open}
        className="relative inline-flex size-9 items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 hover:text-gray-900">
        <Bell className="size-5" aria-hidden />
        {data.unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-red-600 px-1 text-center text-[11px] font-semibold leading-[18px] text-white tnum">
            {data.unread > 99 ? '99+' : data.unread}
          </span>
        )}
      </button>
      {open && (
        <div role="dialog" aria-label="Notifikasi"
          className={cx('absolute top-full z-[60] mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl',
            align === 'right' ? 'right-0' : 'left-0')}>
          <div className="flex items-center justify-between gap-2 border-b border-gray-200 px-4 py-2.5">
            <p className="text-sm font-semibold text-gray-900">Notifikasi</p>
            {data.unread > 0 && (
              <button type="button" onClick={readAll} className="inline-flex items-center gap-1 text-[13px] font-medium text-brand-700 hover:underline">
                <CheckCheck className="size-4" aria-hidden /> Tandakan semua dibaca
              </button>
            )}
          </div>
          {data.items.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-gray-500">Tiada notifikasi.</p>
          ) : (
            <ul className="max-h-[60vh] divide-y divide-gray-100 overflow-y-auto">
              {data.items.map((n) => (
                <li key={n.id}>
                  <button type="button" onClick={() => pick(n)} className={cx('flex w-full gap-2.5 px-4 py-3 text-left hover:bg-gray-50', !n.read && 'bg-brand-50/40')}>
                    <span className={cx('mt-1.5 size-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-brand-600')} aria-hidden />
                    <span className="min-w-0">
                      <span className={cx('block text-sm', n.read ? 'text-gray-700' : 'font-medium text-gray-900')}>{n.title}</span>
                      {n.body && <span className="mt-0.5 block text-[13px] text-gray-500">{n.body}</span>}
                      <span className="mt-0.5 block text-xs text-gray-400">{when(n.created_at)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
