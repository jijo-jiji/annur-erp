import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { CheckCircle2, Copy, ExternalLink, Printer } from 'lucide-react';
import { CENTRE, FORMS } from '../data/demo';
import { useStore } from '../store';
import { minSubjects, monthlyFee } from '../lib/domain';
import { date, formLabel, rm, waLink } from '../lib/format';
import { Badge, Button, Card, CardHeader, Checkbox, EmptyState, Input, PageHeader, Select, Table, Td, Th, useToast, WhatsAppIcon } from './ui';
import { BrandMark } from './Sidebar';
import { ClassPicker } from './StudentRegistrationView';
import { InvoiceLines } from './BillingView';

function registrationUrl() {
  return `${window.location.origin}${window.location.pathname}#/daftar`;
}

// ---- Staff page: QR poster + list of self-registrations ---------------------

export default function ParentQRView() {
  const { students, invoices } = useStore();
  const notify = useToast();
  const [qr, setQr] = useState('');
  const url = registrationUrl();

  useEffect(() => {
    QRCode.toDataURL(url, { width: 480, margin: 1, color: { dark: '#133b2c', light: '#ffffff' } }).then(setQr);
  }, [url]);

  const selfRegistered = students.filter((s) => s.source === 'QR');

  return (
    <>
      <PageHeader
        title="Pendaftaran QR"
        description="Ibu bapa mengimbas kod QR di kaunter untuk mendaftar anak sendiri melalui telefon."
        actions={
          <Button as="a" href="#/daftar" target="_blank" rel="noreferrer" icon={ExternalLink}>
            Buka borang
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_1fr]">
        <Card className="self-start">
          <div className="print-area bg-white p-6 text-center">
            <p className="text-sm font-semibold text-gray-900">{CENTRE.name}</p>
            <p className="mt-0.5 text-[13px] text-gray-500">Imbas untuk mendaftar pelajar baharu</p>
            {qr ? <img src={qr} alt="Kod QR borang pendaftaran" className="mx-auto mt-4 size-56" /> : <div className="mx-auto mt-4 size-56 rounded bg-gray-100" />}
            <p className="mt-3 break-all text-xs text-gray-500">{url}</p>
          </div>
          <div className="no-print flex gap-2 border-t border-gray-200 p-4">
            <Button
              size="sm"
              icon={Copy}
              className="flex-1"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(url);
                  notify('Pautan disalin.', 'info');
                } catch {
                  notify('Tidak dapat menyalin pautan.', 'error');
                }
              }}
            >
              Salin pautan
            </Button>
            <Button size="sm" icon={Printer} className="flex-1" onClick={() => window.print()}>
              Cetak poster
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader title="Pendaftaran melalui QR" description="Semak maklumat dan lengkapkan semakan pejabat selepas bayaran diterima." />
          {selfRegistered.length === 0 ? (
            <EmptyState title="Belum ada pendaftaran melalui QR">Pendaftaran baharu daripada ibu bapa akan dipaparkan di sini.</EmptyState>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Pelajar</Th>
                  <Th>Penjaga</Th>
                  <Th>Tarikh</Th>
                  <Th>Bayaran</Th>
                </tr>
              </thead>
              <tbody>
                {selfRegistered.map((s) => {
                  const inv = invoices.find((i) => i.studentId === s.id);
                  return (
                    <tr key={s.id}>
                      <Td>
                        <p className="font-medium text-gray-900">{s.name}</p>
                        <p className="text-[13px] text-gray-500">
                          {s.id} · {formLabel(s.form)}
                        </p>
                      </Td>
                      <Td>
                        <p className="text-gray-900">{s.parent1.name}</p>
                        <p className="text-[13px] text-gray-500">{s.parent1.phone}</p>
                      </Td>
                      <Td className="whitespace-nowrap text-gray-700">{date(s.joined)}</Td>
                      <Td>{inv && inv.paid >= inv.total ? <Badge tone="green">Dibayar</Badge> : <Badge tone="amber">Belum bayar</Badge>}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}

// ---- Public, mobile-first form (#/daftar) -----------------------------------

export function ParentRegistrationForm() {
  const { registerStudent, pricingTiers, settings } = useStore();
  const [done, setDone] = useState(null);
  const [error, setError] = useState('');
  const [f, setF] = useState({
    name: '', ic: '', form: 'F4', school: '', parentName: '', parentPhone: '', relation: 'Bapa', classes: [], waitlist: [], saps: true, terms: false,
  });
  const set = (patch) => setF((p) => ({ ...p, ...patch }));
  const min = minSubjects(f.form);
  const fee = monthlyFee(f.form, f.classes.length, pricingTiers);

  const submit = (e) => {
    e.preventDefault();
    if (f.classes.length < min) {
      setError(`Sila pilih sekurang-kurangnya ${min} subjek.`);
      return;
    }
    const result = registerStudent(
      {
        name: f.name, ic: f.ic, form: f.form, stream: 'GENERAL', school: f.school, phone: '', address: '',
        parent1: { name: f.parentName, phone: f.parentPhone, occupation: '', relation: f.relation },
        parent2: { name: '', phone: '', occupation: '', relation: 'Ibu' },
        preferred: 1, classes: f.classes,
      },
      { source: 'QR', waitlist: f.waitlist },
    );
    setDone(result);
    window.scrollTo(0, 0);
  };

  const header = (
    <div className="mb-6 flex items-center gap-3">
      <BrandMark />
      <div>
        <p className="font-semibold text-gray-900">{CENTRE.name}</p>
        <p className="text-[13px] text-gray-500">Cawangan {CENTRE.branch}</p>
      </div>
    </div>
  );

  if (done) {
    const { student, invoice } = done;
    return (
      <div className="mx-auto max-w-lg">
        {header}
        <Card className="p-6">
          <CheckCircle2 className="size-10 text-brand-600" />
          <h1 className="mt-4 text-xl font-semibold text-gray-900">Pendaftaran diterima</h1>
          <p className="mt-2 text-sm text-gray-600">
            Terima kasih, {f.parentName}. Pendaftaran {student.name} telah direkodkan dengan nombor rujukan{' '}
            <span className="font-medium text-gray-900">{student.id}</span>.
          </p>
          <div className="mt-5 rounded-md bg-gray-50 p-4">
            <InvoiceLines inv={invoice} showPaid={false} />
          </div>
          {f.waitlist.length > 0 && (
            <p className="mt-3 text-sm text-gray-600">{f.waitlist.length} kelas yang penuh dimasukkan ke senarai menunggu. Kaunter akan menghubungi anda apabila ada kekosongan.</p>
          )}
          <p className="mt-4 text-sm text-gray-600">Jelaskan bayaran pertama dalam talian sekarang, atau di kaunter.</p>
          <Button as="a" href={`#/bayar/${invoice.no}`} variant="primary" size="lg" className="mt-4 w-full">
            Bayar {rm(invoice.total - invoice.discount)} sekarang
          </Button>
          <Button
            as="a"
            size="lg"
            className="mt-2 w-full"
            href={waLink(CENTRE.whatsapp, `Assalamualaikum. Saya ${f.parentName} telah mendaftar ${student.name} (${student.id}) melalui borang QR.`)}
            target="_blank"
            rel="noreferrer"
          >
            <WhatsAppIcon /> Hubungi kaunter
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      {header}
      <h1 className="text-xl font-semibold text-gray-900">Borang pendaftaran pelajar</h1>
      <p className="mt-1 text-sm text-gray-600">Isi maklumat di bawah. Pihak kaunter akan menghubungi anda untuk pengesahan.</p>

      <form onSubmit={submit} className="mt-6 space-y-6">
        <Card>
          <CardHeader title="Maklumat pelajar" />
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
            <Input label="Nama penuh pelajar" required className="sm:col-span-2" value={f.name} onChange={(e) => set({ name: e.target.value })} autoComplete="off" />
            <Input label="No. kad pengenalan" required value={f.ic} onChange={(e) => set({ ic: e.target.value })} inputMode="numeric" placeholder="090101-03-1234" />
            <Select label="Tingkatan / darjah" required value={f.form} onChange={(e) => set({ form: e.target.value, classes: [], waitlist: [] })}>
              {FORMS.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </Select>
            <Input label="Sekolah" required className="sm:col-span-2" value={f.school} onChange={(e) => set({ school: e.target.value })} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Maklumat penjaga" />
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
            <Input label="Nama penjaga" required className="sm:col-span-2" value={f.parentName} onChange={(e) => set({ parentName: e.target.value })} autoComplete="name" />
            <Input label="No. telefon (WhatsApp)" required type="tel" value={f.parentPhone} onChange={(e) => set({ parentPhone: e.target.value })} autoComplete="tel" placeholder="012-345 6789" />
            <Select label="Hubungan" value={f.relation} onChange={(e) => set({ relation: e.target.value })}>
              <option>Bapa</option>
              <option>Ibu</option>
              <option>Penjaga</option>
            </Select>
          </div>
        </Card>

        <Card>
          <CardHeader title="Pilih kelas" description={f.form.startsWith('F') ? 'Minimum 4 subjek. Pilih satu waktu bagi setiap subjek.' : 'Pilih kelas yang ingin dihadiri.'} />
          <div className="px-5 pb-2">
            <ClassPicker form={f.form} value={f.classes} waitlist={f.waitlist} onWaitlistChange={(waitlist) => set({ waitlist })} onChange={(classes) => { set({ classes }); setError(''); }} />
          </div>
          <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-5 py-3 text-sm">
            <span className="text-gray-600">{f.classes.length} subjek dipilih</span>
            <span className="font-semibold tnum">{fee ? `${rm(fee)} sebulan` : '—'}</span>
          </div>
        </Card>

        <Card className="space-y-4 p-5">
          <Checkbox label="Kebenaran semakan SAPS" description="Membenarkan pusat tuisyen menyemak keputusan peperiksaan anak di sapsnkra.moe.gov.my." checked={f.saps} onChange={(e) => set({ saps: e.target.checked })} />
          <Checkbox
            required
            label="Saya bersetuju dengan syarat pendaftaran"
            description={`Yuran dijelaskan sebelum ${settings.dueDay} haribulan setiap bulan. Yuran pendaftaran ${rm(settings.regFee)} dikenakan sekali.`}
            checked={f.terms}
            onChange={(e) => set({ terms: e.target.checked })}
          />
        </Card>

        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <Button type="submit" variant="primary" size="lg" className="w-full">
          Hantar pendaftaran
        </Button>
      </form>
    </div>
  );
}
