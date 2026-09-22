import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { CheckCircle2, AlertCircle, X, Info } from 'lucide-react';

export function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}

// ---- Buttons ----------------------------------------------------------------

const BUTTON_VARIANTS = {
  primary: 'bg-brand-700 text-white hover:bg-brand-800 disabled:bg-brand-700/50',
  secondary: 'bg-white text-gray-800 border border-gray-300 hover:bg-gray-50 disabled:text-gray-400',
  ghost: 'text-gray-700 hover:bg-gray-100 disabled:text-gray-400',
  danger: 'bg-white text-red-700 border border-gray-300 hover:bg-red-50 hover:border-red-300',
  whatsapp: 'bg-white text-gray-800 border border-gray-300 hover:bg-gray-50',
};
const BUTTON_SIZES = {
  sm: 'h-8 px-3 text-[13px] gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
  lg: 'h-11 px-5 text-[15px] gap-2',
};

export function Button({ as: Comp = 'button', variant = 'secondary', size = 'md', className, icon: Icon, children, ...props }) {
  return (
    <Comp
      {...(Comp === 'button' && !props.type ? { type: 'button' } : {})}
      className={cx(
        'inline-flex items-center justify-center rounded-md font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...props}
    >
      {Icon && <Icon className={size === 'sm' ? 'size-3.5' : 'size-4'} aria-hidden />}
      {children}
    </Comp>
  );
}

export function IconButton({ label, icon: Icon, className, ...props }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={cx('inline-flex size-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900', className)}
      {...props}
    >
      <Icon className="size-4" aria-hidden />
    </button>
  );
}

// WhatsApp brand glyph (lucide has no brand icons)
export function WhatsAppIcon({ className = 'size-4' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="#25D366">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.9-4.45 9.9-9.91A9.84 9.84 0 0 0 12.04 2Zm0 18.15h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.11.82.83-3.04-.2-.31a8.23 8.23 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24a8.2 8.2 0 0 1 8.23 8.25c0 4.54-3.7 8.23-8.24 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.25-.64.81-.79.97-.14.17-.29.19-.54.06a6.76 6.76 0 0 1-1.99-1.23 7.45 7.45 0 0 1-1.38-1.71c-.14-.25-.01-.38.11-.51.11-.11.25-.29.37-.43.13-.15.17-.25.25-.42.08-.16.04-.31-.02-.43-.06-.13-.56-1.35-.77-1.84-.2-.49-.41-.42-.56-.43h-.48a.92.92 0 0 0-.66.31c-.23.25-.87.85-.87 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.1-.22-.16-.47-.29Z" />
    </svg>
  );
}

// ---- Layout -----------------------------------------------------------------

export function PageHeader({ title, description, actions, children }) {
  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-gray-900">{title}</h1>
          {description && <p className="mt-1 text-sm text-gray-600">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

export function Card({ className, children, ...props }) {
  return (
    <section className={cx('rounded-lg border border-gray-200 bg-white', className)} {...props}>
      {children}
    </section>
  );
}

export function CardHeader({ title, description, actions, className }) {
  return (
    <div className={cx('flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-3.5', className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-gray-900">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-gray-500">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children }) {
  return (
    <div className="px-6 py-12 text-center">
      {Icon && <Icon className="mx-auto size-8 text-gray-300" aria-hidden />}
      <p className="mt-3 text-sm font-medium text-gray-900">{title}</p>
      {children && <p className="mt-1 text-sm text-gray-500">{children}</p>}
    </div>
  );
}

// ---- Data display -----------------------------------------------------------

const BADGE_TONES = {
  neutral: 'bg-gray-100 text-gray-700 ring-gray-200',
  green: 'bg-brand-50 text-brand-800 ring-brand-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  blue: 'bg-sky-50 text-sky-800 ring-sky-200',
};

export function Badge({ tone = 'neutral', dot, className, children }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap', BADGE_TONES[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current opacity-70" aria-hidden />}
      {children}
    </span>
  );
}

export function Stat({ label, value, hint, tone }) {
  return (
    <Card className="px-5 py-4">
      <p className="text-[13px] font-medium text-gray-500">{label}</p>
      <p className={cx('mt-1.5 text-2xl font-semibold tracking-tight tnum', tone === 'red' ? 'text-red-700' : 'text-gray-900')}>{value}</p>
      {hint && <p className="mt-1 text-[13px] text-gray-500">{hint}</p>}
    </Card>
  );
}

export function SeatMeter({ enrolled, max, compact }) {
  const over = enrolled > max;
  const pct = Math.min(100, (enrolled / max) * 100);
  const color = over ? 'bg-red-600' : enrolled >= max ? 'bg-amber-500' : enrolled >= max - 2 ? 'bg-amber-400' : 'bg-brand-500';
  return (
    <div className={cx('flex items-center gap-2', compact ? 'w-28' : 'w-36')}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-200">
        <div className={cx('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className={cx('text-xs font-medium tnum', over ? 'text-red-700' : 'text-gray-600')}>
        {enrolled}/{max}
      </span>
    </div>
  );
}

export function Table({ children, className }) {
  return (
    <div className="overflow-x-auto">
      <table className={cx('w-full text-left text-sm', className)}>{children}</table>
    </div>
  );
}

export function Th({ className, children, ...props }) {
  return (
    <th scope="col" className={cx('border-b border-gray-200 bg-gray-50 px-4 py-2.5 text-xs font-medium text-gray-500 whitespace-nowrap', className)} {...props}>
      {children}
    </th>
  );
}

export function Td({ className, children, ...props }) {
  return (
    <td className={cx('border-b border-gray-100 px-4 py-3 align-middle', className)} {...props}>
      {children}
    </td>
  );
}

// ---- Tabs / segmented control ----------------------------------------------

export function Tabs({ value, onChange, items, className }) {
  return (
    <div role="tablist" className={cx('flex gap-6 overflow-x-auto shadow-[inset_0_-1px_0_var(--color-gray-200)]', className)}>
      {items.map((it) => (
        <button
          key={it.value}
          role="tab"
          type="button"
          aria-selected={value === it.value}
          onClick={() => onChange(it.value)}
          className={cx(
            'flex items-center gap-2 border-b-2 pb-2.5 pt-1 text-sm font-medium whitespace-nowrap transition-colors',
            value === it.value ? 'border-brand-700 text-brand-800' : 'border-transparent text-gray-500 hover:text-gray-800',
          )}
        >
          {it.label}
          {it.count != null && (
            <span className={cx('rounded-full px-1.5 text-xs tnum', value === it.value ? 'bg-brand-100 text-brand-800' : 'bg-gray-100 text-gray-600')}>
              {it.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export function Segmented({ value, onChange, items, className }) {
  return (
    <div className={cx('inline-flex rounded-md border border-gray-300 bg-white p-0.5', className)}>
      {items.map((it) => (
        <button
          key={it.value}
          type="button"
          aria-pressed={value === it.value}
          onClick={() => onChange(it.value)}
          className={cx(
            'rounded px-3 py-1 text-[13px] font-medium whitespace-nowrap transition-colors',
            value === it.value ? 'bg-gray-900 text-white' : 'text-gray-600 hover:text-gray-900',
          )}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

// ---- Forms ------------------------------------------------------------------

export const inputClass =
  'block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/15 disabled:bg-gray-50 disabled:text-gray-500';

export function Field({ label, hint, error, required, className, children }) {
  const id = useId();
  const child = typeof children === 'function' ? children(id) : children;
  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-gray-700">
          {label}
          {required && <span className="text-red-600"> *</span>}
        </label>
      )}
      {child}
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

export function Input({ label, hint, error, className, required, ...props }) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className}>
      {(id) => <input id={id} required={required} className={inputClass} {...props} />}
    </Field>
  );
}

export function Select({ label, hint, className, required, children, ...props }) {
  return (
    <Field label={label} hint={hint} required={required} className={className}>
      {(id) => (
        <select id={id} required={required} className={cx(inputClass, 'pr-8')} {...props}>
          {children}
        </select>
      )}
    </Field>
  );
}

export function Textarea({ label, hint, className, required, ...props }) {
  return (
    <Field label={label} hint={hint} required={required} className={className}>
      {(id) => <textarea id={id} required={required} rows={3} className={inputClass} {...props} />}
    </Field>
  );
}

export function Checkbox({ label, description, className, ...props }) {
  return (
    <label className={cx('flex cursor-pointer items-start gap-3', className)}>
      <input type="checkbox" className="mt-0.5 size-4 shrink-0 rounded border-gray-300" {...props} />
      <span className="text-sm">
        <span className="font-medium text-gray-900">{label}</span>
        {description && <span className="mt-0.5 block text-gray-600">{description}</span>}
      </span>
    </label>
  );
}

// ---- Modal / drawer ---------------------------------------------------------

export function Modal({ open, onClose, title, description, children, footer, size = 'md', side }) {
  const panelRef = useRef(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && closeRef.current();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;
  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="no-print absolute inset-0 bg-gray-950/40" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx(
          'relative flex w-full flex-col bg-white shadow-xl outline-none',
          side
            ? cx('ml-auto h-full', widths[size])
            : cx('mx-4 my-auto max-h-[calc(100dvh-2rem)] rounded-lg sm:mx-auto', widths[size]),
        )}
      >
        <div className="no-print flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-gray-500">{description}</p>}
          </div>
          <IconButton label="Tutup" icon={X} onClick={onClose} className="-mr-2 -mt-1" />
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="no-print flex justify-end gap-2 border-t border-gray-200 bg-gray-50 px-5 py-3 rounded-b-lg">{footer}</div>}
      </div>
    </div>
  );
}

// ---- Toasts -----------------------------------------------------------------

const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const notify = useCallback((message, tone = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  const icons = { success: CheckCircle2, error: AlertCircle, info: Info };
  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="no-print pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:items-end sm:right-4 sm:left-auto">
        {toasts.map((t) => {
          const Icon = icons[t.tone];
          return (
            <div key={t.id} role="status" className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg bg-gray-900 px-4 py-3 text-sm text-white shadow-lg">
              <Icon className={cx('mt-0.5 size-4 shrink-0', t.tone === 'error' ? 'text-red-400' : t.tone === 'info' ? 'text-sky-300' : 'text-brand-300')} />
              <span className="flex-1">{t.message}</span>
              <button type="button" onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))} className="text-gray-400 hover:text-white" aria-label="Tutup">
                <X className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

// ---- Misc -------------------------------------------------------------------

export function Avatar({ text, className }) {
  return (
    <span className={cx('inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800', className)}>
      {text}
    </span>
  );
}

export function SearchInput({ value, onChange, placeholder, className, icon: Icon }) {
  return (
    <div className={cx('relative', className)}>
      {Icon && <Icon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" aria-hidden />}
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={cx(inputClass, Icon && 'pl-9')}
      />
    </div>
  );
}

export function DescriptionList({ items, className }) {
  return (
    <dl className={cx('grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2', className)}>
      {items.filter(Boolean).map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs font-medium text-gray-500">{k}</dt>
          <dd className="mt-0.5 text-sm text-gray-900">{v || '—'}</dd>
        </div>
      ))}
    </dl>
  );
}
