import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { CENTRE } from '../lib/config';
import { Button, Input } from './ui';
import { BrandMark } from './Sidebar';

export default function LoginView({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await onLogin(username.trim(), password);
    } catch (err) {
      setError(
        err.status === 429
          ? 'Terlalu banyak percubaan. Sila cuba semula sebentar lagi.'
          : err.status === 400 || err.status === 401
            ? 'Nama pengguna atau kata laluan tidak betul.'
            : 'Tidak dapat menghubungi pelayan. Sila cuba lagi.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(480px,40%)]">
      <aside className="relative hidden flex-col justify-between bg-brand-900 p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <BrandMark inverted />
          <span className="font-semibold">{CENTRE.name}</span>
        </div>
        <div className="max-w-md">
          <p className="text-3xl font-semibold leading-tight tracking-tight">
            Pendaftaran, jadual kelas dan yuran pelajar — di satu tempat.
          </p>
          <p className="mt-4 text-brand-200">
            Sistem pengurusan dalaman untuk kaunter, supervisor dan pengurusan Cawangan {CENTRE.branch}.
          </p>
        </div>
        <p className="text-sm text-brand-300">
          {CENTRE.address}
          <br />
          Tel: {CENTRE.phone}
        </p>
      </aside>

      <main className="flex items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <BrandMark />
            <span className="font-semibold text-gray-900">{CENTRE.name}</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Log masuk</h1>
          <p className="mt-1 text-sm text-gray-600">Masukkan maklumat akaun anda untuk meneruskan.</p>

          <form className="mt-8 space-y-4" onSubmit={submit}>
            <Input label="Nama pengguna" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus required />
            <Input label="Kata laluan" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
            {error && (
              <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">
                {error}
              </p>
            )}
            <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>
              {busy ? 'Menyemak…' : 'Log masuk'} {!busy && <ArrowRight className="size-4" />}
            </Button>
          </form>

          <p className="mt-6 text-[13px] text-gray-500">Akaun diberikan oleh Pengurusan. Lupa kata laluan? Sila hubungi Pengurusan.</p>
          <p className="mt-6 border-t border-gray-200 pt-6 text-sm text-gray-600">
            Ibu bapa yang ingin mendaftar anak?{' '}
            <a href="#/daftar" className="font-medium text-brand-700 hover:text-brand-900 hover:underline">
              Isi borang pendaftaran
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
