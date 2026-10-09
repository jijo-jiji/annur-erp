import { useEffect, useMemo, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { dashboardApi } from '../api/client';
import { useStore } from '../store';
import { can } from '../lib/permissions';
import { formLabel, rm } from '../lib/format';
import { downloadCsv } from '../lib/csv';
import { BarChart, HBarList, Legend, SERIES_COLORS } from './charts';
import { Badge, Button, Card, CardHeader, cx, EmptyState, PageHeader, Stat, Table, Tabs, Td, Th } from './ui';

const MONTHS = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogo', 'Sep', 'Okt', 'Nov', 'Dis'];
const rmShort = (v, axis) => (axis ? (v >= 1000 ? `RM${Math.round(v / 1000)}k` : `RM${v}`) : rm(v));

function CsvButton({ onClick }) {
  return <Button size="sm" icon={Download} onClick={onClick} className="no-print">Excel</Button>;
}

// Share of a total, as labelled bars with the amount on the right
function ShareList({ rows, empty = 'Tiada kutipan pada tahun ini.' }) {
  if (!rows.length) return <p className="text-sm text-gray-500">{empty}</p>;
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.label} className="text-sm">
          <div className="flex justify-between gap-3">
            <span className="text-gray-800">{r.label}</span>
            <span className="whitespace-nowrap font-medium text-gray-900 tnum">{rm(r.amount)} <span className="font-normal text-gray-500">({r.pct}%)</span></span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100">
            <div className="h-full rounded-full bg-brand-500" style={{ width: `${r.pct}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function ReportsView({ role }) {
  const { classes, subjects } = useStore();
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [tab, setTab] = useState('sales');
  const [loaded, setLoaded] = useState({ year: null, data: null, error: '' });
  const allowed = can(role, 'reports.view');

  useEffect(() => {
    if (!allowed) return undefined;
    let cancelled = false;
    dashboardApi.getReports(year)
      .then((d) => { if (!cancelled) setLoaded({ year, data: d, error: '' }); })
      .catch((err) => { if (!cancelled) setLoaded({ year, data: null, error: err.message || 'Gagal memuat laporan.' }); });
    return () => { cancelled = true; };
  }, [year, allowed]);

  // Seats filled per subject, from the current timetable
  const bySubject = useMemo(() => {
    const map = {};
    for (const c of classes) {
      const name = subjects.find((s) => s.code === c.subject)?.name ?? c.subject ?? '—';
      map[name] ??= { enrolled: 0, cap: 0 };
      map[name].enrolled += c.enrolled;
      map[name].cap += c.max;
    }
    return Object.entries(map)
      .map(([label, v]) => ({ label, value: v.cap ? Math.round((v.enrolled / v.cap) * 100) : 0, hint: `${v.enrolled}/${v.cap} kerusi`, enrolled: v.enrolled, cap: v.cap }))
      .sort((a, b) => b.value - a.value);
  }, [classes, subjects]);

  if (!allowed) return <Card><EmptyState title="Laporan untuk Supervisor dan Pengurusan sahaja" /></Card>;

  const data = loaded.year === year ? loaded.data : null;
  const error = loaded.year === year ? loaded.error : '';
  const finSeries = [
    { key: 'billed', label: 'Dibilkan', color: SERIES_COLORS.light },
    { key: 'collected', label: 'Dikutip', color: SERIES_COLORS.strong },
    { key: 'expenses', label: 'Perbelanjaan', color: SERIES_COLORS.muted },
  ];
  const seats = classes.reduce((a, c) => a + c.max, 0);
  const filled = classes.reduce((a, c) => a + Math.min(c.enrolled, c.max), 0);

  return (
    <div className="print-flow">
      <PageHeader
        title="Laporan"
        description="Semua angka dikira daripada rekod sistem bagi tahun dipilih."
        actions={
          <div className="no-print flex items-center gap-2">
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              aria-label="Tahun"
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none"
            >
              {[thisYear - 2, thisYear - 1, thisYear, thisYear + 1].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <Button icon={Printer} onClick={() => window.print()}>Cetak</Button>
          </div>
        }
      />

      <Tabs
        className="no-print mb-6"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'sales', label: 'Jualan & perbelanjaan' },
          { value: 'teachers', label: 'Bayaran guru' },
          { value: 'academic', label: 'Akademik & status pelajar' },
          { value: 'attendance', label: 'Kehadiran & kapasiti' },
        ]}
      />

      {error && <Card><EmptyState title={error} /></Card>}
      {!data && !error && <p className="py-10 text-center text-sm text-gray-500">Memuatkan laporan…</p>}

      {data && tab === 'sales' && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label={`Jumlah dibilkan ${data.year}`} value={rm(data.sales.total_billed)} />
            <Stat
              label="Jumlah dikutip"
              value={rm(data.sales.total_collected)}
              hint={data.sales.total_billed ? `${Math.round((data.sales.total_collected / data.sales.total_billed) * 100)}% daripada dibilkan` : undefined}
            />
            <Stat label="Tunggakan semasa" value={rm(data.sales.outstanding)} tone={data.sales.outstanding > 0 ? 'red' : undefined} />
            <Stat label="Kutipan walk-in" value={rm(data.sales.walk_in_collected)} />
          </div>

          <Card className="mt-6">
            <CardHeader
              title={`Jualan bulanan ${data.year}`}
              description="Dibilkan (invois), dikutip (resit) dan perbelanjaan (baucar disahkan atau diluluskan)"
              actions={
                <>
                  <Legend series={finSeries} />
                  <CsvButton onClick={() => downloadCsv(`jualan-bulanan-${data.year}.csv`, ['Bulan', 'Dibilkan', 'Dikutip', 'Walk-in', 'Perbelanjaan'],
                    data.sales.months.map((m) => [MONTHS[m.month - 1], m.billed, m.collected, m.walk_in_collected, m.expenses]))} />
                </>
              }
            />
            <div className="p-5">
              <BarChart data={data.sales.months.map((m) => ({ label: MONTHS[m.month - 1], values: m }))} series={finSeries} format={rmShort} />
            </div>
            <Table>
              <thead>
                <tr>
                  <Th>Bulan</Th><Th className="text-right">Dibilkan</Th><Th className="text-right">Dikutip</Th><Th className="text-right">Kadar</Th>
                  <Th className="text-right">Walk-in</Th><Th className="text-right">Perbelanjaan</Th><Th className="text-right">Lebihan</Th>
                </tr>
              </thead>
              <tbody>
                {data.sales.months.filter((m) => m.billed || m.collected || m.expenses).map((m) => {
                  const rate = m.billed ? Math.round((m.collected / m.billed) * 100) : null;
                  const surplus = m.collected - m.expenses;
                  return (
                    <tr key={m.month}>
                      <Td className="font-medium text-gray-900">{MONTHS[m.month - 1]} {data.year}</Td>
                      <Td className="text-right tnum">{rm(m.billed)}</Td>
                      <Td className="text-right tnum">{rm(m.collected)}</Td>
                      <Td className={cx('text-right tnum', rate !== null && rate < 90 && 'text-amber-700')}>{rate === null ? '—' : `${rate}%`}</Td>
                      <Td className="text-right tnum">{rm(m.walk_in_collected)}</Td>
                      <Td className="text-right tnum">{rm(m.expenses)}</Td>
                      <Td className={cx('text-right font-medium tnum', surplus < 0 && 'text-red-700')}>{rm(surplus)}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </Card>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card>
              <CardHeader title="Hasil mengikut tingkatan" description="Berdasarkan kutipan resit" />
              <div className="p-5"><ShareList rows={data.sales.by_form.map((f) => ({ label: `${f.label} (${f.students} pelajar)`, amount: f.amount, pct: f.pct }))} /></div>
            </Card>
            <Card>
              <CardHeader title="Hasil mengikut peringkat" description="Menengah atas, menengah rendah dan sekolah rendah" />
              <div className="p-5"><ShareList rows={data.sales.by_level.map((l) => ({ label: l.label, amount: l.amount, pct: l.pct }))} /></div>
            </Card>
            <Card>
              <CardHeader
                title="Perbelanjaan mengikut kategori"
                description={data.expenses.pending_total > 0 ? `${rm(data.expenses.pending_total)} lagi menunggu kelulusan` : 'Baucar disahkan atau diluluskan'}
                actions={<CsvButton onClick={() => downloadCsv(`perbelanjaan-${data.year}.csv`, ['Kategori', 'Bil. baucar', 'Jumlah'],
                  data.expenses.by_category.map((c) => [c.category, c.count, c.amount]))} />}
              />
              {data.expenses.by_category.length === 0 ? <p className="p-5 text-sm text-gray-500">Tiada perbelanjaan.</p> : (
                <ul className="divide-y divide-gray-100 text-sm">
                  {data.expenses.by_category.map((c) => (
                    <li key={c.category} className="flex justify-between gap-3 px-5 py-2.5">
                      <span className="text-gray-800">{c.category} <span className="text-gray-400">({c.count})</span></span>
                      <span className="font-medium tnum">{rm(c.amount)}</span>
                    </li>
                  ))}
                  <li className="flex justify-between gap-3 px-5 py-2.5 font-semibold"><span>Jumlah</span><span className="tnum">{rm(data.expenses.total)}</span></li>
                </ul>
              )}
            </Card>
          </div>

          <Card className="mt-6">
            <CardHeader
              title={`Bajet berbanding sebenar ${data.year}`}
              description={`Bajet bulanan daripada Data induk (kategori perbelanjaan) × ${data.budget.months_elapsed} bulan`}
              actions={<CsvButton onClick={() => downloadCsv(`bajet-vs-sebenar-${data.year}.csv`, ['Kategori', 'Bajet bulanan', 'Bajet setakat ini', 'Sebenar', 'Varians'],
                data.budget.rows.map((r) => [r.category, r.monthly_budget, r.budget_to_date, r.actual, r.variance]))} />}
            />
            <Table>
              <thead>
                <tr><Th>Kategori</Th><Th className="text-right">Bajet / bulan</Th><Th className="text-right">Bajet setakat ini</Th><Th className="text-right">Sebenar</Th><Th className="text-right">Varians</Th></tr>
              </thead>
              <tbody>
                {data.budget.rows.map((r) => (
                  <tr key={r.category}>
                    <Td className="font-medium text-gray-900">{r.category} {!r.monthly_budget && <Badge tone="amber" className="ml-1">Tiada bajet</Badge>}</Td>
                    <Td className="text-right tnum">{rm(r.monthly_budget)}</Td>
                    <Td className="text-right tnum">{rm(r.budget_to_date)}</Td>
                    <Td className="text-right font-medium tnum">{rm(r.actual)}</Td>
                    <Td className={cx('text-right font-medium tnum', r.variance < 0 ? 'text-red-700' : 'text-brand-700')}>{r.variance < 0 ? '−' : '+'}{rm(Math.abs(r.variance))}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <p className="border-t border-gray-100 px-5 py-3 text-[13px] text-gray-500">Varians positif bermaksud perbelanjaan di bawah bajet.</p>
          </Card>
        </>
      )}

      {data && tab === 'teachers' && (
        <Card>
          <CardHeader
            title={`Sesi dan elaun guru ${data.year}`}
            description="Daripada rekod kehadiran guru (guru hadir, atau guru ganti yang mengajar). Kelulusan dan slip gaji ada dalam Bayaran elaun."
            actions={data.teacher_payments.length > 0 && <CsvButton onClick={() => downloadCsv(`elaun-guru-${data.year}.csv`, ['Kod', 'Nama', 'Kategori', 'Sesi', 'Kadar semasa', 'Elaun direkod'],
              data.teacher_payments.map((t) => [t.code, t.name, t.type, t.sessions, t.rate, t.allowance]))} />}
          />
          {data.teacher_payments.length === 0 ? <EmptyState title={`Tiada rekod kehadiran guru bagi tahun ${data.year}`} /> : (
            <Table>
              <thead>
                <tr><Th>Guru</Th><Th>Kategori</Th><Th className="text-right">Sesi</Th><Th className="text-right">Kadar semasa</Th><Th className="text-right">Elaun direkod</Th></tr>
              </thead>
              <tbody>
                {data.teacher_payments.map((t) => (
                  <tr key={t.code}>
                    <Td className="font-medium text-gray-900">{t.name} <span className="font-normal text-gray-400">· {t.code}</span></Td>
                    <Td>{t.type === 'PERMANENT' ? 'Tetap' : 'Sambilan'}</Td>
                    <Td className="text-right tnum">{t.sessions}</Td>
                    <Td className="text-right tnum">{rm(t.rate)}</Td>
                    <Td className="text-right font-medium tnum">{rm(t.allowance)}</Td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <Td colSpan={2}>Jumlah</Td>
                  <Td className="text-right tnum">{data.teacher_payments.reduce((a, t) => a + t.sessions, 0)}</Td>
                  <Td />
                  <Td className="text-right tnum">{rm(data.teacher_payments.reduce((a, t) => a + Number(t.allowance || 0), 0))}</Td>
                </tr>
              </tfoot>
            </Table>
          )}
        </Card>
      )}

      {data && tab === 'academic' && (
        <>
          <Card>
            <CardHeader
              title="Pelajar dengan keputusan terkini D hingga G"
              description="Keputusan terkini setiap subjek bagi pelajar aktif"
              actions={data.academic.at_risk.length > 0 && <CsvButton onClick={() => downloadCsv('pelajar-berisiko.csv', ['ID', 'Nama', 'Tingkatan', 'Subjek', 'Peperiksaan', 'Gred', 'Markah'],
                data.academic.at_risk.map((s) => [s.student_id, s.name, s.form, s.subject, s.exam, s.grade, s.mark]))} />}
            />
            {data.academic.at_risk.length === 0 ? <EmptyState title="Tiada keputusan D hingga G direkodkan" /> : (
              <Table>
                <thead><tr><Th>Pelajar</Th><Th>Tingkatan</Th><Th>Subjek</Th><Th>Peperiksaan</Th><Th>Gred</Th></tr></thead>
                <tbody>
                  {data.academic.at_risk.map((s) => (
                    <tr key={`${s.student_id}-${s.subject}`}>
                      <Td><a href={`#/students/${s.student_id}?tab=results`} className="font-medium text-gray-900 hover:underline">{s.name}</a></Td>
                      <Td>{formLabel(s.form)}</Td>
                      <Td>{s.subject}</Td>
                      <Td>{s.exam}{s.mark !== null ? ` · ${s.mark}%` : ''}</Td>
                      <Td><Badge tone="red">{s.grade}</Badge></Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            {[
              ['Pelajar ditangguh', data.academic.on_hold, 'pelajar-ditangguh.csv'],
              ['Pelajar tidak aktif', data.academic.inactive, 'pelajar-tidak-aktif.csv'],
            ].map(([title, list, file]) => (
              <Card key={title}>
                <CardHeader
                  title={`${title} (${list.length})`}
                  actions={list.length > 0 && <CsvButton onClick={() => downloadCsv(file, ['ID', 'Nama', 'Tingkatan', 'Telefon', 'Telefon penjaga'],
                    list.map((s) => [s.student_id, s.full_name, s.form_level, s.phone_number, s.parent1_phone]))} />}
                />
                {list.length === 0 ? <p className="p-5 text-sm text-gray-500">Tiada.</p> : (
                  <ul className="max-h-80 divide-y divide-gray-100 overflow-y-auto text-sm">
                    {list.map((s) => (
                      <li key={s.student_id} className="flex justify-between gap-3 px-5 py-2.5">
                        <a href={`#/students/${s.student_id}`} className="text-gray-900 hover:underline">{s.full_name} <span className="text-gray-400">· {formLabel(s.form_level)}</span></a>
                        <span className="whitespace-nowrap text-gray-500">{s.parent1_phone}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            ))}

            <Card>
              <CardHeader title={`Sebab gugur subjek dan berhenti ${data.year}`} description="Daripada sejarah pelajar" />
              <div className="p-5">
                {data.drop_reasons.length === 0 ? <p className="text-sm text-gray-500">Tiada rekod gugur subjek atau berhenti.</p> : (
                  <HBarList
                    labelWidth="12rem"
                    rows={data.drop_reasons.map((r) => ({ label: r.label, value: r.subject_drops + r.students_left, hint: `${r.subject_drops} subjek · ${r.students_left} pelajar` }))}
                  />
                )}
                <div className="mt-5 grid grid-cols-12 gap-1 text-center text-[11px] text-gray-500">
                  {MONTHS.map((m, i) => (
                    <div key={m}>
                      <div className="font-semibold text-gray-900 tnum">{data.drops_by_month[i] + data.left_by_month[i] || '—'}</div>
                      {m}
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader title="Peningkatan keputusan" description="Perubahan markah berbanding keputusan pertama setiap subjek" />
              <dl className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100 text-center">
                {data.result_improvement.summary.map((r) => (
                  <div key={r.months} className="px-2 py-4">
                    <dd className={cx('text-lg font-semibold tnum', r.avg_change === null ? 'text-gray-400' : r.avg_change >= 0 ? 'text-brand-700' : 'text-red-700')}>
                      {r.avg_change === null ? '—' : `${r.avg_change >= 0 ? '+' : ''}${r.avg_change}`}
                    </dd>
                    <dt className="text-[13px] text-gray-500">Selepas {r.months} bulan</dt>
                    <p className="text-xs text-gray-400">{r.pairs ? `${r.pairs} rekod · ${r.improved_pct}% meningkat` : 'Tiada data'}</p>
                  </div>
                ))}
              </dl>
              {data.result_improvement.students.length > 0 && (
                <Table>
                  <thead><tr><Th>Pelajar</Th><Th>Subjek</Th><Th className="text-right">Awal</Th><Th className="text-right">3 bln</Th><Th className="text-right">6 bln</Th><Th className="text-right">9 bln</Th></tr></thead>
                  <tbody>
                    {data.result_improvement.students.map((r) => (
                      <tr key={`${r.student_id}-${r.subject}`}>
                        <Td className="font-medium text-gray-900">{r.student}</Td>
                        <Td>{r.subject}</Td>
                        <Td className="text-right tnum">{r.baseline}</Td>
                        <Td className="text-right tnum">{r.m3 ?? '—'}</Td>
                        <Td className="text-right tnum">{r.m6 ?? '—'}</Td>
                        <Td className="text-right tnum">{r.m9 ?? '—'}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>
          </div>
        </>
      )}

      {data && tab === 'attendance' && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader
              title={`Kadar kehadiran pelajar ${data.year}`}
              description="Setiap kelas: hadir daripada jumlah rekod"
              actions={data.attendance.length > 0 && <CsvButton onClick={() => downloadCsv(`kehadiran-${data.year}.csv`, ['Kelas', 'Sesi', 'Hadir', 'Jumlah', 'Kadar %'],
                data.attendance.map((r) => [r.class_code, r.sessions, r.present, r.total, r.rate]))} />}
            />
            {data.attendance.length === 0 ? <EmptyState title={`Tiada kehadiran direkodkan bagi tahun ${data.year}`} /> : (
              <Table>
                <thead><tr><Th>Kelas</Th><Th className="text-right">Sesi</Th><Th className="text-right">Kehadiran</Th><Th className="text-right">Kadar</Th></tr></thead>
                <tbody>
                  {data.attendance.map((r) => (
                    <tr key={r.class_id}>
                      <Td className="font-medium text-gray-900">{r.class_code}</Td>
                      <Td className="text-right tnum">{r.sessions}</Td>
                      <Td className="text-right tnum">{r.present}/{r.total}</Td>
                      <Td className={cx('text-right font-medium tnum', r.rate < 70 && 'text-red-700')}>{r.rate}%</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
          <Card className="self-start">
            <CardHeader
              title="Kadar pengisian mengikut subjek"
              description={seats ? `${filled} daripada ${seats} kerusi diisi (${Math.round((filled / seats) * 100)}%). Merah: melebihi kapasiti.` : 'Tiada kelas dalam jadual.'}
              actions={bySubject.length > 0 && <CsvButton onClick={() => downloadCsv('pengisian-kelas.csv', ['Subjek', 'Pelajar', 'Kerusi', 'Kadar %'], bySubject.map((r) => [r.label, r.enrolled, r.cap, r.value]))} />}
            />
            <div className="p-5">
              <HBarList rows={bySubject} labelWidth="11rem" max={100} format={(v) => `${v}%`} danger={(r) => r.value > 100} />
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
