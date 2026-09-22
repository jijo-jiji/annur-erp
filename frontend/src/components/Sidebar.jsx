import { LogOut, RotateCcw, Search, X } from 'lucide-react';
import { navItemsFor } from '../lib/nav';
import { ROLE_LABEL } from '../lib/format';
import { CENTRE } from '../data/demo';
import { useStore } from '../store';
import { cx, useToast } from './ui';

export function BrandMark({ inverted, className }) {
  return (
    <span
      className={cx(
        'inline-flex size-9 shrink-0 items-center justify-center rounded-md text-[13px] font-bold tracking-wide',
        inverted ? 'bg-white text-brand-900' : 'bg-brand-800 text-white',
        className,
      )}
    >
      AN
    </span>
  );
}

export default function Sidebar({ current, role, onRoleChange, onSearch, onLogout, open, onClose }) {
  const { reset } = useStore();
  const notify = useToast();
  const items = navItemsFor(role);

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-gray-950/40 lg:hidden" onClick={onClose} aria-hidden />}
      <aside
        className={cx(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-gray-200 bg-white transition-transform lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 items-center gap-3 border-b border-gray-200 px-5">
          <BrandMark />
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-semibold text-gray-900">{CENTRE.name}</p>
            <p className="text-xs text-gray-500">Cawangan {CENTRE.branch}</p>
          </div>
          <button type="button" onClick={onClose} className="ml-auto rounded-md p-1 text-gray-500 hover:bg-gray-100 lg:hidden" aria-label="Tutup menu">
            <X className="size-5" />
          </button>
        </div>

        {onSearch && (
          <div className="px-3 pt-4">
            <button
              type="button"
              onClick={onSearch}
              className="flex w-full items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-500 hover:border-gray-400"
            >
              <Search className="size-4" />
              <span className="flex-1 text-left">Cari…</span>
              <kbd className="rounded border border-gray-200 bg-gray-50 px-1.5 font-sans text-[11px] text-gray-500">Ctrl K</kbd>
            </button>
          </div>
        )}

        <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Menu utama">
          {items.map((item, i) => {
            const Icon = item.icon;
            const active = item.id === current;
            const showGroup = item.group && item.group !== items[i - 1]?.group;
            return (
              <div key={item.id}>
                {showGroup && <p className="mb-1 mt-5 px-3 text-xs font-medium text-gray-400">{item.group}</p>}
                <a
                  href={`#/${item.id}`}
                  aria-current={active ? 'page' : undefined}
                  className={cx(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    active ? 'bg-brand-50 text-brand-800' : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900',
                  )}
                >
                  <Icon className={cx('size-[18px]', active ? 'text-brand-700' : 'text-gray-400')} aria-hidden />
                  {item.label}
                </a>
              </div>
            );
          })}
        </nav>

        <div className="border-t border-gray-200 p-4">
          <label htmlFor="role-switch" className="text-xs font-medium text-gray-500">
            Log masuk sebagai
          </label>
          <select
            id="role-switch"
            value={role}
            onChange={(e) => onRoleChange(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm font-medium text-gray-900 focus:border-brand-600 focus:outline-none"
          >
            {Object.entries(ROLE_LABEL).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
          <div className="mt-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                if (window.confirm('Set semula semua data demo kepada asal?')) {
                  reset();
                  notify('Data demo telah diset semula.', 'info');
                }
              }}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800"
            >
              <RotateCcw className="size-3.5" /> Set semula demo
            </button>
            <button type="button" onClick={onLogout} className="flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-red-700">
              <LogOut className="size-3.5" /> Log keluar
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
