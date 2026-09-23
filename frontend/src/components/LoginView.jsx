import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { CENTRE } from '../data/demo';
import { ROLE_LABEL } from '../lib/format';
import { Button, Input, Select } from './ui';
import { BrandMark } from './Sidebar';

const DEMO_USERS = {
  ADMIN: 'admin.kaunter',
  SUPERVISOR: 'supervisor.akademik',
  MANAGEMENT: 'pengarah',
  TEACHER: 'cikgu.zakir',
  PARENT: 'ibubapa.daniyal',
};

export default function LoginView({ onLogin }) {
  const [role, setRole] = useState('ADMIN');
  const [username, setUsername] = useState(DEMO_USERS.ADMIN);
  const [password, setPassword] = useState('');

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
            Sistem pengurusan dalaman untuk kaunter, supervisor akademik dan pengurusan Cawangan {CENTRE.branch}.
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

          <form
            className="mt-8 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              onLogin(role);
            }}
          >
            <Select
              label="Peranan"
              value={role}
              onChange={(e) => {
                setRole(e.target.value);
                setUsername(DEMO_USERS[e.target.value]);
              }}
            >
              {Object.entries(ROLE_LABEL).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </Select>
            <Input label="Nama pengguna" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
            <Input
              label="Kata laluan"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              hint="Versi demo: sebarang kata laluan diterima."
            />
            <Button type="submit" variant="primary" size="lg" className="w-full">
              Log masuk <ArrowRight className="size-4" />
            </Button>
          </form>

          <p className="mt-8 border-t border-gray-200 pt-6 text-sm text-gray-600">
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
