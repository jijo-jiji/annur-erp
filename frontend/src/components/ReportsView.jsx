import { useMemo } from 'react';
import { Download, Printer } from 'lucide-react';
import { CURRENT_MONTH } from '../data/demo';
import { useStore } from '../store';
import { monthLabel, monthShort, rm } from '../lib/format';
import { BarChart, HBarList, Legend, SERIES_COLORS } from './charts';
import { Button, Card, CardHeader, cx, PageHeader, Stat, Table, Td, Th } from './ui';

const rmShort = (v, axis) => (axis ? (v >= 1000 ? `RM${Math.round(v / 1000)}k` : `RM${v}`) : rm(v));

export default function ReportsView() {
  const { invoices, vouchers, attendance, classes, teachers, students, subjects, exams, results } = useStore();

  // Only months up to today; invoices generated in advance aren't due yet
  const months = useMemo(() => [...new Set(invoices.map((i) => i.month))].filter((m) => m <= CURRENT_MONTH).sort(), [invoices]);

  const monthly = useMemo(() => {
    const rateOf = Object.fromEntries(teachers.map((t) => [t.code, t.rate]));
    const classById = Object.fromEntries(classes.map((c) => [c.id, c]));
    return months.map((m) => {
      const inv = invoices.filter((i) => i.month === m);
      const billed = inv.reduce((a, i) => a + i.total - i.discount, 0);
      const collected = inv.reduce((a, i) => a + i.paid, 0);
      const expenses = vouchers.filter((v) => v.date.startsWith(m) && (v.status === 'APPROVED' || v.status === 'VERIFIED')).reduce((a, v) => a + v.amount, 0);
      const sessions = attendance.filter((a) => a.date.startsWith(m));
      const allowance = sessions.reduce((a, s) => a + (rateOf[classById[s.classId]?.teacher] ?? 0), 0);
      let seats = 0;
      let absent = 0;
      for (const s of sessions) {
        const size = s.roster?.length ?? classById[s.classId]?.enrolled ?? 0;
        seats += size;
        absent += s.absent.length;
      }
      const joined = students.filter((s) => s.joined.startsWith(m)).length;
      const left = students.filter((s) => s.left?.startsWith(m)).length;
      return {
        month: m, billed, collected, expenses, allowance, surplus: collected - expenses - allowance,
        rate: billed ? Math.round((collected / billed) * 100) : 0,
        attendance: seats ? Math.round(((seats - absent) / seats) * 100) : null,
        sessions: sessions.length, joined, left,
      };
    });
  }, [months, invoices, vouchers, attendance, classes, teachers, students]);

  const bySubject = useMemo(() => {
    const map = {};
    for (const c of classes) {
      const name = subjects.find((s) => s.code === c.subject)?.name ?? c.subject;
      const key = c.subject.endsWith('_R') ? `${name} (rendah)` : name;
      map[key] ??= { enrolled: 0, cap: 0 };
      map[key].enrolled += c.enrolled;
      map[key].cap += c.max;
    }
    return Object.entries(map)
      .map(([label, v]) => ({ label, value: Math.round((v.enrolled / v.cap) * 100), hint: `${v.enrolled}/${v.cap} kerusi` }))
      .sort((a, b) => b.value - a.value);
  }, [classes, subjects]);

  const examAvg = exams.map((e) => {
    const vals = results.filter((r) => r.examId === e.id).flatMap((r) => Object.values(r.marks));
    return { label: e.name, value: vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null };
  });

  const total = (k) => monthly.reduce((a, m) => a + m[k], 0);
  const active = students.filter((s) => s.status === 'ACTIVE').length;
  const seats = classes.reduce((a, c) => a + c.max, 0);
  const filled = classes.reduce((a, c) => a + Math.min(c.enrolled, c.max), 0);

  const exportCsv = () => {
    const header = ['Bulan', 'Dibilkan (RM)', 'Dikutip (RM)', 'Kadar kutipan (%)', 'Perbelanjaan (RM)', 'Elaun guru (RM)', 'Lebihan (RM)', 'Pelajar baharu', 'Berhenti', 'Kedatangan (%)'];
    const rows = monthly.map((m) => [monthLabel(m.month), m.billed, m.collected, m.rate, m.expenses, m.allowance, m.surplus, m.joined, m.left, m.attendance ?? '']);
    const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `laporan-an-nur-${months[0]}-${months.at(-1)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const finSeries = [
    { key: 'billed', label: 'Dibilkan', color: SERIES_COLORS.light },
    { key: 'collected', label: 'Dikutip', color: SERIES_COLORS.strong },
  ];
  const regSeries = [
    { key: 'joined', label: 'Pelajar baharu', color: SERIES_COLORS.strong },
    { key: 'left', label: 'Berhenti', color: SERIES_COLORS.muted },
  ];

  return (
    <div className="print-flow">
      <PageHeader
        title="Laporan"
        description={`${monthLabel(months[0])} – ${monthLabel(months.at(-1))} · angka elaun dikira daripada sesi yang direkod dalam kedatangan`}
        actions={
          <div className="no-print flex gap-2">
            <Button icon={Download} onClick={exportCsv}>
              Muat turun CSV
            </Button>
            <Button icon={Printer} onClick={() => window.print()}>
              Cetak
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Jumlah dikutip" value={rm(total('collected'))} hint={`${Math.round((total('collected') / total('billed')) * 100)}% daripada ${rm(total('billed'))}`} />
        <Stat label="Lebihan anggaran" value={rm(total('surplus'))} hint="Kutipan − perbelanjaan − elaun" tone={total('surplus') < 0 ? 'red' : undefined} />
        <Stat label="Pelajar aktif" value={active} hint={`${total('joined')} baharu · ${total('left')} berhenti`} />
        <Stat label="Kadar pengisian kelas" value={`${Math.round((filled / seats) * 100)}%`} hint={`${filled} daripada ${seats} kerusi`} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Yuran dibilkan dan dikutip" actions={<Legend series={finSeries} />} />
          <div className="p-5">
            <BarChart data={monthly.map((m) => ({ label: monthShort(m.month), values: m }))} series={finSeries} format={rmShort} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Pelajar baharu dan berhenti" actions={<Legend series={regSeries} />} />
          <div className="p-5">
            <BarChart data={monthly.map((m) => ({ label: monthShort(m.month), values: m }))} series={regSeries} />
          </div>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Ringkasan kewangan bulanan" />
        <Table>
          <thead>
            <tr>
              <Th>Bulan</Th>
              <Th className="text-right">Dibilkan</Th>
              <Th className="text-right">Dikutip</Th>
              <Th className="text-right">Kadar</Th>
              <Th className="text-right">Perbelanjaan</Th>
              <Th className="text-right">Elaun guru</Th>
              <Th className="text-right">Lebihan</Th>
            </tr>
          </thead>
          <tbody>
            {monthly.map((m) => (
              <tr key={m.month}>
                <Td className="font-medium text-gray-900">{monthLabel(m.month)}</Td>
                <Td className="text-right tnum">{rm(m.billed)}</Td>
                <Td className="text-right tnum">{rm(m.collected)}</Td>
                <Td className={cx('text-right tnum', m.rate < 90 && 'text-amber-700')}>{m.rate}%</Td>
                <Td className="text-right tnum">{rm(m.expenses)}</Td>
                <Td className="text-right tnum" title={`${m.sessions} sesi`}>{rm(m.allowance)}</Td>
                <Td className={cx('text-right font-medium tnum', m.surplus < 0 && 'text-red-700')}>{rm(m.surplus)}</Td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <Td>Jumlah</Td>
              <Td className="text-right tnum">{rm(total('billed'))}</Td>
              <Td className="text-right tnum">{rm(total('collected'))}</Td>
              <Td />
              <Td className="text-right tnum">{rm(total('expenses'))}</Td>
              <Td className="text-right tnum">{rm(total('allowance'))}</Td>
              <Td className="text-right tnum">{rm(total('surplus'))}</Td>
            </tr>
          </tfoot>
        </Table>
      </Card>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Kadar pengisian mengikut subjek" description="Peratus kerusi yang diisi. Merah: melebihi kapasiti." />
          <div className="p-5">
            <HBarList rows={bySubject} labelWidth="11rem" max={100} format={(v) => `${v}%`} danger={(r) => r.value > 100} />
          </div>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Kadar kedatangan" />
            <ul className="divide-y divide-gray-100">
              {monthly.map((m) => (
                <li key={m.month} className="flex items-center justify-between px-5 py-2.5 text-sm">
                  <span className="text-gray-700">{monthLabel(m.month)}</span>
                  <span className="font-medium tnum">{m.attendance != null ? `${m.attendance}%` : '—'}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHeader title="Purata markah ujian" />
            <ul className="divide-y divide-gray-100">
              {examAvg.map((e) => (
                <li key={e.label} className="flex items-center justify-between px-5 py-2.5 text-sm">
                  <span className="text-gray-700">{e.label}</span>
                  <span className="font-medium tnum">{e.value != null ? `${e.value}%` : 'Belum diadakan'}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
