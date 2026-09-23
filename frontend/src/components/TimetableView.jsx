import { useMemo, useState } from 'react';
import { CalendarDays, Printer } from 'lucide-react';
import { DAYS, FORMS } from '../data/demo';
import { useStore } from '../store';
import { classLabel, preferredContact } from '../lib/domain';
import { can } from '../lib/permissions';
import { date, DAY_LABEL, formLabel, timeRange } from '../lib/format';
import { Badge, Button, Card, cx, EmptyState, Modal, PageHeader, SeatMeter, Segmented, Table, Td, Th, useToast } from './ui';

const selectClass = 'rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:border-brand-600 focus:outline-none';

export default function TimetableView({ role }) {
  const { classes, subjects, teachers } = useStore();
  const [openId, setOpenId] = useState(null);
  const [view, setView] = useState('week');
  const [form, setForm] = useState('ALL');
  const [teacher, setTeacher] = useState('ALL');
  const [fullOnly, setFullOnly] = useState(false);

  const teacherName = (code) => teachers.find((t) => t.code === code)?.name ?? code;

  const filtered = useMemo(
    () =>
      classes
        .filter((c) => (form === 'ALL' || c.form === form) && (teacher === 'ALL' || c.teacher === teacher) && (!fullOnly || c.enrolled >= c.max))
        .sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day) || a.start.localeCompare(b.start) || a.form.localeCompare(b.form)),
    [classes, form, teacher, fullOnly],
  );

  const teachingTeachers = teachers.filter((t) => classes.some((c) => c.teacher === t.code));
  const over = classes.filter((c) => c.enrolled > c.max).length;

  return (
    <>
      <PageHeader
        title="Jadual kelas 2026"
        description="Setiap sesi 1 jam 30 minit · Jumaat, Sabtu dan malam Isnin hingga Khamis"
        actions={<Segmented value={view} onChange={setView} items={[{ value: 'week', label: 'Mingguan' }, { value: 'list', label: 'Senarai' }]} />}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select value={form} onChange={(e) => setForm(e.target.value)} aria-label="Tapis tingkatan" className={selectClass}>
          <option value="ALL">Semua tingkatan</option>
          {FORMS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
        <select value={teacher} onChange={(e) => setTeacher(e.target.value)} aria-label="Tapis guru" className={selectClass}>
          <option value="ALL">Semua guru</option>
          {teachingTeachers.map((t) => (
            <option key={t.code} value={t.code}>
              Cikgu {t.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={fullOnly} onChange={(e) => setFullOnly(e.target.checked)} className="size-4" />
          Kelas penuh sahaja
        </label>
        <span className="ml-auto text-sm text-gray-500">
          {filtered.length} kelas{over > 0 && <> · <span className="font-medium text-red-700">{over} melebihi had</span></>}
        </span>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState icon={CalendarDays} title="Tiada kelas sepadan dengan tapisan" />
        </Card>
      ) : view === 'week' ? (
        <div className="space-y-6">
          {DAYS.map((day) => {
            const dayClasses = filtered.filter((c) => c.day === day);
            if (!dayClasses.length) return null;
            const slots = [...new Set(dayClasses.map((c) => `${c.start}|${c.end}`))];
            return (
              <Card key={day}>
                <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
                  <h2 className="text-[15px] font-semibold text-gray-900">{DAY_LABEL[day]}</h2>
                  <span className="text-[13px] text-gray-500">{dayClasses.length} kelas</span>
                </div>
                <div className="divide-y divide-gray-100">
                  {slots.map((slot) => {
                    const [start, end] = slot.split('|');
                    return (
                      <div key={slot} className="flex flex-col gap-3 px-5 py-4 md:flex-row">
                        <p className="w-32 shrink-0 text-sm font-medium text-gray-700">{timeRange(start, end)}</p>
                        <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                          {dayClasses
                            .filter((c) => c.start === start)
                            .map((c) => (
                              <button
                                type="button"
                                key={c.id}
                                onClick={() => setOpenId(c.id)}
                                className={cx(
                                  'rounded-md border px-3 py-2.5 text-left transition-colors hover:border-brand-400',
                                  c.enrolled > c.max ? 'border-red-200 bg-red-50/50' : 'border-gray-200',
                                )}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <p className="text-sm font-medium text-gray-900">{classLabel(c, subjects)}</p>
                                  {c.enrolled > c.max && <Badge tone="red">Lebih {c.enrolled - c.max}</Badge>}
                                  {c.enrolled === c.max && <Badge tone="amber">Penuh</Badge>}
                                </div>
                                <p className="mt-0.5 text-[13px] text-gray-500">
                                  Cikgu {teacherName(c.teacher)} · {c.room}
                                </p>
                                <div className="mt-2 flex items-center justify-between gap-2">
                                  <SeatMeter enrolled={c.enrolled} max={c.max} compact />
                                  {c.waiting > 0 && <span className="text-xs font-medium text-amber-700">{c.waiting} menunggu</span>}
                                </div>
                              </button>
                            ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>Hari</Th>
                <Th>Masa</Th>
                <Th>Kelas</Th>
                <Th>Guru</Th>
                <Th className="hidden md:table-cell">Bilik</Th>
                <Th>Kerusi</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="cursor-pointer hover:bg-gray-50" onClick={() => setOpenId(c.id)}>
                  <Td className="whitespace-nowrap text-gray-900">{DAY_LABEL[c.day]}</Td>
                  <Td className="whitespace-nowrap text-gray-700">{timeRange(c.start, c.end)}</Td>
                  <Td className="font-medium text-gray-900">{classLabel(c, subjects)}</Td>
                  <Td className="whitespace-nowrap text-gray-700">Cikgu {teacherName(c.teacher)}</Td>
                  <Td className="hidden text-gray-700 md:table-cell">{c.room}</Td>
                  <Td>
                    <SeatMeter enrolled={c.enrolled} max={c.max} compact />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {openId && <ClassModal cls={classes.find((c) => c.id === openId)} role={role} onClose={() => setOpenId(null)} />}
    </>
  );
}

function ClassModal({ cls, role, onClose }) {
  const { students, subjects, teachers, waitlist, enrollFromWaitlist, removeFromWaitlist, addToWaitlist } = useStore();
  const notify = useToast();
  const [adding, setAdding] = useState('');
  const roster = students.filter((s) => s.status === 'ACTIVE' && s.classes.includes(cls.id)).sort((a, b) => a.name.localeCompare(b.name));
  const waits = waitlist.filter((w) => w.classId === cls.id).map((w) => ({ ...w, student: students.find((s) => s.id === w.studentId) }));
  const label = classLabel(cls, subjects);
  const teacher = teachers.find((t) => t.code === cls.teacher)?.name;
  const seatFree = cls.enrolled < cls.max;
  const manage = can(role, 'waitlist.manage');
  const candidates = students.filter(
    (s) => s.status === 'ACTIVE' && s.form === cls.form && !s.classes.includes(cls.id) && !waits.some((w) => w.studentId === s.id),
  );

  return (
    <Modal
      open
      side
      size="lg"
      onClose={onClose}
      title={label}
      description={`${DAY_LABEL[cls.day]}, ${timeRange(cls.start, cls.end)} · Cikgu ${teacher} · ${cls.room}`}
      footer={
        <Button icon={Printer} onClick={() => window.print()}>
          Cetak senarai kelas
        </Button>
      }
    >
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <SeatMeter enrolled={cls.enrolled} max={cls.max} />
          {cls.enrolled > cls.max && <Badge tone="red">Melebihi had {cls.enrolled - cls.max}</Badge>}
        </div>

        {(waits.length > 0 || manage) && (
          <section>
            <h3 className="mb-2 text-sm font-semibold text-gray-900">Senarai menunggu ({waits.length})</h3>
            {waits.length > 0 && (
              <ul className="mb-3 divide-y divide-gray-100 rounded-md border border-gray-200">
                {waits.map((w, i) => (
                  <li key={w.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm">
                    <span className="w-5 text-xs text-gray-400 tnum">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <a href={`#/students/${w.studentId}`} className="font-medium text-gray-900 hover:underline">
                        {w.student?.name}
                      </a>
                      <p className="text-[13px] text-gray-500">Sejak {date(w.added)}</p>
                    </div>
                    {manage && (
                      <>
                        <Button
                          size="sm"
                          variant="primary"
                          disabled={!seatFree}
                          title={seatFree ? undefined : 'Kelas penuh'}
                          onClick={() => {
                            enrollFromWaitlist(w.id);
                            notify(`${w.student?.name} dimasukkan ke ${label}.`);
                          }}
                        >
                          Masukkan
                        </Button>
                        <Button size="sm" onClick={() => removeFromWaitlist(w.id)}>
                          Keluarkan
                        </Button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {manage && (
              <div className="flex gap-2">
                <select
                  value={adding}
                  onChange={(e) => setAdding(e.target.value)}
                  aria-label="Pilih pelajar untuk senarai menunggu"
                  className="min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-brand-600 focus:outline-none"
                >
                  <option value="">Tambah pelajar {formLabel(cls.form)} ke senarai menunggu…</option>
                  {candidates.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  disabled={!adding}
                  onClick={() => {
                    addToWaitlist(cls.id, adding);
                    setAdding('');
                    notify('Ditambah ke senarai menunggu.', 'info');
                  }}
                >
                  Tambah
                </Button>
              </div>
            )}
          </section>
        )}

        <section className="print-area bg-white">
          <div className="mb-2 hidden print:block">
            <p className="text-base font-semibold">{label}</p>
            <p className="text-sm">
              {DAY_LABEL[cls.day]}, {timeRange(cls.start, cls.end)} · Cikgu {teacher} · {cls.room}
            </p>
          </div>
          <h3 className="mb-2 text-sm font-semibold text-gray-900">Pelajar ({roster.length})</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                <th className="w-8 py-2 font-medium">#</th>
                <th className="py-2 font-medium">Nama</th>
                <th className="py-2 font-medium">Sekolah</th>
                <th className="py-2 font-medium">Penjaga</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((s, i) => {
                const p = preferredContact(s);
                return (
                  <tr key={s.id} className="border-b border-gray-100">
                    <td className="py-2 text-gray-400 tnum">{i + 1}</td>
                    <td className="py-2">
                      <a href={`#/students/${s.id}`} className="text-gray-900 hover:underline">
                        {s.name}
                      </a>
                    </td>
                    <td className="py-2 text-gray-600">{s.school}</td>
                    <td className="py-2 text-gray-600">{p.phone}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      </div>
    </Modal>
  );
}
