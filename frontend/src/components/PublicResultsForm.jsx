import { useState } from 'react';
import { CheckCircle2, Upload } from 'lucide-react';
import { publicApi } from '../api/client';
import { describeError } from '../lib/apiErrors';
import { CENTRE } from '../lib/config';
import { grade } from '../lib/domain';
import { latestSat, termOf } from '../lib/results';
import { todayISO } from '../lib/format';
import { BrandMark } from './Sidebar';
import { Button, Card, CardHeader, cx, Input, inputClass, Select, Textarea } from './ui';

const RELATIONS = ['Pelajar', 'Bapa', 'Ibu', 'Penjaga'];

// Public, mobile-first form (#/keputusan): a parent or the student sends school exam results without an account.
// The student code and the last 4 digits of the IC prove who it is; staff check the results before they are saved.
export default function PublicResultsForm() {
  const [who, setWho] = useState({ code: '', ic: '' });
  const [student, setStudent] = useState(null); // what the server returns once the code and IC match
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);

  const failed = (err, fallback) => setError(err.status === 429
    ? 'Terlalu banyak percubaan dari peranti ini. Sila cuba sebentar lagi atau hubungi kaunter.'
    : err.data?.detail || describeError(err) || fallback);

  const check = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      setStudent(await publicApi.checkResults(who.code.trim(), who.ic.trim()));
    } catch (err) {
      failed(err, 'Tidak dapat menyemak. Sila cuba lagi.');
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
          <h1 className="mt-4 text-xl font-semibold text-gray-900">Keputusan diterima</h1>
          <p className="mt-2 text-sm text-gray-600">
            Terima kasih. {done.count} keputusan {done.exam} bagi {done.student_name} telah dihantar dengan nombor rujukan{' '}
            <span className="font-medium text-gray-900">{done.reference}</span>.
          </p>
          {done.replaced && <p className="mt-2 text-sm text-gray-600">Hantaran anda sebelum ini untuk peperiksaan yang sama telah dikemas kini.</p>}
          <p className="mt-2 text-sm text-gray-600">Pihak pusat tuisyen akan menyemak keputusan ini sebelum ia direkodkan.</p>
          <Button variant="primary" size="lg" className="mt-5 w-full" onClick={() => setDone(null)}>Hantar keputusan peperiksaan lain</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      {header}
      <h1 className="text-xl font-semibold text-gray-900">Keputusan peperiksaan sekolah</h1>
      <p className="mt-1 text-sm text-gray-600">Ibu bapa atau pelajar boleh menghantar keputusan peperiksaan sekolah di sini. Keputusan disemak oleh pusat tuisyen sebelum direkodkan.</p>

      {!student ? (
        <form onSubmit={check} className="mt-6">
          <Card>
            <CardHeader title="Pengesahan pelajar" description="Kod pelajar tertera pada resit yuran, contohnya HQ-260001." />
            <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
              <Input label="Kod pelajar" required value={who.code} onChange={(e) => setWho({ ...who, code: e.target.value.toUpperCase() })} autoComplete="off" placeholder="HQ-260001" />
              <Input
                label="4 digit akhir No. K/P pelajar" required inputMode="numeric" maxLength={4} pattern="\d{4}" value={who.ic}
                onChange={(e) => setWho({ ...who, ic: e.target.value.replace(/\D/g, '').slice(0, 4) })} autoComplete="off" placeholder="1234"
              />
            </div>
          </Card>
          {error && <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <Button type="submit" variant="primary" size="lg" className="mt-4 w-full" disabled={busy}>{busy ? 'Menyemak…' : 'Teruskan'}</Button>
        </form>
      ) : (
        <ResultsEntry
          who={who}
          student={student}
          onChangeStudent={() => { setStudent(null); setError(''); }}
          onDone={(res) => { setDone(res); window.scrollTo(0, 0); }}
        />
      )}
    </div>
  );
}

