import { useEffect, useState } from 'react';
import { ArrowLeft, CalendarDays, CheckCheck, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { attendanceApi } from '../api/client';
import { CENTRE } from '../lib/config';
import { useStore } from '../store';
import { classLabel, preferredContact, timetableDay } from '../lib/domain';
import { dateLong, initials, timeRange, todayISO, waLink } from '../lib/format';
import { downloadCsv } from '../lib/csv';
import { Avatar, Badge, Button, Card, CardHeader, cx, EmptyState, filterClass, inputClass, PageHeader, Textarea, useToast, WhatsAppIcon } from './ui';

const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function AttendanceView() {
  const { classes, subjects, teachers, attendance } = useStore();
  const query = new URLSearchParams(window.location.hash.split('?')[1]);
  const [day, setDay] = useState(query.get('date') ?? todayISO());
  const [classId, setClassId] = useState(query.get('class') ? Number(query.get('class')) : null);

  const weekday = timetableDay(day);
  const dayClasses = classes
    .filter((c) => c.day === weekday)
    .sort((a, b) => a.start.localeCompare(b.start) || a.form.localeCompare(b.form));
  const record = (id) => attendance.find((a) => a.classId === id && a.date === day);
  const teacherName = (code) => {
    const t = teachers.find((x) => x.code === code);
    return t ? `Cikgu ${t.name}` : 'Guru belum ditetapkan';
  };
  const selected = classes.find((c) => c.id === classId);

  if (selected) {
    return <Roster key={`${classId}-${day}`} cls={selected} day={day} teacher={teacherName(selected.teacher)} onBack={() => setClassId(null)} />;
  }

  const taken = dayClasses.filter((c) => record(c.id)).length;

  // This month's attendance rate, from the sessions already recorded
  const monthSessions = attendance.filter((a) => a.date.slice(0, 7) === day.slice(0, 7));
  const monthTotal = monthSessions.reduce((a, s) => a + s.roster.length, 0);
  const monthAbsent = monthSessions.reduce((a, s) => a + s.absent.length, 0);

  return (
    <>
      <PageHeader title="Kedatangan" description="Ambil kedatangan bagi setiap kelas. Ibu bapa pelajar yang tidak hadir boleh dimaklumkan terus." />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center rounded-md border border-gray-300 bg-white">
          <button type="button" onClick={() => setDay(addDays(day, -1))} className="p-2 text-gray-600 hover:bg-gray-50" aria-label="Hari sebelumnya">
            <ChevronLeft className="size-4" />
          </button>
          <span className="min-w-44 px-2 text-center text-sm font-medium text-gray-900">{dateLong(day)}</span>
          <button type="button" onClick={() => setDay(addDays(day, 1))} className="p-2 text-gray-600 hover:bg-gray-50" aria-label="Hari berikutnya">
            <ChevronRight className="size-4" />
          </button>
        </div>
        <input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} aria-label="Pilih tarikh" className={filterClass} />
        {day !== todayISO() && (
          <Button size="sm" variant="ghost" onClick={() => setDay(todayISO())}>
            Hari ini
          </Button>
        )}
        <span className="ml-auto text-sm text-gray-500">
          {dayClasses.length > 0 && <>{taken} daripada {dayClasses.length} kelas telah diambil</>}
          {monthTotal > 0 && <> · Kadar bulan ini {Math.round(((monthTotal - monthAbsent) / monthTotal) * 100)}%</>}
        </span>
      </div>

      {dayClasses.length === 0 ? (
        <Card>
          <EmptyState icon={CalendarDays} title="Tiada kelas pada hari ini" />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {dayClasses.map((c) => {
            const r = record(c.id);
            const roster = r?.roster?.length ?? c.enrolled;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setClassId(c.id)}
                className="rounded-lg border border-gray-200 bg-white p-4 text-left transition-colors hover:border-brand-400 hover:bg-brand-50/30"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[13px] text-gray-500">{timeRange(c.start, c.end)}</p>
                    <p className="mt-0.5 font-medium text-gray-900">{classLabel(c, subjects)}</p>
                    <p className="text-[13px] text-gray-500">
                      {teacherName(c.teacher)}{c.room && ` · ${c.room}`}
                    </p>
                  </div>
                  {r ? <Badge tone="green">Diambil</Badge> : day <= todayISO() ? <Badge tone="amber">Belum</Badge> : <Badge>Akan datang</Badge>}
                </div>
                {r && (
                  <p className="mt-3 text-sm text-gray-700">
                    <span className="font-medium tnum">{roster - r.absent.length}</span>/{roster} hadir
                    {r.absent.length > 0 && <span className="text-red-700"> · {r.absent.length} tidak hadir</span>}
                    {r.late.length > 0 && <span className="text-amber-700"> · {r.late.length} lewat</span>}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

const STATES = [
  { id: 'P', label: 'Hadir', on: 'bg-brand-700 text-white border-brand-700' },
  { id: 'L', label: 'Lewat', on: 'bg-amber-500 text-white border-amber-500' },
  { id: 'A', label: 'Tidak hadir', on: 'bg-red-600 text-white border-red-600' },
];
const STATE_LABEL = { P: 'Hadir', L: 'Lewat', A: 'Tidak hadir' };

function Roster({ cls, day, teacher, onBack }) {
  const { students, subjects, saveAttendance } = useStore();
  const notify = useToast();
  // The server decides who was in the class on that date (including students on hold)
  const [roster, setRoster] = useState(null);
  const [marks, setMarks] = useState({});
  const [notes, setNotes] = useState({});
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState(false);
  const [existing, setExisting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [closed, setClosed] = useState('');
  const future = day > todayISO();
  const label = classLabel(cls, subjects);

  useEffect(() => {
    let cancelled = false;
    attendanceApi.roster(cls.id, day)
      .then((r) => {
        if (cancelled) return;
        setRoster(r.students.map((s) => ({ id: s.student_id, name: s.name, status: s.status, phone: s.parent_phone })).sort((a, b) => a.name.localeCompare(b.name)));
        // A class not yet recorded starts with everyone present, so only absentees are ticked
        setMarks(Object.fromEntries(r.students.map((s) => [s.student_id, s.present === false ? 'A' : s.late ? 'L' : 'P'])));
        setNotes(Object.fromEntries(r.students.map((s) => [s.student_id, s.note || ''])));
        setNote(r.note || '');
        setSaved(Boolean(r.saved));
        setExisting(Boolean(r.saved));
        setClosed(r.closed || '');
      })
      .catch(() => {
        if (!cancelled) { setRoster([]); notify('Gagal memuat senarai kelas.', 'error'); }
      });
    return () => { cancelled = true; };
  }, [cls.id, day, notify]);

  if (!roster) return <p className="py-10 text-center text-sm text-gray-500">Memuatkan…</p>;

  const absent = roster.filter((s) => marks[s.id] === 'A');
  const late = roster.filter((s) => marks[s.id] === 'L');

  const save = async () => {
    setBusy(true);
    try {
      await saveAttendance({
        classId: cls.id, date: day, note, notes,
        roster: roster.map((s) => s.id), absent: absent.map((s) => s.id), late: late.map((s) => s.id),
      });
      setSaved(true);
      setExisting(true);
      notify(`Kedatangan ${label} disimpan: ${roster.length - absent.length}/${roster.length} hadir.`);
    } catch {
      // the store has already shown the reason
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () => downloadCsv(`kedatangan-${cls.code.replace(/\s+/g, '-')}-${day}.csv`, ['ID', 'Nama', 'Kedatangan', 'Catatan', 'Telefon penjaga'],
    roster.map((s) => [s.id, s.name, STATE_LABEL[marks[s.id]], notes[s.id], s.phone]));

  return (
    <>
      <button type="button" onClick={onBack} className="mb-4 flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900">
        <ArrowLeft className="size-4" /> Senarai kelas
      </button>
      <PageHeader
        title={label}
        description={`${dateLong(day)} · ${timeRange(cls.start, cls.end)} · ${teacher}${cls.room ? ` · ${cls.room}` : ''}`}
        actions={roster.length > 0 && <Button icon={Download} onClick={exportCsv}>Excel</Button>}
      />

      {future ? (
        <Card>
          <EmptyState title="Kedatangan hanya boleh diambil pada hari kelas" />
        </Card>
      ) : closed ? (
        <Card>
          <EmptyState title={`Pusat tutup: ${closed}`}>Kedatangan tidak direkod pada hari cuti.</EmptyState>
        </Card>
      ) : roster.length === 0 ? (
        <Card>
          <EmptyState title="Tiada pelajar dalam kelas ini pada tarikh tersebut" />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader
              title={`${roster.length} pelajar`}
              description={`${roster.length - absent.length} hadir · ${late.length} lewat · ${absent.length} tidak hadir`}
              actions={
                <Button size="sm" icon={CheckCheck} onClick={() => { setMarks(Object.fromEntries(roster.map((s) => [s.id, 'P']))); setSaved(false); }}>
                  Semua hadir
                </Button>
              }
            />
            <ul className="divide-y divide-gray-100">
              {roster.map((s, i) => (
                <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 sm:px-5">
                  <span className="w-5 text-right text-xs text-gray-400 tnum">{i + 1}</span>
                  <span className="hidden sm:block">
                    <Avatar text={initials(s.name)} />
                  </span>
                  <p className="min-w-0 flex-1 text-sm font-medium text-gray-900">
                    {s.name}
                    {s.status === 'ON_HOLD' && <span className="ml-2 text-xs font-normal text-amber-700">Ditangguh</span>}
                  </p>
                  <div className="grid w-full grid-cols-3 gap-1 sm:flex sm:w-auto" role="radiogroup" aria-label={`Kedatangan ${s.name}`}>
                    {STATES.map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        role="radio"
                        aria-checked={marks[s.id] === st.id}
                        onClick={() => {
                          setMarks((m) => ({ ...m, [s.id]: st.id }));
                          setSaved(false);
                        }}
                        className={cx(
                          'rounded-md border px-2.5 py-1.5 text-[13px] font-medium transition-colors',
                          marks[s.id] === st.id ? st.on : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50',
                        )}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>
                  {marks[s.id] !== 'P' && (
                    <input
                      value={notes[s.id] || ''}
                      onChange={(e) => { setNotes((n) => ({ ...n, [s.id]: e.target.value })); setSaved(false); }}
                      placeholder="Sebab / catatan"
                      aria-label={`Catatan ${s.name}`}
                      className={cx(inputClass, 'w-full py-1.5 sm:ml-8')}
                    />
                  )}
                </li>
              ))}
            </ul>
            <div className="border-t border-gray-100 px-5 py-4">
              <Textarea label="Catatan kelas" rows={2} value={note} onChange={(e) => { setNote(e.target.value); setSaved(false); }} />
            </div>
            <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-gray-200 bg-white px-5 py-3">
              <span className="text-sm text-gray-600">{saved ? 'Disimpan' : 'Belum disimpan'}</span>
              <Button variant="primary" onClick={save} disabled={busy}>
                {busy ? 'Menyimpan…' : existing ? 'Kemas kini kedatangan' : 'Simpan kedatangan'}
              </Button>
            </div>
          </Card>

          <Card className="self-start">
            <CardHeader title="Maklumkan ibu bapa" description="Hantar makluman kepada penjaga pelajar yang tidak hadir." />
            {!saved ? (
              <p className="px-5 py-6 text-sm text-gray-500">Simpan kedatangan dahulu.</p>
            ) : absent.length === 0 ? (
              <p className="px-5 py-6 text-sm text-gray-500">Semua pelajar hadir.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {absent.map((s) => {
                  const p = preferredContact(students.find((x) => x.id === s.id));
                  const phone = p?.phone || s.phone;
                  const msg = `Assalamualaikum ${p?.name || ''}. Dimaklumkan ${s.name} tidak hadir ke kelas ${label} pada ${dateLong(day)}, ${timeRange(cls.start, cls.end)}. Sila hubungi kami jika ada sebarang pertanyaan.\n— ${CENTRE.name}`;
                  return (
                    <li key={s.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-gray-900">{s.name}</p>
                        <p className="text-[13px] text-gray-500">{p?.name || phone}</p>
                      </div>
                      <Button as="a" size="sm" href={waLink(phone, msg)} target="_blank" rel="noreferrer">
                        <WhatsAppIcon className="size-3.5" /> Maklum
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
