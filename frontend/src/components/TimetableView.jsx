import { useMemo, useState } from 'react';
import { CalendarDays, Download, Pencil, Plus, Printer, Trash2 } from 'lucide-react';
import { DAYS } from '../lib/config';
import { useStore } from '../store';
import { classLabel, preferredContact } from '../lib/domain';
import { can } from '../lib/permissions';
import { navigate } from '../lib/nav';
import { date, DAY_LABEL, FORMS, formLabel, STUDENT_STATUS, timeRange } from '../lib/format';
import { downloadCsv } from '../lib/csv';
import TimetableChangesPanel from './TimetableChangesPanel';
import { Badge, Button, Card, cx, EmptyState, Input, Modal, PageHeader, SeatMeter, Segmented, Select, Table, Td, Th, useToast } from './ui';

const selectClass = 'rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:border-brand-600 focus:outline-none';

export default function TimetableView({ role }) {
  const { classes, subjects, teachers } = useStore();
  const [openId, setOpenId] = useState(null);
  const [view, setView] = useState('week');
  const [form, setForm] = useState('ALL');
  const [teacher, setTeacher] = useState('ALL');
  const [fullOnly, setFullOnly] = useState(false);
  const [editing, setEditing] = useState(null); // class being edited, or {} for a new one
  const [changesKey, setChangesKey] = useState(0);
  const canEdit = can(role, 'timetable.edit');

  const teacherName = (code) => {
    const t = teachers.find((x) => x.code === code);
    return t ? `Cikgu ${t.name}` : 'Guru belum ditetapkan';
  };

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
        title="Jadual kelas"
        description="Jadual induk dan jadual mengikut tingkatan. Kerusi dikira daripada pendaftaran sebenar."
        actions={
          <>
            <Segmented value={view} onChange={setView} items={[{ value: 'week', label: 'Mingguan' }, { value: 'list', label: 'Senarai' }]} />
            {canEdit && (
              <Button variant="primary" icon={Plus} onClick={() => setEditing({})}>
                Tambah kelas
              </Button>
            )}
          </>
        }
      />

      {canEdit && (
        <div className="mb-4">
          <TimetableChangesPanel role={role} reloadKey={changesKey} />
        </div>
      )}

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
                                  {teacherName(c.teacher)}{c.room && ` · ${c.room}`}
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
                  <Td className="whitespace-nowrap text-gray-700">{teacherName(c.teacher)}</Td>
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

      {openId && classes.find((c) => c.id === openId) && (
        <ClassModal
          cls={classes.find((c) => c.id === openId)}
          role={role}
          onClose={() => setOpenId(null)}
          onEdit={(c) => { setOpenId(null); setEditing(c); }}
          onChanged={() => setChangesKey((k) => k + 1)}
        />
      )}
      {editing && <ClassFormModal cls={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setChangesKey((k) => k + 1); }} />}
    </>
  );
}

// Add or edit a class. A Supervisor's change is sent to Management for approval.
function ClassFormModal({ cls, onClose, onSaved }) {
  const { subjects, teachers, timeSlots, classrooms, settings, saveClass } = useStore();
  const isNew = !cls.id;
  const slots = timeSlots.filter((s) => s.is_active !== false || s.id === cls.slotPk).sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day) || a.start_time.localeCompare(b.start_time));
  const [f, setF] = useState({
    slot: cls.slotPk ?? slots[0]?.id ?? '',
    subject: cls.subjectPk ?? '',
    form_level: cls.form ?? FORMS[0]?.id ?? '',
    section: cls.section ?? 'A',
    teacher: cls.teacherPk ?? '',
    classroom: cls.roomPk ?? '',
    max_seats: cls.max ?? settings.classCapacity,
  });
  const [busy, setBusy] = useState(false);
  const set = (patch) => setF((prev) => ({ ...prev, ...patch }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await saveClass(cls.id ?? null, {
        slot: Number(f.slot), subject: Number(f.subject), form_level: f.form_level, section: f.section,
        teacher: f.teacher ? Number(f.teacher) : null, classroom: f.classroom ? Number(f.classroom) : null, max_seats: Number(f.max_seats),
      });
      onSaved();
    } catch {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? 'Tambah kelas' : `Ubah kelas ${cls.code}`}
      description="Perubahan oleh Supervisor dihantar kepada Pengurusan untuk kelulusan sebelum berkuat kuasa."
      footer={
        <>
          <Button onClick={onClose}>Batal</Button>
          <Button type="submit" form="class-form" variant="primary" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</Button>
        </>
      }
    >
      <form id="class-form" onSubmit={submit} className="grid grid-cols-2 gap-4">
        <Select label="Slot masa" required className="col-span-2" value={f.slot} onChange={(e) => set({ slot: e.target.value })}>
          {slots.map((x) => (
            <option key={x.id} value={x.id}>{DAY_LABEL[x.day]} · {timeRange(x.start_time, x.end_time)}</option>
          ))}
        </Select>
        <Select label="Subjek" required value={f.subject} onChange={(e) => set({ subject: e.target.value })}>
          <option value="">Pilih subjek</option>
          {subjects.filter((x) => x.active).map((x) => (
            <option key={x.pk} value={x.pk}>{x.name} ({x.code})</option>
          ))}
        </Select>
        <Select label="Tingkatan / darjah" required value={f.form_level} onChange={(e) => set({ form_level: e.target.value })}>
          {FORMS.map((x) => (
            <option key={x.id} value={x.id}>{x.label}</option>
          ))}
        </Select>
        <Select label="Kumpulan" value={f.section} onChange={(e) => set({ section: e.target.value })}>
          {['A', 'B', 'C', 'D'].map((x) => <option key={x}>{x}</option>)}
        </Select>
        <Input label="Had kerusi" type="number" required min="1" max="100" value={f.max_seats} onChange={(e) => set({ max_seats: e.target.value })} />
        <Select label="Guru" value={f.teacher} onChange={(e) => set({ teacher: e.target.value })}>
          <option value="">Belum ditetapkan</option>
          {teachers.filter((t) => t.active).sort((a, b) => a.name.localeCompare(b.name)).map((t) => (
            <option key={t.pk} value={t.pk}>Cikgu {t.name}{t.type === 'REPLACEMENT' ? ' (sambilan)' : ''}</option>
          ))}
        </Select>
        <Select label="Bilik" value={f.classroom} onChange={(e) => set({ classroom: e.target.value })}>
          <option value="">Belum ditetapkan</option>
          {classrooms.filter((r) => r.is_active !== false || r.id === cls.roomPk).map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </Select>
      </form>
    </Modal>
  );
}

