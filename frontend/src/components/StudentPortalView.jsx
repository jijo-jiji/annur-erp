import { useState } from 'react';
import { Award, CreditCard } from 'lucide-react';
import { CENTRE, DAYS, DEMO_PARENT_PHONE } from '../data/demo';
import { useStore } from '../store';
import { attendanceSummary, grade, invoiceBalance, invoiceStatus } from '../lib/domain';
import { date, DAY_LABEL, formLabel, monthLabel, PAYMENT_METHOD_LABEL, rm, STREAM_LABEL, timeRange, waLink } from '../lib/format';
import { ReceiptModal } from './BillingView';
import { TrendChart } from './charts';
import { Badge, Button, Card, CardHeader, cx, EmptyState, PageHeader, Table, Tabs, Td, Th, WhatsAppIcon } from './ui';

export default function StudentPortalView() {
  const { students, classes, subjects, teachers, invoices, receipts, attendance, exams, results } = useStore();
  const children = students.filter((s) => s.parent1.phone === DEMO_PARENT_PHONE && s.status !== 'TERMINATED');
  const [childId, setChildId] = useState(children[0]?.id);
  const [tab, setTab] = useState('schedule');
  const [viewing, setViewing] = useState(null);

  const s = children.find((x) => x.id === childId);
  if (!s) return <EmptyState title="Akaun ini belum dipautkan kepada pelajar" />;

  const enrolled = classes
    .filter((c) => s.classes.includes(c.id))
    .sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day) || a.start.localeCompare(b.start));
  const myInvoices = invoices.filter((i) => i.studentId === s.id);
  const myReceipts = receipts.filter((r) => myInvoices.some((i) => i.no === r.invoiceNo));
  const subjectName = (code) => subjects.find((x) => x.code === code)?.name ?? code;
  // oldest outstanding first
  const unpaid = myInvoices.filter((i) => invoiceBalance(i) > 0).sort((a, b) => a.month.localeCompare(b.month));
  const outstanding = unpaid.reduce((a, i) => a + invoiceBalance(i), 0);
  const att = attendanceSummary(s.id, attendance, s.classes);
  const familyOutstanding = children.reduce(
    (a, c) => a + invoices.filter((i) => i.studentId === c.id).reduce((x, i) => x + invoiceBalance(i), 0),
    0,
  );

  return (
    <div className="mx-auto max-w-4xl">
      {children.length > 1 && (
        <div className="mb-5 flex flex-wrap gap-2" role="tablist" aria-label="Anak">
          {children.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={c.id === childId}
              onClick={() => setChildId(c.id)}
              className={cx(
                'rounded-full border px-3.5 py-1.5 text-sm font-medium',
                c.id === childId ? 'border-brand-700 bg-brand-700 text-white' : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400',
              )}
            >
              {c.name.split(/ bin | binti /)[0]} · {formLabel(c.form)}
            </button>
          ))}
        </div>
      )}

      <PageHeader
        title={s.name}
        description={`${s.id} · ${formLabel(s.form)} · ${STREAM_LABEL[s.stream]} · ${s.school}`}
        actions={
          <Button as="a" href={waLink(CENTRE.whatsapp)} target="_blank" rel="noreferrer">
            <WhatsAppIcon /> Hubungi kaunter
          </Button>
        }
      />

      {outstanding > 0 && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm text-amber-900">
            Baki yuran <strong>{rm(outstanding)}</strong> ({unpaid.map((i) => monthLabel(i.month)).join(', ')}). Tarikh akhir {date(unpaid[0].dueDate)}.
          </p>
          <Button as="a" href={`#/bayar/${unpaid[0].no}`} variant="primary" icon={CreditCard}>
            Bayar sekarang
          </Button>
        </div>
      )}
      {outstanding === 0 && familyOutstanding > 0 && (
        <p className="mb-6 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
          Tiada baki untuk {s.name.split(/ bin | binti /)[0]}. Terdapat baki {rm(familyOutstanding)} bagi anak lain — pilih nama di atas.
        </p>
      )}

      <div className="mb-6 grid grid-cols-3 gap-3">
        {[
          ['Subjek', enrolled.length],
          ['Kedatangan', att.rate != null ? `${att.rate}%` : '—'],
          ['Baki yuran', rm(outstanding)],
        ].map(([k, v]) => (
          <Card key={k} className="px-4 py-3">
            <p className="text-[13px] text-gray-500">{k}</p>
            <p className="mt-1 text-lg font-semibold tnum">{v}</p>
          </Card>
        ))}
      </div>

      <Tabs
        className="mb-6"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'schedule', label: 'Jadual' },
          { value: 'fees', label: 'Yuran' },
          { value: 'attendance', label: 'Kedatangan' },
          { value: 'results', label: 'Keputusan' },
        ]}
      />

      {tab === 'schedule' && (
        <Card>
          <CardHeader title="Jadual mingguan" description={`${enrolled.length} subjek · setiap sesi 1 jam 30 minit`} />
          <ul className="divide-y divide-gray-100">
            {enrolled.map((c) => (
              <li key={c.id} className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:gap-6">
                <div className="w-44 shrink-0">
                  <p className="text-sm font-medium text-gray-900">{DAY_LABEL[c.day]}</p>
                  <p className="text-[13px] text-gray-500">{timeRange(c.start, c.end)}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">{subjectName(c.subject)}</p>
                  <p className="text-[13px] text-gray-500">
                    Cikgu {teachers.find((t) => t.code === c.teacher)?.name} · Bilik {c.room}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {tab === 'fees' && (
        <div className="space-y-6">
          <Card>
            <CardHeader title="Invois" />
            <Table>
              <thead>
                <tr>
                  <Th>Bulan</Th>
                  <Th className="text-right">Jumlah</Th>
                  <Th className="text-right">Baki</Th>
                  <Th>Status</Th>
                  <Th className="text-right">
                    <span className="sr-only">Tindakan</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {myInvoices.map((i) => (
                  <tr key={i.no}>
                    <Td>
                      <p className="text-gray-900">{monthLabel(i.month)}</p>
                      <p className="text-[13px] text-gray-500">{i.no}</p>
                    </Td>
                    <Td className="text-right tnum">
                      {rm(i.total - i.discount)}
                      {i.discount > 0 && <p className="text-xs text-gray-500">termasuk diskaun {rm(i.discount)}</p>}
                    </Td>
                    <Td className="text-right tnum">{invoiceBalance(i) ? rm(invoiceBalance(i)) : '—'}</Td>
                    <Td>{invoiceStatus(i) === 'PAID' ? <Badge tone="green">Dibayar</Badge> : <Badge tone="red">Belum bayar</Badge>}</Td>
                    <Td className="text-right">
                      {invoiceBalance(i) > 0 && (
                        <Button as="a" size="sm" variant="primary" href={`#/bayar/${i.no}`}>
                          Bayar
                        </Button>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
          <Card>
            <CardHeader title="Resit" />
            {myReceipts.length === 0 ? (
              <EmptyState title="Tiada resit lagi" />
            ) : (
              <ul className="divide-y divide-gray-100">
                {myReceipts.map((r) => (
                  <li key={r.no} className="flex items-center justify-between gap-4 px-5 py-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{r.no}</p>
                      <p className="text-[13px] text-gray-500">
                        {date(r.date)} · {PAYMENT_METHOD_LABEL[r.method]}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium tnum">{rm(r.amount)}</span>
                      <Button size="sm" onClick={() => setViewing(r)}>
                        Lihat
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {tab === 'attendance' && (
        <Card>
          <CardHeader title="Kedatangan" description={`${att.sessions} sesi sejak ${date(s.joined)}`} />
          <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-200 text-center">
            {[
              ['Hadir', att.sessions - att.absent],
              ['Tidak hadir', att.absent],
              ['Lewat', att.late],
            ].map(([k, v]) => (
              <div key={k} className="py-4">
                <p className="text-xl font-semibold tnum">{v}</p>
                <p className="text-[13px] text-gray-500">{k}</p>
              </div>
            ))}
          </div>
          {att.absences.length === 0 ? (
            <p className="px-5 py-6 text-center text-sm text-gray-500">Tiada ketidakhadiran direkodkan.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {[...att.absences].reverse().map((a) => {
                const c = classes.find((x) => x.id === a.classId);
                return (
                  <li key={`${a.classId}-${a.date}`} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                    <span className="text-gray-900">{c && subjectName(c.subject)}</span>
                    <span className="text-gray-500">{date(a.date)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      {tab === 'results' &&
        (results.some((r) => r.marks[s.id] != null) ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {enrolled.map((c) => {
              const points = exams.map((e) => ({ label: e.name.replace('Ujian ', 'U'), value: results.find((r) => r.examId === e.id && r.classId === c.id)?.marks[s.id] ?? null }));
              const last = [...points].reverse().find((p) => p.value != null);
              return (
                <Card key={c.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-gray-900">{subjectName(c.subject)}</p>
                    {last && (
                      <p className="text-right">
                        <span className="text-lg font-semibold tnum">{last.value}</span>
                        <span className="ml-1.5 text-sm text-gray-500">{grade(last.value)}</span>
                      </p>
                    )}
                  </div>
                  <TrendChart points={points} />
                </Card>
              );
            })}
          </div>
        ) : (
          <Card>
            <EmptyState icon={Award} title="Belum ada keputusan direkodkan" />
          </Card>
        ))}

      <ReceiptModal receipt={viewing} onClose={() => setViewing(null)} hideActions />
    </div>
  );
}
