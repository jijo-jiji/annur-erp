import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { CheckCircle2, Copy, ExternalLink, Printer } from 'lucide-react';
import { studentsApi } from '../api/client';
import { CENTRE } from '../lib/config';
import { fillMessage } from '../lib/messages';
import { useStore } from '../store';
import { date, formLabel, STUDENT_STATUS, waLink } from '../lib/format';
import { useGrades } from '../lib/grades';
import { Badge, Button, Card, CardHeader, Checkbox, cx, EmptyState, Input, PageHeader, Select, Table, Td, Th, useToast, WhatsAppIcon } from './ui';
import { BrandMark } from './Sidebar';

function registrationUrl() {
  return `${window.location.origin}${window.location.pathname}#/daftar`;
}

// ---- Staff page: QR poster + list of self-registrations ---------------------

export default function ParentQRView() {
  const { students } = useStore();
  const notify = useToast();
  const [qr, setQr] = useState('');
  const url = registrationUrl();

  useEffect(() => {
    QRCode.toDataURL(url, { width: 480, margin: 1, color: { dark: '#133b2c', light: '#ffffff' } }).then(setQr).catch(() => setQr(''));
  }, [url]);

  const selfRegistered = students.filter((s) => s.source === 'QR_CODE').sort((a, b) => (b.joined || '').localeCompare(a.joined || ''));
  const local = /localhost|127\.0\.0\.1/.test(url);

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
          {local && (
            <p className="no-print border-t border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
              Alamat ini hanya berfungsi pada komputer ini. Buka sistem melalui alamat awam supaya telefon ibu bapa boleh mengaksesnya.
            </p>
          )}
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
          <CardHeader
            title="Pendaftaran melalui QR"
            description="Pendaftaran baharu menunggu kelulusan; kelas ditetapkan oleh kaunter."
            actions={<Button as="a" size="sm" href="#/students?tab=approvals">Kelulusan</Button>}
          />
          {selfRegistered.length === 0 ? (
            <EmptyState title="Belum ada pendaftaran melalui QR">Pendaftaran baharu daripada ibu bapa akan dipaparkan di sini.</EmptyState>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Pelajar</Th>
                  <Th>Penjaga</Th>
                  <Th>Tarikh</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {selfRegistered.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <Td>
                      <a href={`#/students/${s.id}`} className="font-medium text-gray-900 hover:underline">{s.name}</a>
                      <p className="text-[13px] text-gray-500">
                        {s.id} · {formLabel(s.form)}
                      </p>
                    </Td>
                    <Td>
                      <p className="text-gray-900">{s.parent1.name}</p>
                      <p className="text-[13px] text-gray-500">{s.parent1.phone}</p>
                    </Td>
                    <Td className="whitespace-nowrap text-gray-700">{date(s.joined)}</Td>
                    <Td><Badge tone={STUDENT_STATUS[s.status]?.tone}>{STUDENT_STATUS[s.status]?.label ?? s.status}</Badge></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}

// ---- Public, mobile-first form (#/daftar) -----------------------------------
// No login: the parent gives the student's details and the subjects they are interested in.
// The counter then assigns classes and the registration goes to the Supervisor for approval.

const SUBJECT_CHOICES = ['Bahasa Melayu', 'Bahasa Inggeris', 'Matematik', 'Matematik Tambahan', 'Sains', 'Fizik', 'Kimia', 'Biologi', 'Sejarah', 'Prinsip Perakaunan'];

const EMPTY = {
  full_name: '', ic_number: '', form_level: 'F5', school_name: '', phone_number: '',
  parent1_name: '', parent1_phone: '', parent1_email: '', parent1_relation: 'Bapa',
  interested_subjects: [], saps_consent: true, terms: false,
};

export function ParentRegistrationForm() {
  const { forms } = useGrades();
  const [f, setF] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [error, setError] = useState('');
  const set = (patch) => setF((p) => ({ ...p, ...patch }));
  const toggleSubject = (name) => set({
    interested_subjects: f.interested_subjects.includes(name) ? f.interested_subjects.filter((x) => x !== name) : [...f.interested_subjects, name],
  });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    const { terms: _terms, ...payload } = f;
    try {
      setDone(await studentsApi.parentSelfRegister({
        ...payload,
        agree_terms_7th_payment: true, agree_terms_2months_auto_drop: true, agree_terms_2weeks_notice: true,
        lead_source: 'QR_CODE',
      }));
      window.scrollTo(0, 0);
    } catch (err) {
      const fieldErrors = err.data?.errors ? Object.values(err.data.errors).flat().join(' ') : '';
      setError(err.status === 429
        ? 'Terlalu banyak pendaftaran dari peranti ini. Sila cuba sebentar lagi atau hubungi kaunter.'
        : fieldErrors || 'Pendaftaran gagal. Sila semak maklumat dan cuba lagi.');
    } finally {
      setBusy(false);
    }
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
    return (
      <div className="mx-auto max-w-lg">
        {header}
        <Card className="p-6">
          <CheckCircle2 className="size-10 text-brand-600" />
          <h1 className="mt-4 text-xl font-semibold text-gray-900">Pendaftaran diterima</h1>
          <p className="mt-2 text-sm text-gray-600">
            Terima kasih, {f.parent1_name}. Pendaftaran {f.full_name} telah direkodkan dengan nombor rujukan{' '}
            <span className="font-medium text-gray-900">{done.student_id}</span>.
          </p>
          {done.message && <p className="mt-2 text-sm text-gray-600">{done.message}</p>}
          <p className="mt-2 text-sm text-gray-600">Pihak kaunter akan menghubungi anda untuk pengesahan kelas dan bayaran pertama.</p>
          <Button
            as="a"
            variant="primary"
            size="lg"
            className="mt-5 w-full"
            href={waLink(CENTRE.whatsapp, fillMessage('registered', { parent: f.parent1_name, student: f.full_name, student_id: done.student_id }))}
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
      <p className="mt-1 text-sm text-gray-600">Isi maklumat di bawah. Pihak kaunter akan menghubungi anda untuk kelas dan bayaran.</p>

      <form onSubmit={submit} className="mt-6 space-y-6">
        <Card>
          <CardHeader title="Maklumat pelajar" />
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
            <Input label="Nama penuh pelajar" required className="sm:col-span-2" value={f.full_name} onChange={(e) => set({ full_name: e.target.value })} autoComplete="off" />
            <Input label="No. kad pengenalan / sijil lahir" required value={f.ic_number} onChange={(e) => set({ ic_number: e.target.value })} inputMode="numeric" placeholder="090101-03-1234" />
            <Select label="Tingkatan / darjah" required value={f.form_level} onChange={(e) => set({ form_level: e.target.value })}>
              {forms.map((x) => (
                <option key={x.value} value={x.value}>{x.label}</option>
              ))}
            </Select>
            <Input label="Sekolah" required value={f.school_name} onChange={(e) => set({ school_name: e.target.value })} />
            <Input label="No. telefon pelajar" required type="tel" value={f.phone_number} onChange={(e) => set({ phone_number: e.target.value })} placeholder="012-345 6789" />
          </div>
        </Card>

        <Card>
          <CardHeader title="Maklumat penjaga" />
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
            <Input label="Nama ibu bapa / penjaga" required value={f.parent1_name} onChange={(e) => set({ parent1_name: e.target.value })} autoComplete="name" />
            <Select label="Hubungan" value={f.parent1_relation} onChange={(e) => set({ parent1_relation: e.target.value })}>
              <option>Bapa</option>
              <option>Ibu</option>
              <option>Penjaga</option>
            </Select>
            <Input label="No. telefon (WhatsApp)" required type="tel" value={f.parent1_phone} onChange={(e) => set({ parent1_phone: e.target.value })} autoComplete="tel" placeholder="012-345 6789" />
            <Input label="E-mel" type="email" value={f.parent1_email} onChange={(e) => set({ parent1_email: e.target.value })} autoComplete="email" />
          </div>
        </Card>

        <Card>
          <CardHeader title="Subjek diminati" description="Pilih subjek yang ingin diikuti. Waktu kelas disahkan oleh kaunter." />
          <div className="flex flex-wrap gap-2 p-5">
            {SUBJECT_CHOICES.map((name) => {
              const on = f.interested_subjects.includes(name);
              return (
                <button
                  type="button"
                  key={name}
                  onClick={() => toggleSubject(name)}
                  aria-pressed={on}
                  className={cx('rounded-md border px-3 py-2 text-sm font-medium transition-colors', on ? 'border-brand-700 bg-brand-700 text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50')}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </Card>

        <Card className="space-y-4 p-5">
          <Checkbox label="Kebenaran semakan SAPS" description="Membenarkan pusat tuisyen menyemak keputusan peperiksaan anak di sapsnkra.moe.gov.my." checked={f.saps_consent} onChange={(e) => set({ saps_consent: e.target.checked })} />
          <Checkbox
            required
            label="Saya bersetuju dengan syarat pendaftaran"
            description="Yuran dijelaskan sebelum 7 haribulan setiap bulan; tunggakan dua bulan menyebabkan pelajar diberhentikan; notis berhenti dua minggu."
            checked={f.terms}
            onChange={(e) => set({ terms: e.target.checked })}
          />
        </Card>

        {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>
          {busy ? 'Menghantar…' : 'Hantar pendaftaran'}
        </Button>
      </form>
    </div>
  );
}
