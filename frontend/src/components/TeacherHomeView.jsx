import { ClipboardCheck } from 'lucide-react';
import { CURRENT_MONTH, DAYS, DEMO_TEACHER } from '../data/demo';
import { useStore } from '../store';
import { classLabel, timetableDay } from '../lib/domain';
import { DAY_LABEL, dateLong, monthLabel, rm, timeRange, todayISO } from '../lib/format';
import { Badge, Button, Card, CardHeader, PageHeader, Stat, Table, Td, Th } from './ui';

export default function TeacherHomeView() {
  const { teachers, classes, subjects, attendance, exams, results } = useStore();
  const me = teachers.find((t) => t.code === DEMO_TEACHER);
  const mine = classes
    .filter((c) => c.teacher === me.code)
    .sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day) || a.start.localeCompare(b.start));
  const today = todayISO();
  const todays = mine.filter((c) => c.day === timetableDay(today));
  const taken = (c) => attendance.find((a) => a.classId === c.id && a.date === today);

  const sessionsThisMonth = attendance.filter((a) => a.date.startsWith(CURRENT_MONTH) && mine.some((c) => c.id === a.classId));
  const perClass = mine.map((c) => ({ c, n: sessionsThisMonth.filter((a) => a.classId === c.id).length }));
  const allowance = sessionsThisMonth.length * me.rate;

  const nextExam = exams.find((e) => mine.some((c) => !results.some((r) => r.examId === e.id && r.classId === c.id)));
  const pendingMarks = nextExam ? mine.filter((c) => !results.some((r) => r.examId === nextExam.id && r.classId === c.id)) : [];

  return (
    <>
      <PageHeader title={`Selamat datang, Cikgu ${me.name}`} description={`${dateLong(today)} · ${me.subjects}`} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Kelas minggu ini" value={mine.length} hint={`${mine.reduce((a, c) => a + c.enrolled, 0)} pelajar`} />
        <Stat label="Kelas hari ini" value={todays.length} hint={todays.length ? `${todays.filter(taken).length} kedatangan diambil` : 'Tiada kelas'} />
        <Stat label={`Elaun ${monthLabel(CURRENT_MONTH)} setakat ini`} value={rm(allowance)} hint={`${sessionsThisMonth.length} sesi × ${rm(me.rate)}`} />
        <Stat label="Markah belum dimasukkan" value={pendingMarks.length} hint={nextExam ? nextExam.name : 'Semua lengkap'} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title="Kelas hari ini" />
            {todays.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-gray-500">Tiada kelas hari ini.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {todays.map((c) => {
                  const r = taken(c);
                  return (
                    <li key={c.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                      <span className="w-28 text-[13px] text-gray-500">{timeRange(c.start, c.end)}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900">{classLabel(c, subjects)}</p>
                        <p className="text-[13px] text-gray-500">
                          {c.room} · {c.enrolled} pelajar
                        </p>
                      </div>
                      {r ? (
                        <Badge tone="green">
                          {(r.roster?.length ?? c.enrolled) - r.absent.length}/{r.roster?.length ?? c.enrolled} hadir
                        </Badge>
                      ) : (
                        <Button as="a" size="sm" variant="primary" icon={ClipboardCheck} href={`#/attendance?class=${c.id}`}>
                          Ambil kedatangan
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Jadual mingguan" />
            <Table>
              <thead>
                <tr>
                  <Th>Hari</Th>
                  <Th>Masa</Th>
                  <Th>Kelas</Th>
                  <Th className="hidden sm:table-cell">Bilik</Th>
                  <Th className="text-right">Pelajar</Th>
                </tr>
              </thead>
              <tbody>
                {mine.map((c) => (
                  <tr key={c.id}>
                    <Td className="text-gray-900">{DAY_LABEL[c.day]}</Td>
                    <Td className="whitespace-nowrap text-gray-700">{timeRange(c.start, c.end)}</Td>
                    <Td className="font-medium text-gray-900">{classLabel(c, subjects)}</Td>
                    <Td className="hidden text-gray-700 sm:table-cell">{c.room}</Td>
                    <Td className="text-right tnum">{c.enrolled}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </div>

        <div className="space-y-6">
          {pendingMarks.length > 0 && (
            <Card>
              <CardHeader title={`Markah ${nextExam.name}`} description="Kelas yang belum dimasukkan markah." />
              <ul className="divide-y divide-gray-100">
                {pendingMarks.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                    <span className="text-gray-900">{classLabel(c, subjects)}</span>
                    <a href="#/results" className="font-medium text-brand-700 hover:underline">
                      Masukkan
                    </a>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card>
            <CardHeader title={`Elaun ${monthLabel(CURRENT_MONTH)}`} description="Berdasarkan sesi yang direkod setakat hari ini." />
            <ul className="divide-y divide-gray-100">
              {perClass.map(({ c, n }) => (
                <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                  <span className="text-gray-700">{classLabel(c, subjects)}</span>
                  <span className="tnum text-gray-900">
                    {n} × {rm(me.rate)}
                  </span>
                </li>
              ))}
              <li className="flex items-center justify-between px-5 py-3 text-sm font-semibold">
                <span>Jumlah</span>
                <span className="tnum">{rm(allowance)}</span>
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