function ResultsEntry({ who, student, onChangeStudent, onDone }) {
  const tuition = student.subjects.filter((x) => x.tuition).map((x) => x.id);
  const [f, setF] = useState({
    year: student.years[0], term: latestSat(student.terms.map((t) => t.code), todayISO()), submitted_by: '', relation: 'Bapa', phone: '', note: '',
  });
  const [shown, setShown] = useState(tuition.length ? tuition : student.subjects.slice(0, 5).map((x) => x.id));
  const [values, setValues] = useState({});
  const [slip, setSlip] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (patch) => setF((p) => ({ ...p, ...patch }));
  const gradeOnly = termOf(f.term)?.gradeOnly;
  const nameOf = (id) => student.subjects.find((x) => x.id === id)?.name;
  const others = student.subjects.filter((x) => !shown.includes(x.id));
  const filled = shown.filter((id) => (values[id] ?? '') !== '');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!filled.length) { setError('Masukkan sekurang-kurangnya satu keputusan.'); return; }
    setBusy(true);
    try {
      onDone(await publicApi.sendResults({
        student_code: who.code.trim(), ic_last4: who.ic.trim(), ...f,
        rows: filled.map((id) => (gradeOnly ? { subject: id, grade: values[id] } : { subject: id, mark: values[id] })),
      }, slip));
    } catch (err) {
      setError(err.status === 429
        ? 'Terlalu banyak percubaan dari peranti ini. Sila cuba sebentar lagi atau hubungi kaunter.'
        : err.data?.detail || describeError(err) || 'Penghantaran gagal. Sila semak maklumat dan cuba lagi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-6 space-y-6">
      <Card className="flex items-center justify-between gap-3 p-5">
        <div>
          <p className="font-medium text-gray-900">{student.name}</p>
          <p className="text-[13px] text-gray-500">{student.student_code} · {student.form_label}</p>
        </div>
        <Button size="sm" variant="ghost" onClick={onChangeStudent}>Tukar pelajar</Button>
      </Card>

      <Card>
        <CardHeader title="Peperiksaan" />
        <div className="grid grid-cols-2 gap-4 p-5">
          <Select label="Tahun" required value={f.year} onChange={(e) => set({ year: Number(e.target.value) })}>
            {student.years.map((y) => <option key={y} value={y}>{y}</option>)}
          </Select>
          <Select label="Peperiksaan" required value={f.term} onChange={(e) => { set({ term: e.target.value }); setValues({}); }}>
            {student.terms.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
          </Select>
        </div>
      </Card>

      <Card>
        <CardHeader title="Keputusan" description={gradeOnly ? 'Pilih gred bagi setiap subjek.' : 'Masukkan markah (0–100) seperti dalam slip keputusan. Biarkan kosong jika tiada.'} />
        <div className="divide-y divide-gray-100">
          {shown.map((id) => {
            const v = values[id] ?? '';
            return (
              <div key={id} className="flex items-center justify-between gap-3 px-5 py-3">
                <span className="text-sm text-gray-900">{nameOf(id)}</span>
                {gradeOnly ? (
                  <select aria-label={`Gred ${nameOf(id)}`} value={v} onChange={(e) => setValues({ ...values, [id]: e.target.value })} className={cx(inputClass, 'w-24')}>
                    <option value="">—</option>
                    {student.grades.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                ) : (
                  <span className="flex items-center gap-2">
                    <input
                      type="number" min="0" max="100" inputMode="numeric" aria-label={`Markah ${nameOf(id)}`} value={v}
                      onChange={(e) => setValues({ ...values, [id]: e.target.value === '' ? '' : String(Math.max(0, Math.min(100, Number(e.target.value)))) })}
                      className={cx(inputClass, 'w-20 text-right tnum')}
                    />
                    <span className="w-8 text-sm font-semibold text-gray-700">{v !== '' ? grade(Number(v)) : ''}</span>
                  </span>
                )}
              </div>
            );
          })}
        </div>
        {others.length > 0 && (
          <div className="border-t border-gray-200 p-5">
            <select aria-label="Tambah subjek" value="" onChange={(e) => e.target.value && setShown([...shown, Number(e.target.value)])} className={cx(inputClass, 'w-full')}>
              <option value="">+ Tambah subjek lain</option>
              {others.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Slip keputusan (pilihan)" description="Gambar atau PDF slip keputusan memudahkan semakan." />
        <label className="flex cursor-pointer items-center gap-3 p-5 text-sm text-gray-700">
          <span className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 font-medium hover:bg-gray-50">
            <Upload className="size-4" /> {slip ? 'Tukar fail' : 'Pilih gambar / PDF'}
          </span>
          <span className="min-w-0 truncate text-gray-500">{slip ? slip.name : 'Tiada fail dipilih'}</span>
          <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" onChange={(e) => setSlip(e.target.files?.[0] || null)} />
        </label>
      </Card>

      <Card>
        <CardHeader title="Penghantar" />
        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
          <Input label="Nama anda" required value={f.submitted_by} onChange={(e) => set({ submitted_by: e.target.value })} autoComplete="name" />
          <Select label="Hubungan dengan pelajar" value={f.relation} onChange={(e) => set({ relation: e.target.value })}>
            {RELATIONS.map((r) => <option key={r}>{r}</option>)}
          </Select>
          <Input label="No. telefon" type="tel" value={f.phone} onChange={(e) => set({ phone: e.target.value })} autoComplete="tel" placeholder="Jika pusat perlu menghubungi anda" />
          <Textarea label="Catatan (pilihan)" className="sm:col-span-2" value={f.note} onChange={(e) => set({ note: e.target.value })} rows={2} />
        </div>
      </Card>

      {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>{busy ? 'Menghantar…' : `Hantar ${filled.length || ''} keputusan`}</Button>
    </form>
  );
}
