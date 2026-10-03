import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Phone, Plus } from 'lucide-react';
import { useStore } from '../store';
import { useApp } from '../context/AppContext';
import { studentsApi } from '../api/client';
import { can } from '../lib/permissions';
import {
  arrearsCases, attendanceSummary, classLabel, grade, invoiceBalance, invoiceStatus, preferredContact, siblingsOf,
} from '../lib/domain';
import { date, DAY_LABEL, formLabel, rm, STREAM_LABEL, STUDENT_STATUS, timeRange, todayISO, waLink } from '../lib/format';
import { PhotoBox } from './Attachments';
import { StudentFeedbackPanel } from './FeedbackViews';
import { invoiceTitle, PaymentModal, ReceiptModal } from './BillingView';
import { TrendChart } from './charts';
import FormModal from './FormModal';
import {
  Badge, Button, Card, CardHeader, DescriptionList, EmptyState, PageHeader, Stat, Table, Tabs, Td, Th, useToast, WhatsAppIcon,
} from './ui';

const INVOICE_BADGE = {
  PAID: <Badge tone="green">Dibayar</Badge>,
  PARTIAL: <Badge tone="amber">Separa</Badge>,
  UNPAID: <Badge tone="red">Belum bayar</Badge>,
  OVERDUE: <Badge tone="red">Tertunggak</Badge>,
};

