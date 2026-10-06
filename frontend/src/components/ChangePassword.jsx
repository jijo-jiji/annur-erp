import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { CENTRE } from '../lib/config';
import { Button, Input, Modal } from './ui';
import { BrandMark } from './Sidebar';

const RULE = 'Sekurang-kurangnya 10 aksara. Elakkan kata laluan yang mudah diteka atau nombor sahaja.';

// The form to choose a new password; the server checks the rules and says what is wrong
function PasswordForm({ onSubmit, onDone, formId = 'password-form' }) {
  const [f, setF] = useState({ old: '', next: '', again: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (f.next !== f.again) {
      setErrors({ again: 'Kata laluan baharu tidak sepadan.' });
      return;
    }
    setBusy(true);
    setErrors({});
    try {
      await onSubmit(f.old, f.next);
      onDone?.();
    } catch (err) {
      const data = err?.data && typeof err.data === 'object' ? err.data : {};
      setErrors({
        old: data.old_password?.join(' '), next: data.new_password?.join(' '),
        form: !data.old_password && !data.new_password ? (data.detail || err.message || 'Tidak dapat menukar kata laluan.') : '',
      });
      setBusy(false);
    }
  };

  return (
    <form id={formId} onSubmit={submit} className="space-y-4">
      <Input label="Kata laluan semasa" type="password" required autoComplete="current-password" value={f.old} error={errors.old} onChange={(e) => setF({ ...f, old: e.target.value })} />
      <Input label="Kata laluan baharu" type="password" required autoComplete="new-password" value={f.next} error={errors.next} hint={RULE} onChange={(e) => setF({ ...f, next: e.target.value })} />
      <Input label="Ulang kata laluan baharu" type="password" required autoComplete="new-password" value={f.again} error={errors.again} onChange={(e) => setF({ ...f, again: e.target.value })} />
      {errors.form && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">{errors.form}</p>}
      <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>{busy ? 'Menyimpan…' : 'Tukar kata laluan'}</Button>
    </form>
  );
}

// Shown instead of the app until a temporary password (set by Management) has been replaced
export function ForcedPasswordChange({ user, onChange, onLogout }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-white px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <BrandMark />
          <span className="font-semibold text-gray-900">{CENTRE.name}</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Pilih kata laluan baharu</h1>
        <p className="mt-1 text-sm text-gray-600">
          Salam {user.full_name || user.username}. Kata laluan anda ditetapkan oleh Pengurusan dan hanya sementara. Pilih kata laluan sendiri untuk meneruskan.
        </p>
        <div className="mt-8">
          <PasswordForm onSubmit={onChange} />
        </div>
        <button type="button" onClick={onLogout} className="mt-6 inline-flex items-center gap-1.5 text-[13px] text-gray-500 hover:text-gray-900">
          <LogOut className="size-3.5" /> Log keluar
        </button>
      </div>
    </main>
  );
}

// Anyone can change their own password from the menu
export function ChangePasswordModal({ onChange, onClose, onDone }) {
  return (
    <Modal open onClose={onClose} title="Tukar kata laluan" description="Anda akan kekal log masuk di peranti ini; sesi di peranti lain ditamatkan.">
      <PasswordForm onSubmit={onChange} onDone={() => { onDone?.(); onClose(); }} />
    </Modal>
  );
}
