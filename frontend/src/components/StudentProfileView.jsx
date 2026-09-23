import { useState } from 'react';
import { ArrowLeft, Link2, Phone, UserX } from 'lucide-react';
import { useStore } from '../store';
import { can } from '../lib/permissions';
import { publicUrl } from '../lib/nav';
import {
  arrearsCases, attendanceSummary, classLabel, grade, invoiceBalance, invoiceStatus, isYoungerSibling, preferredContact, siblingsOf,
} from '../lib/domain';
import { CHECKLIST, date, DAY_LABEL, formLabel, monthLabel, rm, STREAM_LABEL, STUDENT_STATUS, timeRange, waLink } from '../lib/format';
import { PaymentModal, ReceiptModal } from './BillingView';
import { TrendChart } from './charts';
import { Badge, Button, Card, CardHeader, Checkbox, DescriptionList, EmptyState, PageHeader, Stat, Table, Tabs, Td, Th, useToast, WhatsAppIcon } from './ui';

export default function StudentProfileView({ role, param }) {
  const store = useStore();
  const { students, classes, subjects, teachers, invoices, receipts, attendance, results, exams, discounts, settings, waitlist } = store;
  const notify = useToast();
  const initialTab = new URLSearchParams(window.location.hash.split('?')[1]).get('tab') ?? 'info';
  const [tab, setTab] = useState(initialTab);
  const [paying, setPaying] = useState(null);
  const [viewing, setViewing] = useState(null);

  const s = students.find((x) => x.id === param);
  if (!s) {
    return (
      <Card>
        <EmptyState title="Pelajar tidak ditemui">
          <a href="#/students" className="text-brand-700 hover:underline">
            Kembali ke senarai pelajar
          </a>
        </EmptyState>
      </Card>
    );
  }

  const enrolled = classes.filter((c) => s.classes.includes(c.id));
  const myInvoices = invoices.filter((i) => i.studentId === s.id);
  const balance = myInvoices.reduce((a, i) => a + invoiceBalance(i), 0);
  const att = attendanceSummary(s.id, attendance, s.classes);
  const contact = preferredContact(s);
  const siblings = siblingsOf(s, students);
  const myWaits = waitlist.filter((w) => w.studentId === s.id);
  const arrears = arrearsCases([s], invoices, settings.unpaidMonthsLimit)[0];
  const subjectName = (code) => subjects.find((x) => x.code === code)?.name ?? code;

  // marks per enrolled class, per exam
  const trend = enrolled.map((c) => ({
    cls: c,
    points: exams.map((e) => ({ label: e.name.replace('Ujian ', 'U'), value: results.find((r) => r.examId === e.id && r.classId === c.id)?.marks[s.id] ?? null })),
  }));
  const latestExam = [...exams].reverse().find((e) => results.some((r) => r.examId === e.id && r.marks[s.id] != null));
  const latestMarks = latestExam ? results.filter((r) => r.examId === latestExam.id && r.marks[s.id] != null).map((r) => r.marks[s.id]) : [];
  const latestAvg = latestMarks.length ? Math.round(latestMarks.reduce((a, b) => a + b, 0) / latestMarks.length) : null;

  const status = STUDENT_STATUS[s.status];
  const canStatus = can(role, 'billing.arrears') && s.status !== 'TERMINATED';

  return (
    <>
      <a href="#/students" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900">
        <ArrowLeft className="size-4" /> Senarai pelajar
      </a>
      <PageHeader
        title={s.name}
        description={`${s.id} · ${formLabel(s.form)} · ${STREAM_LABEL[s.stream]} · ${s.school}`}
        actions={
          <>
            <Button as="a" href={waLink(contact.phone, `Assalamualaikum ${contact.name}, makluman daripada Pusat Tuisyen An Nur berkenaan ${s.name}.`)} target="_blank" rel="noreferrer">
              <WhatsAppIcon /> WhatsApp {contact.relation.toLowerCase()}
            </Button>
            <Button as="a" href={`tel:${contact.phone}`} icon={Phone}>
              Telefon
            </Button>
            {canStatus && s.status === 'ACTIVE' && (
              <Button
                variant="danger"
                icon={UserX}
                onClick={() => {
                  if (window.confirm(`Gantung ${s.name}? Tempat dalam kelas akan dilepaskan kepada senarai menunggu.`)) {
                    store.updateStudent(s.id, { status: 'SUSPENDED' });
                    notify(`${s.name} digantung.`, 'info');
                  }
                }}
              >
                Gantung
              </Button>
            )}
            {canStatus && s.status === 'SUSPENDED' && (
              <Button
                variant="primary"
                onClick={() => {
                  store.updateStudent(s.id, { status: 'ACTIVE' });
                  notify(`${s.name} diaktifkan semula.`);
                }}
              >
                Aktifkan semula
              </Button>
            )}
          </>
        }
      >
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge tone={status.tone}>{status.label}</Badge>
          {arrears && <Badge tone="red">Tertunggak {arrears.months} bulan</Badge>}
          {s.discounts?.map((id) => (
            <Badge key={id} tone="blue">
              {discounts.find((d) => d.id === id)?.label}
            </Badge>
          ))}
          {isYoungerSibling(s, students) && <Badge tone="blue">Diskaun adik-beradik</Badge>}
        </div>
      </PageHeader>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Baki yuran" value={rm(balance)} tone={balance ? 'red' : undefined} hint={balance ? `${myInvoices.filter((i) => invoiceBalance(i) > 0).length} invois` : 'Tiada tunggakan'} />
        <Stat label="Kedatangan" value={att.rate != null ? `${att.rate}%` : '—'} hint={`${att.absent} tidak hadir · ${att.late} lewat`} />
        <Stat label="Purata markah" value={latestAvg != null ? `${latestAvg}%` : '—'} hint={latestExam ? `${latestExam.name} · gred ${grade(latestAvg)}` : 'Belum ada ujian'} />
        <Stat label="Subjek" value={enrolled.length} hint={myWaits.length ? `${myWaits.length} dalam senarai menunggu` : `Sejak ${date(s.joined)}`} />
      </div>

      <Tabs
        className="mb-6"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'info', label: 'Maklumat' },
          { value: 'classes', label: 'Kelas', count: enrolled.length },
          { value: 'fees', label: 'Yuran', count: myInvoices.length },
          { value: 'attendance', label: 'Kedatangan' },
          { value: 'results', label: 'Keputusan' },
        ]}
      />

      {tab === 'info' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Card>
              <CardHeader title="Maklumat pelajar" />
              <div className="p-5">
                <DescriptionList
                  items={[
                    ['No. K/P', s.ic],
                    ['Sekolah', s.school],
                    ['Telefon pelajar', s.phone],
                    ['Tarikh daftar', date(s.joined)],
                    ['Alamat', s.address],
                    ['Sumber', { BANNER: 'Banner', RAKAN: 'Rakan / saudara', FACEBOOK: 'Facebook', WHATSAPP: 'WhatsApp', QR: 'Borang QR', KAUNTER: 'Kaunter' }[s.source] ?? s.source],
                  ]}
                />
              </div>
            </Card>
            <Card>
              <CardHeader title="Penjaga" />
              <div className="grid gap-3 p-5 sm:grid-cols-2">
                {[s.parent1, s.parent2].filter((p) => p?.name).map((p, i) => (
                  <div key={p.name} className="rounded-md border border-gray-200 p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-gray-500">{p.relation}</span>
                      {s.preferred === i + 1 && <Badge tone="green">Hubungan utama</Badge>}
                    </div>
                    <p className="mt-1 font-medium text-gray-900">{p.name}</p>
                    <p className="text-gray-600">{p.phone}</p>
                    {p.occupation && <p className="text-gray-500">{p.occupation}</p>}
                  </div>
                ))}
              </div>
              {siblings.length > 0 && (
                <div className="border-t border-gray-200 px-5 py-3 text-sm">
                  <span className="text-gray-500">Adik-beradik: </span>
                  {siblings.map((x, i) => (
                    <span key={x.id}>
                      {i > 0 && ', '}
                      <a href={`#/students/${x.id}`} className="font-medium text-brand-700 hover:underline">
                        {x.name}
                      </a>
                    </span>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader title="Semakan pejabat" />
              <div className="space-y-2.5 p-5">
                {CHECKLIST.map((c) => (
                  <Checkbox
                    key={c.key}
                    label={`${c.label} (${c.key})`}
                    checked={s.checklist[c.key]}
                    disabled={!can(role, 'students.edit')}
                    onChange={(e) => store.updateStudent(s.id, { checklist: { ...s.checklist, [c.key]: e.target.checked } })}
                  />
                ))}
              </div>
            </Card>
            <Card>
              <CardHeader title="Diskaun" description="Berkuat kuasa pada invois bulan seterusnya." />
              <div className="space-y-2.5 p-5">
                {discounts.map((rule) =>
                  rule.auto ? (
                    <p key={rule.id} className="text-sm text-gray-600">
                      {rule.label} ({rule.value}%):{' '}
                      <span className="font-medium text-gray-900">{isYoungerSibling(s, students) ? 'Layak (automatik)' : 'Tidak layak'}</span>
                    </p>
                  ) : (
                    <Checkbox
                      key={rule.id}
                      label={`${rule.label} (${rule.type === 'PERCENT' ? `${rule.value}%` : rm(rule.value)})`}
                      checked={s.discounts?.includes(rule.id) ?? false}
                      disabled={!can(role, 'students.discounts')}
                      onChange={(e) =>
                        store.updateStudent(s.id, {
                          discounts: e.target.checked ? [...(s.discounts ?? []), rule.id] : (s.discounts ?? []).filter((x) => x !== rule.id),
                        })
                      }
                    />
                  ),
                )}
              </div>
            </Card>
          </div>
        </div>
      )}

      {tab === 'classes' && (
        <div className="space-y-6">
          <Card>
            <CardHeader title="Kelas didaftarkan" />
            {enrolled.length === 0 ? (
              <EmptyState title="Tiada kelas" />
            ) : (
              <ul className="divide-y divide-gray-100">
                {enrolled.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-x-6 gap-y-1 px-5 py-3">
                    <p className="w-56 text-sm font-medium text-gray-900">{classLabel(c, subjects)}</p>
                    <p className="text-[13px] text-gray-600">
                      {DAY_LABEL[c.day]}, {timeRange(c.start, c.end)} · Cikgu {teachers.find((t) => t.code === c.teacher)?.name} · Bilik {c.room}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {myWaits.length > 0 && (
            <Card>
              <CardHeader title="Senarai menunggu" />
              <ul className="divide-y divide-gray-100">
                {myWaits.map((w) => {
                  const c = classes.find((x) => x.id === w.classId);
                  return (
                    <li key={w.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{classLabel(c, subjects)}</p>
                        <p className="text-[13px] text-gray-500">
                          Menunggu sejak {date(w.added)} · {c.enrolled}/{c.max} kerusi
                        </p>
                      </div>
                      {can(role, 'waitlist.manage') && (
                        <>
                          {c.enrolled < c.max && (
                            <Button size="sm" variant="primary" onClick={() => { store.enrollFromWaitlist(w.id); notify('Pelajar dimasukkan ke kelas.'); }}>
                              Masukkan ke kelas
                            </Button>
                          )}
                          <Button size="sm" onClick={() => store.removeFromWaitlist(w.id)}>
                            Keluarkan
                          </Button>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </div>
      )}

      {tab === 'fees' && (
        <Card>
          <CardHeader title="Invois & bayaran" />
          <Table>
            <thead>
              <tr>
                <Th>Bulan</Th>
                <Th className="text-right">Yuran</Th>
                <Th className="hidden text-right sm:table-cell">Diskaun</Th>
                <Th className="text-right">Baki</Th>
                <Th>Status</Th>
                <Th className="text-right">Tindakan</Th>
              </tr>
            </thead>
            <tbody>
              {myInvoices.map((inv) => {
                const st = invoiceStatus(inv);
                const receipt = receipts.find((r) => r.no === inv.receipt);
                return (
                  <tr key={inv.no}>
                    <Td>
                      <p className="text-gray-900">{monthLabel(inv.month)}</p>
                      <p className="text-[13px] text-gray-500">{inv.no}</p>
                    </Td>
                    <Td className="text-right tnum">{rm(inv.total)}</Td>
                    <Td className="hidden text-right tnum sm:table-cell" title={inv.discounts?.map((d) => d.label).join(', ')}>
                      {inv.discount ? `− ${rm(inv.discount)}` : '—'}
                    </Td>
                    <Td className="text-right tnum">{invoiceBalance(inv) ? rm(invoiceBalance(inv)) : '—'}</Td>
                    <Td>{st === 'PAID' ? <Badge tone="green">Dibayar</Badge> : st === 'PARTIAL' ? <Badge tone="amber">Separa</Badge> : <Badge tone="red">Belum bayar</Badge>}</Td>
                    <Td className="whitespace-nowrap text-right">
                      <div className="flex justify-end gap-2">
                        {st !== 'PAID' && can(role, 'billing.record') && (
                          <>
                            <Button
                              as="a"
                              size="sm"
                              title="Hantar pautan bayaran dalam talian"
                              href={waLink(contact.phone, `Assalamualaikum ${contact.name}. Yuran ${monthLabel(inv.month)} bagi ${s.name} berjumlah ${rm(invoiceBalance(inv))}. Bayar dalam talian di: ${publicUrl(`bayar/${inv.no}`)}`)}
                              target="_blank"
                              rel="noreferrer"
                              icon={Link2}
                            >
                              Pautan
                            </Button>
                            <Button size="sm" variant="primary" onClick={() => setPaying(inv)}>
                              Rekod bayaran
                            </Button>
                          </>
                        )}
                        {receipt && (
                          <Button size="sm" onClick={() => setViewing(receipt)}>
                            Resit
                          </Button>
                        )}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}

      {tab === 'attendance' && (
        <Card>
          <CardHeader title="Rekod kedatangan" description={`${att.sessions} sesi sejak ${date(s.joined)}`} />
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
            <EmptyState title="Tiada ketidakhadiran direkodkan" />
          ) : (
            <ul className="divide-y divide-gray-100">
              {[...att.absences].reverse().map((a) => {
                const c = classes.find((x) => x.id === a.classId);
                return (
                  <li key={`${a.classId}-${a.date}`} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                    <span className="text-gray-900">{c && classLabel(c, subjects)}</span>
                    <span className="text-gray-500">{date(a.date)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      {tab === 'results' && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {trend.map(({ cls, points }) => {
            const last = [...points].reverse().find((p) => p.value != null);
            return (
              <Card key={cls.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{subjectName(cls.subject)}</p>
                    <p className="text-[13px] text-gray-500">Cikgu {teachers.find((t) => t.code === cls.teacher)?.name}</p>
                  </div>
                  {last && (
                    <div className="text-right">
                      <p className="text-lg font-semibold tnum">{last.value}</p>
                      <p className="text-xs text-gray-500">Gred {grade(last.value)}</p>
                    </div>
                  )}
                </div>
                <div className="mt-2">
                  <TrendChart points={points} />
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {paying && <PaymentModal invoice={paying} role={role} onClose={() => setPaying(null)} onPaid={(r) => { setPaying(null); setViewing(r); }} />}
      <ReceiptModal receipt={viewing} onClose={() => setViewing(null)} hideActions={!can(role, 'billing.record')} />
    </>
  );
}