export default function StudentProfileView({ role, param }) {
  const store = useStore();
  const { getMasterOptions } = useApp();
  const { students, classes, subjects, teachers, invoices, receipts, attendance, results, exams, discounts, settings, waitlist } = store;
  const notify = useToast();
  const initialTab = new URLSearchParams(window.location.hash.split('?')[1]).get('tab') ?? 'info';
  const [tab, setTab] = useState(initialTab);
  const [paying, setPaying] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [dialog, setDialog] = useState(null); // { type, ...context }
  const [history, setHistory] = useState([]);

  const s = students.find((x) => x.id === param);
  const pk = s?.pk;
  const loadHistory = useCallback(() => {
    if (pk) studentsApi.history({ student: pk }).then(setHistory).catch(() => setHistory([]));
  }, [pk]);
  useEffect(() => { loadHistory(); }, [loadHistory]);

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

  const canEdit = can(role, 'students.edit');
  const canApprove = can(role, 'students.approve');
  const live = ['PENDING', 'ACTIVE', 'ON_HOLD'].includes(s.status);
  const enrolled = classes.filter((c) => s.classes.includes(c.id));
  const myInvoices = invoices.filter((i) => i.studentId === s.id);
  const balance = myInvoices.reduce((a, i) => a + invoiceBalance(i), 0);
  const att = attendanceSummary(s.id, attendance, s.classes);
  const contact = preferredContact(s);
  const siblings = siblingsOf(s, students);
  const myWaits = waitlist.filter((w) => w.studentId === s.id);
  const arrears = arrearsCases([s], invoices, settings.unpaidMonthsLimit)[0];
  const subjectName = (code) => subjects.find((x) => x.code === code)?.name ?? code;
  const teacherOf = (c) => teachers.find((t) => t.code === c.teacher)?.name;
  const dropReasons = getMasterOptions('14_drop_reason');
  const examTypes = getMasterOptions('10_exam_type');
  const sourceLabel = getMasterOptions('3_lead_source').find((o) => o.value === s.source)?.label ?? (s.source === 'QR_CODE' ? 'Borang QR' : s.source);
  const ageLabel = (code) => getMasterOptions('7_parent_age').find((o) => o.value === code)?.label ?? code;
  const reasonLabel = (code) => dropReasons.find((r) => r.value === code)?.label ?? code;

  // marks per enrolled class, per exam
  const trend = enrolled.map((c) => ({
    cls: c,
    points: exams.map((e) => ({ label: e.name.length > 9 ? `${e.name.slice(0, 8)}…` : e.name, value: results.find((r) => r.examId === e.id && r.classId === c.id)?.marks[s.id] ?? null })),
  }));
  const latestExam = [...exams].reverse().find((e) => results.some((r) => r.examId === e.id && r.marks[s.id] != null));
  const latestMarks = latestExam ? results.filter((r) => r.examId === latestExam.id && r.marks[s.id] != null).map((r) => r.marks[s.id]) : [];
  const latestAvg = latestMarks.length ? Math.round(latestMarks.reduce((a, b) => a + b, 0) / latestMarks.length) : null;

  const status = STUDENT_STATUS[s.status] ?? { label: s.status, tone: 'neutral' };
  const act = (name, payload, message) => store.studentAction(s.id, name, payload).then((res) => {
    notify(typeof message === 'function' ? message(res) : message);
    loadHistory();
    return res;
  });
  const classOptions = (exclude = []) => classes
    .filter((c) => c.form === s.form && !s.classes.includes(c.id) && !exclude.includes(c.id))
    .map((c) => ({ value: c.id, label: `${classLabel(c, subjects)} · ${DAY_LABEL[c.day]} ${timeRange(c.start, c.end)} · ${c.enrolled}/${c.max}${c.enrolled >= c.max ? ' (penuh)' : ''}` }));
  const reasonOptions = dropReasons.map((r) => ({ value: r.value, label: r.label }));

  return (
    <>
      <a href="#/students" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900">
        <ArrowLeft className="size-4" /> Senarai pelajar
      </a>
      <div className="flex items-start gap-4">
        <PhotoBox kind="STUDENT_PHOTO" objectId={s.pk} name={s.name} canUpload={canEdit} size="size-16" />
        <div className="min-w-0 flex-1">
          <PageHeader
            title={s.name}
            description={`${s.id} · ${formLabel(s.form)} · ${STREAM_LABEL[s.stream] ?? s.stream} · ${s.school || 'Sekolah tidak dinyatakan'}`}
            actions={
              <>
                {contact?.phone && (
                  <>
                    <Button as="a" href={waLink(contact.phone, `Assalamualaikum ${contact.name}, makluman daripada Pusat Tuisyen An Nur berkenaan ${s.name}.`)} target="_blank" rel="noreferrer">
                      <WhatsAppIcon /> WhatsApp {(contact.relation || 'penjaga').toLowerCase()}
                    </Button>
                    <Button as="a" href={`tel:${contact.phone}`} icon={Phone}>
                      Telefon
                    </Button>
                  </>
                )}
                {s.status === 'PENDING' && canApprove && (
                  <>
                    <Button variant="danger" onClick={() => setDialog({ type: 'reject' })}>Tolak</Button>
                    <Button
                      variant="primary"
                      onClick={() => act('approve', {}, (res) => (res.invoice ? `Diluluskan. Invois ${res.invoice.invoice_number} (${rm(res.invoice.total_payable)}) dijana.` : 'Pendaftaran diluluskan.')).catch(() => {})}
                    >
                      Luluskan pendaftaran
                    </Button>
                  </>
                )}
                {s.status === 'ACTIVE' && canEdit && <Button onClick={() => setDialog({ type: 'hold' })}>Tangguh</Button>}
                {s.status === 'ON_HOLD' && canEdit && (
                  <Button variant="primary" onClick={() => act('resume', {}, `${s.name} aktif semula.`).catch(() => {})}>
                    Aktifkan semula
                  </Button>
                )}
                {['ACTIVE', 'ON_HOLD'].includes(s.status) && canEdit && (
                  <Button variant="danger" onClick={() => setDialog({ type: 'terminate' })}>Berhenti</Button>
                )}
              </>
            }
          >
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge tone={status.tone}>{status.label}</Badge>
              {s.type === 'WALK_IN' && <Badge>Walk-in</Badge>}
              {s.holdUntil && <Badge tone="amber">Tangguh hingga {date(s.holdUntil)}</Badge>}
              {s.left && <Badge>Berhenti {date(s.left)}</Badge>}
              {arrears && <Badge tone="red">Tertunggak {arrears.months} bulan</Badge>}
              {s.discounts.map((id) => (
                <Badge key={id} tone="blue">
                  {discounts.find((d) => d.id === id)?.label}
                </Badge>
              ))}
              {s.specialFee !== null && <Badge tone="blue">Kadar khas {rm(s.specialFee)}</Badge>}
            </div>
            {s.registrationComment && <p className="mt-2 text-[13px] text-gray-600">Keputusan pendaftaran ({s.decidedBy}): {s.registrationComment}</p>}
          </PageHeader>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Baki yuran" value={rm(balance)} tone={balance ? 'red' : undefined} hint={balance ? `${myInvoices.filter((i) => invoiceBalance(i) > 0).length} invois` : s.credit > 0 ? `Kredit ${rm(s.credit)}` : 'Tiada tunggakan'} />
        <Stat label="Kedatangan" value={att.rate != null ? `${att.rate}%` : '—'} hint={att.sessions ? `${att.absent} tidak hadir · ${att.late} lewat` : 'Belum direkodkan'} />
        <Stat label="Purata markah" value={latestAvg != null ? `${latestAvg}%` : '—'} hint={latestExam ? `${latestExam.name} · gred ${grade(latestAvg)}` : 'Belum ada keputusan'} />
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
          { value: 'feedback', label: 'Maklum balas' },
          { value: 'history', label: 'Sejarah & catatan', count: history.length },
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
                    ['Jenis', s.type === 'WALK_IN' ? 'Walk-in (bayar setiap sesi)' : 'Bulanan (tetap)'],
                    ['Sekolah', [s.school, s.schoolCategory].filter(Boolean).join(' · ')],
                    ['Telefon pelajar', s.phone],
                    ['E-mel', s.email],
                    ['Tarikh daftar', date(s.joined)],
                    ['Alamat', s.address],
                    ['Sumber', sourceLabel],
                    s.type === 'WALK_IN' && ['Keterangan walk-in', s.walkIn.description],
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
                    {p.email && <p className="text-gray-600">{p.email}</p>}
                    {(p.occupation || p.age) && <p className="text-gray-500">{[p.occupation, p.age && ageLabel(p.age)].filter(Boolean).join(' · ')}</p>}
                    {p.phone && (
                      <div className="mt-2 flex gap-2">
                        <Button as="a" size="sm" href={waLink(p.phone)} target="_blank" rel="noreferrer"><WhatsAppIcon className="size-3.5" /> WhatsApp</Button>
                        <Button as="a" size="sm" href={`tel:${p.phone}`}>Telefon</Button>
                        {p.email && <Button as="a" size="sm" href={`mailto:${p.email}`}>E-mel</Button>}
                      </div>
                    )}
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
              <CardHeader
                title="Yuran & diskaun"
                description="Ditetapkan oleh Supervisor / Pengurusan."
                actions={canApprove && live && <Button size="sm" onClick={() => setDialog({ type: 'fee' })}>Ubah</Button>}
              />
              <div className="p-5">
                <DescriptionList
                  className="sm:grid-cols-1"
                  items={[
                    ['Kadar khas bulanan', s.specialFee !== null ? `${rm(s.specialFee)}${s.specialFeeNote ? ` (${s.specialFeeNote})` : ''}` : 'Tiada (ikut pakej)'],
                    ['Diskaun tetap', s.discounts.map((id) => discounts.find((d) => d.id === id)?.label).join(', ') || 'Tiada'],
                    ['Kredit (lebihan bayaran)', rm(s.credit)],
                  ]}
                />
              </div>
            </Card>
          </div>
        </div>
      )}

      {tab === 'classes' && (
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Kelas didaftarkan"
              actions={canEdit && live && <Button size="sm" variant="primary" icon={Plus} onClick={() => setDialog({ type: 'enroll' })}>Tambah subjek</Button>}
            />
            {enrolled.length === 0 ? (
              <EmptyState title="Tiada kelas">{live ? 'Tambah subjek untuk menetapkan kelas pelajar ini.' : undefined}</EmptyState>
            ) : (
              <ul className="divide-y divide-gray-100">
                {enrolled.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900">{classLabel(c, subjects)}</p>
                      <p className="text-[13px] text-gray-600">
                        {DAY_LABEL[c.day]}, {timeRange(c.start, c.end)} · {teacherOf(c) ? `Cikgu ${teacherOf(c)}` : 'Guru belum ditetapkan'}{c.room && ` · Bilik ${c.room}`} · {c.enrolled}/{c.max} kerusi
                      </p>
                    </div>
                    {canEdit && live && (
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => setDialog({ type: 'change', cls: c })}>Tukar kelas</Button>
                        <Button size="sm" variant="danger" onClick={() => setDialog({ type: 'drop', cls: c })}>Gugur</Button>
                      </div>
                    )}
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
                  if (!c) return null;
                  return (
                    <li key={w.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{classLabel(c, subjects)}</p>
                        <p className="text-[13px] text-gray-500">
                          Menunggu sejak {date(w.added)} · {c.enrolled}/{c.max} kerusi
                        </p>
                      </div>
                      {can(role, 'waitlist.manage') && (
                        <Button size="sm" variant="primary" onClick={() => store.enrollFromWaitlist(w.id).then(() => { notify('Pelajar dimasukkan ke kelas.'); loadHistory(); }).catch(() => {})}>
                          Masukkan ke kelas
                        </Button>
                      )}
                      <Button size="sm" onClick={() => store.removeFromWaitlist(w.id).catch(() => {})}>
                        Keluarkan
                      </Button>
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
          <CardHeader title="Invois & bayaran" description={s.type === 'WALK_IN' ? 'Pelajar walk-in tidak dibilkan secara bulanan.' : undefined} />
          {myInvoices.length === 0 ? (
            <EmptyState title="Tiada invois">{s.status === 'PENDING' ? 'Invois pertama dijana selepas pendaftaran diluluskan.' : undefined}</EmptyState>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Invois</Th>
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
                        <p className="text-gray-900">{invoiceTitle(inv)}</p>
                        <p className="text-[13px] text-gray-500">{inv.no} · akhir {date(inv.dueDate)}</p>
                      </Td>
                      <Td className="text-right tnum">{rm(inv.total)}</Td>
                      <Td className="hidden text-right tnum sm:table-cell" title={inv.discounts?.map((d) => d.label).join(', ')}>
                        {inv.discount ? `− ${rm(inv.discount)}` : '—'}
                      </Td>
                      <Td className="text-right tnum">{invoiceBalance(inv) ? rm(invoiceBalance(inv)) : '—'}</Td>
                      <Td>{INVOICE_BADGE[st]}</Td>
                      <Td className="whitespace-nowrap text-right">
                        <div className="flex justify-end gap-2">
                          {st !== 'PAID' && can(role, 'billing.record') && (
                            <Button size="sm" variant="primary" onClick={() => setPaying(inv)}>
                              Rekod bayaran
                            </Button>
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
          )}
        </Card>
      )}

      {tab === 'attendance' && (
        <Card>
          <CardHeader title="Rekod kedatangan" description={`${att.sessions} sesi direkodkan tahun ini`} />
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
                    <span className="text-gray-900">{c && classLabel(c, subjects)}{a.notes?.[s.id] && <span className="text-gray-500"> · {a.notes[s.id]}</span>}</span>
                    <span className="text-gray-500">{date(a.date)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      {tab === 'results' && (
        <div className="space-y-4">
          {can(role, 'results.enter') && live && (
            <div className="flex justify-end">
              <Button size="sm" variant="primary" icon={Plus} onClick={() => setDialog({ type: 'result' })}>Tambah keputusan</Button>
            </div>
          )}
          {trend.every((t) => t.points.every((p) => p.value == null)) ? (
            <Card><EmptyState title="Belum ada keputusan">Masukkan keputusan di sini atau untuk seluruh kelas di Keputusan ujian.</EmptyState></Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {trend.map(({ cls, points }) => {
                const last = [...points].reverse().find((p) => p.value != null);
                return (
                  <Card key={cls.id} className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{subjectName(cls.subject)}</p>
                        <p className="text-[13px] text-gray-500">{teacherOf(cls) ? `Cikgu ${teacherOf(cls)}` : ''}</p>
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
        </div>
      )}

      {tab === 'feedback' && (
        <Card className="p-5">
          <StudentFeedbackPanel studentId={s.pk} canDelete={canApprove} onChanged={loadHistory} />
        </Card>
      )}

      {tab === 'history' && (
        <Card>
          <CardHeader
            title="Sejarah & catatan"
            description="Pendaftaran, tambah / gugur subjek, tukar kelas, tangguh, berhenti, maklum balas dan catatan."
            actions={canEdit && <Button size="sm" variant="primary" icon={Plus} onClick={() => setDialog({ type: 'note' })}>Catatan</Button>}
          />
          {history.length === 0 ? (
            <EmptyState title="Tiada rekod" />
          ) : (
            <ul className="divide-y divide-gray-100">
              {history.map((ev) => (
                <li key={ev.id} className="px-5 py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{ev.event_label}</Badge>
                    <span className="text-gray-500">{date(ev.event_date)}</span>
                    {ev.class_label && <span className="font-medium text-gray-900">{ev.class_label}</span>}
                  </div>
                  {(ev.reason_code || ev.reason_text) && <p className="mt-1 text-gray-700">Sebab: {[reasonLabel(ev.reason_code), ev.reason_text].filter(Boolean).join(' · ')}</p>}
                  {ev.hold_until && <p className="mt-1 text-gray-700">Hingga {date(ev.hold_until)}</p>}
                  {ev.description && <p className="mt-1 text-gray-700">{ev.description}</p>}
                  {ev.action && <p className="text-gray-600">Tindakan: {ev.action}</p>}
                  <p className="mt-0.5 text-xs text-gray-400">Oleh {ev.recorded_by || '-'}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {/* ---- Dialogs ---- */}
      {dialog?.type === 'reject' && (
        <FormModal
          title="Tolak pendaftaran" description={s.name} danger submitLabel="Tolak" onClose={() => setDialog(null)}
          fields={[{ name: 'comment', label: 'Sebab penolakan', type: 'textarea', required: true, hint: 'Tempat kelas yang dipilih akan dilepaskan.' }]}
          onSubmit={(v) => act('reject', v, 'Pendaftaran ditolak.')}
        />
      )}
      {dialog?.type === 'hold' && (
        <FormModal
          title="Tangguh pelajar" description="Pelajar ditangguh tidak dibilkan dalam jana invois bulanan." submitLabel="Tangguh" onClose={() => setDialog(null)}
          initial={{ start: todayISO(), until: '', reason_text: '' }}
          fields={[
            { name: 'start', label: 'Mula', type: 'date', required: true },
            { name: 'until', label: 'Hingga', type: 'date', required: true },
            { name: 'reason_text', label: 'Sebab', type: 'textarea', required: true },
          ]}
          onSubmit={(v) => act('hold', v, `${s.name} ditangguhkan.`)}
        />
      )}
      {dialog?.type === 'terminate' && (
        <FormModal
          title="Berhentikan pelajar" description="Semua kelas dan tempat menunggu dilepaskan." danger submitLabel="Berhentikan" onClose={() => setDialog(null)}
          initial={{ date: todayISO(), reason_code: '', reason_text: '' }}
          fields={[
            { name: 'reason_code', label: 'Sebab berhenti', type: 'select', options: reasonOptions, required: true },
            { name: 'reason_text', label: 'Catatan', type: 'textarea' },
            { name: 'date', label: 'Tarikh berhenti', type: 'date', required: true },
          ]}
          onSubmit={(v) => act('terminate', v, `${s.name} diberhentikan.`)}
        />
      )}
      {dialog?.type === 'enroll' && (
        <FormModal
          title="Tambah subjek" description={`Kelas ${formLabel(s.form)}. Kelas penuh: pelajar dimasukkan ke senarai menunggu.`} submitLabel="Tambah" onClose={() => setDialog(null)}
          initial={{ class_id: '', allow_over_capacity: false }}
          fields={[
            { name: 'class_id', label: 'Kelas', type: 'select', options: classOptions(), required: true },
            ...(can(role, 'waitlist.manage') ? [{ name: 'allow_over_capacity', label: 'Masukkan walaupun penuh', type: 'checkbox', hint: 'Kelas akan melebihi had kerusi.' }] : []),
          ]}
          onSubmit={(v) => act('enroll', { class_id: Number(v.class_id), allow_over_capacity: v.allow_over_capacity },
            (res) => (res.enrolment === 'WAITLISTED' ? 'Kelas penuh: pelajar dimasukkan ke senarai menunggu.' : 'Subjek ditambah.'))}
        />
      )}
      {dialog?.type === 'drop' && (
        <FormModal
          title="Gugur subjek" description={classLabel(dialog.cls, subjects)} danger submitLabel="Gugur" onClose={() => setDialog(null)}
          initial={{ reason_code: '', reason_text: '' }}
          fields={[
            { name: 'reason_code', label: 'Sebab gugur', type: 'select', options: reasonOptions, required: true },
            { name: 'reason_text', label: 'Catatan', type: 'textarea' },
          ]}
          onSubmit={(v) => act('drop', { ...v, class_id: dialog.cls.id }, 'Subjek digugurkan.')}
        />
      )}
      {dialog?.type === 'change' && (
        <FormModal
          title="Tukar kelas" description={`Dari ${classLabel(dialog.cls, subjects)}`} submitLabel="Tukar" onClose={() => setDialog(null)}
          initial={{ to_class: '', reason_text: '' }}
          fields={[
            { name: 'to_class', label: 'Kelas baharu', type: 'select', options: classOptions(), required: true },
            { name: 'reason_text', label: 'Sebab', type: 'textarea' },
          ]}
          onSubmit={(v) => act('change_class', { from_class: dialog.cls.id, to_class: Number(v.to_class), reason_text: v.reason_text }, 'Kelas ditukar.')}
        />
      )}
      {dialog?.type === 'note' && (
        <FormModal
          title="Catatan" onClose={() => setDialog(null)}
          initial={{ date: todayISO(), description: '', action: '' }}
          fields={[
            { name: 'description', label: 'Keterangan', type: 'textarea', required: true },
            { name: 'action', label: 'Tindakan' },
            { name: 'date', label: 'Tarikh', type: 'date', required: true },
          ]}
          onSubmit={(v) => act('note', v, 'Catatan disimpan.')}
        />
      )}
      {dialog?.type === 'fee' && (
        <FormModal
          title="Yuran & diskaun" description="Kadar khas untuk kes khas (kadar lain atau kurang daripada subjek minimum). Diskaun tetap ditolak setiap invois bulanan." onClose={() => setDialog(null)}
          initial={{ special_monthly_fee: s.specialFee ?? '', special_fee_note: s.specialFeeNote ?? '', standing_discount: s.raw.standing_discount ?? '' }}
          fields={[
            { name: 'special_monthly_fee', label: 'Kadar khas bulanan (RM)', type: 'number', min: 0, step: '0.01', hint: 'Kosongkan untuk ikut pakej biasa.' },
            { name: 'special_fee_note', label: 'Sebab kadar khas' },
            { name: 'standing_discount', label: 'Diskaun tetap', type: 'select', placeholder: 'Tiada diskaun',
              options: discounts.filter((d) => d.recurring && d.active).map((d) => ({ value: d.pk, label: `${d.label} (${d.type === 'PERCENT' ? `${d.value}%` : rm(d.value)})` })) },
          ]}
          onSubmit={(v) => store.updateStudent(s.id, {
            special_monthly_fee: v.special_monthly_fee === '' ? null : v.special_monthly_fee,
            special_fee_note: v.special_fee_note || '',
            standing_discount: v.standing_discount === '' ? null : Number(v.standing_discount),
          }).then(() => notify('Yuran & diskaun dikemas kini.'))}
        />
      )}
      {dialog?.type === 'result' && (
        <FormModal
          title="Tambah keputusan" description="Gred dikira daripada markah." onClose={() => setDialog(null)}
          initial={{ exam_name: '', subject: '', mark: '', exam_date: todayISO() }}
          fields={[
            { name: 'exam_name', label: 'Jenis peperiksaan', type: 'select', required: true, options: examTypes.map((e) => ({ value: e.label, label: e.label })) },
            { name: 'subject', label: 'Subjek', type: 'select', required: true, options: subjects.filter((x) => x.active).map((x) => ({ value: x.pk, label: x.name })) },
            { name: 'mark', label: 'Markah (%)', type: 'number', min: 0, max: 100, required: true },
            { name: 'exam_date', label: 'Tarikh peperiksaan', type: 'date', required: true },
          ]}
          onSubmit={async (v) => {
            try {
              await studentsApi.addResult({ student: s.pk, exam_name: v.exam_name, subject: Number(v.subject), mark: Number(v.mark), grade: grade(Number(v.mark)), exam_date: v.exam_date });
              await store.reload('results');
              notify('Keputusan disimpan.');
            } catch (err) {
              notify(err.message || 'Ralat menyimpan keputusan.', 'error');
              throw err;
            }
          }}
        />
      )}

      {paying && <PaymentModal invoice={paying} onClose={() => setPaying(null)} onPaid={(r) => { setPaying(null); setViewing(r); }} />}
      <ReceiptModal receipt={viewing} onClose={() => setViewing(null)} hideActions={!can(role, 'billing.record')} />
    </>
  );
}
