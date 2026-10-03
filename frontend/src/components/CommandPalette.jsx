import { useEffect, useMemo, useRef, useState } from 'react';
import { CornerDownLeft, FileText, GraduationCap, LayoutGrid, Search, User } from 'lucide-react';
import { useStore } from '../store';
import { formLabel, rm } from '../lib/format';
import { invoiceBalance } from '../lib/domain';
import { navigate, navItemsFor } from '../lib/nav';
import { can } from '../lib/permissions';
import { cx } from './ui';

const norm = (s) => (s ?? '').toLowerCase().replace(/[\s-]/g, '');

export default function CommandPalette({ role, onClose }) {
  const { students, teachers, invoices } = useStore();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const results = useMemo(() => {
    const needle = norm(q);
    const pages = navItemsFor(role)
      .filter((n) => !needle || norm(n.label).includes(needle))
      .map((n) => ({ key: `p-${n.id}`, group: 'Halaman', icon: LayoutGrid, title: n.label, href: `#/${n.id}` }));
    if (!needle) return pages;

    const studentHits = students
      .filter((s) =>
        [s.name, s.id, s.ic, s.school, s.parent1?.name, s.parent1?.phone, s.parent2?.name, s.parent2?.phone].some((v) => norm(v).includes(needle)),
      )
      .slice(0, 6)
      .map((s) => ({
        key: `s-${s.id}`,
        group: 'Pelajar',
        icon: User,
        title: s.name,
        detail: `${s.id} · ${formLabel(s.form)} · ${s.parent1.name}`,
        href: `#/students/${s.id}`,
      }));

    const teacherHits = can(role, 'teachers.view')
      ? teachers
          .filter((t) => norm(`Cikgu ${t.name} ${t.code} ${t.subjects}`).includes(needle))
          .slice(0, 4)
          .map((t) => ({ key: `t-${t.code}`, group: 'Guru', icon: GraduationCap, title: `Cikgu ${t.name}`, detail: t.subjects, href: '#/teachers' }))
      : [];

    const invoiceHits =
      can(role, 'billing.view') && needle.length >= 3
        ? invoices
            .filter((i) => norm(i.no).includes(needle))
            .slice(0, 4)
            .map((i) => {
              const s = students.find((x) => x.id === i.studentId);
              return {
                key: `i-${i.no}`,
                group: 'Invois',
                icon: FileText,
                title: i.no,
                detail: `${s?.name} · ${invoiceBalance(i) ? `baki ${rm(invoiceBalance(i))}` : 'dibayar'}`,
                href: `#/students/${i.studentId}?tab=fees`,
              };
            })
        : [];

    return [...studentHits, ...teacherHits, ...invoiceHits, ...pages];
  }, [q, role, students, teachers, invoices]);

  const go = (r) => {
    if (!r) return;
    navigate(r.href.slice(2));
    onClose();
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(results.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(results[active]);
    }
  };

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]" onKeyDown={onKeyDown}>
      <div className="absolute inset-0 bg-gray-950/40" onClick={onClose} aria-hidden />
      <div role="dialog" aria-modal="true" aria-label="Carian" className="relative w-full max-w-xl overflow-hidden rounded-lg bg-white shadow-2xl">
        <div className="flex items-center gap-3 border-b border-gray-200 px-4">
          <Search className="size-5 text-gray-400" aria-hidden />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            placeholder="Cari pelajar, no. K/P, telefon penjaga, guru atau invois…"
            aria-label="Carian"
            className="h-14 flex-1 bg-transparent text-[15px] text-gray-900 placeholder:text-gray-400 focus:outline-none"
          />
          <kbd className="rounded border border-gray-200 px-1.5 text-[11px] text-gray-500">Esc</kbd>
        </div>
        <ul ref={listRef} className="max-h-[60vh] overflow-y-auto py-2">
          {results.length === 0 && <li className="px-4 py-8 text-center text-sm text-gray-500">Tiada hasil untuk “{q}”.</li>}
          {results.map((r, i) => {
            const header = r.group !== results[i - 1]?.group;
            const Icon = r.icon;
            return (
              <li key={r.key}>
                {header && <p className="px-4 pb-1 pt-3 text-xs font-medium text-gray-400">{r.group}</p>}
                <button
                  type="button"
                  data-active={i === active}
                  onMouseMove={() => setActive(i)}
                  onClick={() => go(r)}
                  className={cx('flex w-full items-center gap-3 px-4 py-2 text-left', i === active ? 'bg-brand-50' : '')}
                >
                  <Icon className={cx('size-4 shrink-0', i === active ? 'text-brand-700' : 'text-gray-400')} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-gray-900">{r.title}</span>
                    {r.detail && <span className="block truncate text-[13px] text-gray-500">{r.detail}</span>}
                  </span>
                  {i === active && <CornerDownLeft className="size-4 text-gray-400" aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