function ClassModal({ cls, role, onClose, onEdit, onChanged }) {
  const { students, subjects, teachers, waitlist, enrollFromWaitlist, removeFromWaitlist, addToWaitlist, deleteClass } = useStore();
  const notify = useToast();
  const [adding, setAdding] = useState('');
  // Seats are held from registration, so students awaiting approval are listed too
  const roster = students.filter((s) => ['ACTIVE', 'ON_HOLD', 'PENDING'].includes(s.status) && s.classes.includes(cls.id)).sort((a, b) => a.name.localeCompare(b.name));
  const waits = waitlist.filter((w) => w.classId === cls.id).map((w) => ({ ...w, student: students.find((s) => s.id === w.studentId) }));
  const label = classLabel(cls, subjects);
  const t = teachers.find((x) => x.code === cls.teacher);
  const teacher = t ? `Cikgu ${t.name}` : 'Guru belum ditetapkan';
  const seatFree = cls.enrolled < cls.max;
  const manage = can(role, 'waitlist.manage');
  const canEdit = can(role, 'timetable.edit');
  const candidates = students.filter(
    (s) => ['ACTIVE', 'PENDING'].includes(s.status) && s.form === cls.form && !s.classes.includes(cls.id) && !waits.some((w) => w.studentId === s.id),
  );
  const exportList = () => downloadCsv(`senarai-${cls.code.replace(/\s+/g, '-')}.csv`, ['#', 'ID', 'Nama', 'Sekolah', 'Telefon pelajar', 'Penjaga', 'Telefon penjaga', 'Status'],
    roster.map((s, i) => { const p = preferredContact(s); return [i + 1, s.id, s.name, s.school, s.phone, p?.name, p?.phone, STUDENT_STATUS[s.status]?.label]; }));

  return (
    <Modal
      open
      side
      size="lg"
      onClose={onClose}
      title={label}
      description={`${DAY_LABEL[cls.day]}, ${timeRange(cls.start, cls.end)} · ${teacher}${cls.room ? ` · ${cls.room}` : ''}`}
      footer={
        <>
          {canEdit && (
            <>
              <Button
                variant="danger"
                icon={Trash2}
                onClick={() => {
                  if (!window.confirm(`Padam kelas ${cls.code} daripada jadual induk?`)) return;
                  deleteClass(cls.id, cls.code).then(() => { onChanged?.(); onClose(); }).catch(() => {});
                }}
              >
                Padam
              </Button>
              <Button icon={Pencil} onClick={() => onEdit(cls)}>Ubah</Button>
            </>
          )}
          {can(role, 'reschedules.create') && <Button onClick={() => navigate(`reschedules?class=${cls.id}`)}>Batal / ganti kelas</Button>}
          <Button icon={Download} onClick={exportList}>Excel</Button>
          <Button icon={Printer} onClick={() => window.print()}>
            Cetak
          </Button>
        </>
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
                          title={seatFree ? undefined : 'Kelas penuh: pelajar dimasukkan melebihi had'}
                          onClick={() => {
                            if (!seatFree && !window.confirm(`${label} sudah penuh (${cls.enrolled}/${cls.max}). Masukkan juga melebihi had?`)) return;
                            enrollFromWaitlist(w.id).then(() => notify(`${w.student?.name} dimasukkan ke ${label}.`)).catch(() => {});
                          }}
                        >
                          Masukkan
                        </Button>
                        <Button size="sm" onClick={() => removeFromWaitlist(w.id).catch(() => {})}>
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
                  <option value="">Tambah pelajar {formLabel(cls.form)} ke kelas ini…</option>
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
                    addToWaitlist(cls.id, adding)
                      .then((res) => notify(res?.enrolment === 'WAITLISTED' ? 'Kelas penuh: ditambah ke senarai menunggu.' : 'Pelajar dimasukkan ke kelas.', 'info'))
                      .catch(() => {});
                    setAdding('');
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
              {DAY_LABEL[cls.day]}, {timeRange(cls.start, cls.end)} · {teacher}{cls.room && ` · ${cls.room}`}
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
                      {s.status !== 'ACTIVE' && <span className="ml-2 text-xs text-amber-700">{STUDENT_STATUS[s.status]?.label}</span>}
                    </td>
                    <td className="py-2 text-gray-600">{s.school}</td>
                    <td className="py-2 text-gray-600">{p?.phone}</td>
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
