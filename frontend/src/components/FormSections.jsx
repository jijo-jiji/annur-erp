import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { Button, cx } from './ui';

// A long form in one scroll, split into sections, with a header that stays at the top of the screen. The header names
// every section, underlines the one in view, ticks a section once its required fields are filled in, and jumps to a
// section when tapped. `headerTop` places the header under a bar that already sticks to the top (the app's phone bar).
// With `showSubmit` false the form's own button is left out, for a page that submits it from elsewhere (form={id}).
export default function SectionedForm({ id, sections, onSubmit, submitLabel, busyLabel = 'Menghantar…', busy, error, className, headerTop = 'top-0', showSubmit = true }) {
  const header = useRef(null);
  const panels = useRef([]);
  const [active, setActive] = useState(0);
  const [complete, setComplete] = useState([]);
  const [offset, setOffset] = useState(0); // where a section's top lands under the header

  // The section in view: the last one whose top has reached the header (the last one at the very bottom of the page)
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      if (!header.current) return;
      // the header's bottom edge once it sticks, wherever it is now
      const stuck = (parseFloat(getComputedStyle(header.current).top) || 0) + header.current.offsetHeight;
      setOffset(stuck + 12);
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      const passed = panels.current.filter(Boolean).map((el) => el.getBoundingClientRect().top - stuck - 24 <= 0);
      setActive(atBottom ? sections.length - 1 : Math.max(0, passed.lastIndexOf(true)));
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(measure); };
    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(frame);
    };
  }, [sections.length]);

  // On a narrow screen the header scrolls sideways to keep the current section's name in view
  useEffect(() => {
    const list = header.current?.querySelector('ol');
    const item = list?.children[active];
    if (list && item && (item.offsetLeft < list.scrollLeft || item.offsetLeft + item.offsetWidth > list.scrollLeft + list.clientWidth)) {
      list.scrollTo({ left: item.offsetLeft - 16, behavior: 'smooth' });
    }
  }, [active]);

  // A tick for a section whose required fields are all filled in (sections with none get no tick)
  useEffect(() => {
    const next = panels.current.map((el) => {
      const required = [...(el?.querySelectorAll('input, select, textarea') ?? [])].filter((f) => f.willValidate && f.required);
      return required.length > 0 && required.every((f) => f.checkValidity());
    });
    if (next.some((v, i) => v !== complete[i])) setComplete(next);
  }, [sections, complete]); // the sections are rebuilt on every change to the form, so this runs after each one

  // Worked out here rather than with scrollIntoView, whose smooth scroll stops short beside a sticky header in Chrome
  const jump = (i) => {
    const el = panels.current[i];
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - offset, behavior: 'smooth' });
  };
  const submit = (e) => {
    e.preventDefault();
    onSubmit();
  };

  return (
    <form id={id} onSubmit={submit} className={className} style={{ '--section-offset': `${offset}px` }}>
      <nav ref={header} aria-label="Bahagian borang" className={cx('sticky z-20 -mx-4 bg-gray-50/95 px-4 pt-2 backdrop-blur sm:mx-0 sm:px-0', headerTop)}>
        <ol className="relative flex gap-5 overflow-x-auto shadow-[inset_0_-1px_0_var(--color-gray-200)]">
          {sections.map((section, i) => {
            const current = i === active;
            return (
              <li key={section.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => jump(i)}
                  aria-current={current ? 'location' : undefined}
                  className={cx(
                    'flex items-center gap-2 border-b-2 pb-2.5 pt-1 text-sm font-medium whitespace-nowrap transition-colors',
                    current ? 'border-brand-700 text-brand-800' : 'border-transparent text-gray-500 hover:text-gray-900',
                  )}
                >
                  <span
                    aria-hidden
                    className={cx(
                      'flex size-5 items-center justify-center rounded-full text-[11px] font-semibold tnum',
                      complete[i] ? 'bg-brand-600 text-white' : current ? 'bg-brand-700 text-white' : 'bg-gray-100 text-gray-600',
                    )}
                  >
                    {complete[i] ? <Check className="size-3" strokeWidth={3} /> : i + 1}
                  </span>
                  {section.title}
                  {complete[i] && <span className="sr-only">(lengkap)</span>}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="mt-5 space-y-6 [&_input]:scroll-mt-[var(--section-offset)] [&_select]:scroll-mt-[var(--section-offset)] [&_textarea]:scroll-mt-[var(--section-offset)]">
        {sections.map((section, i) => (
          <section key={section.id} ref={(el) => { panels.current[i] = el; }} aria-label={section.title} className="scroll-mt-[var(--section-offset)]">
            {section.content}
          </section>
        ))}
        {showSubmit && (
          <>
            {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>
              {busy ? busyLabel : submitLabel}
            </Button>
          </>
        )}
      </div>
    </form>
  );
}
