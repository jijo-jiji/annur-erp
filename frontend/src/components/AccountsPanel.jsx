import { useCallback, useEffect, useState } from 'react';
import { Copy, Plus } from 'lucide-react';
import { accountsApi, staffApi } from '../api/client';
import { date } from '../lib/format';
import FormModal from './FormModal';
import { Badge, Button, Card, CardHeader, EmptyState, Modal, Table, Td, Th, useToast } from './ui';

const ROLES = [{ value: 'ADMIN', label: 'Admin' }, { value: 'SUPERVISOR', label: 'Supervisor' }, { value: 'MANAGEMENT', label: 'Management' }];
const ROLE_TONE = { ADMIN: 'neutral', SUPERVISOR: 'blue', MANAGEMENT: 'green' };
const PASSWORD_HINT = 'Kosongkan untuk menjana kata laluan sementara. Pengguna mesti menukarnya semasa log masuk pertama (sekurang-kurangnya 10 aksara).';

const when = (iso) => (iso ? `${date(String(iso).slice(0, 10))} ${new Date(iso).toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' })}` : '');

// Login accounts (Management only). Accounts are switched off, never deleted, so records keep their names.
export default function AccountsPanel() {
  const notify = useToast();
  const [accounts, setAccounts] = useState([]);
  const [events, setEvents] = useState([]);
  const [staff, setStaff] = useState([]);
  const [dialog, setDialog] = useState(null); // { type: 'add' } | { type: 'edit' | 'reset' | 'active', account }
  const [shown, setShown] = useState(null); // { username, password } to hand over, once

  const load = useCallback(() => Promise.all([accountsApi.list(), accountsApi.events(), staffApi.getStaff()])
    .then(([a, e, s]) => { setAccounts(a); setEvents(e); setStaff(s); })
    .catch(() => notify('Gagal memuat senarai akaun.', 'error')), [notify]);
  useEffect(() => { load(); }, [load]);

  const staffOptions = (account) => staff
    .filter((s) => !s.user || s.user === account?.id)
    .map((s) => ({ value: String(s.id), label: `${s.name} (${s.staff_id})` }));
  const errorText = (err) => (err?.data && typeof err.data === 'object' ? Object.values(err.data).flat().join(' ') : '') || err?.message || 'Ralat.';

  // Runs a call; a failure is shown and re-thrown so the dialog stays open
  const run = async (call, message) => {
    try {
      const done = await call();
      await load();
      if (message) notify(message);
      return done;
    } catch (err) {
      notify(errorText(err), 'error');
      throw err;
    }
  };
  const handOver = (done) => { if (done?.temporary_password) setShown({ username: done.username, password: done.temporary_password }); };

  const active = accounts.filter((a) => a.is_active).length;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Akaun pengguna"
          description={`${active} akaun aktif. Hanya Pengurusan boleh membuat akaun, menukar peranan dan menetapkan semula kata laluan. Akaun tidak dipadam, hanya dinyahaktifkan.`}
          actions={<Button size="sm" variant="primary" icon={Plus} onClick={() => setDialog({ type: 'add' })}>Akaun baharu</Button>}
        />
        {accounts.length === 0 ? <EmptyState title="Tiada akaun" /> : (
          <Table>
            <thead>
              <tr>
                <Th>Pengguna</Th>
                <Th>Peranan</Th>
                <Th className="hidden md:table-cell">Staf</Th>
                <Th className="hidden lg:table-cell">Log masuk terakhir</Th>
                <Th>Status</Th>
                <Th className="text-right"><span className="sr-only">Tindakan</span></Th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id} className={a.is_active ? '' : 'text-gray-400'}>
                  <Td>
                    <p className={`font-medium ${a.is_active ? 'text-gray-900' : ''}`}>{a.full_name}{a.is_self && <span className="ml-1.5 text-[13px] font-normal text-gray-500">(anda)</span>}</p>
                    <p className="text-[13px] text-gray-500">{a.username}</p>
                  </Td>
                  <Td>{a.role ? <Badge tone={ROLE_TONE[a.role]}>{ROLES.find((r) => r.value === a.role)?.label}</Badge> : <Badge tone="amber">Tiada peranan</Badge>}{a.is_superuser && <Badge className="ml-1.5">Pentadbir sistem</Badge>}</Td>
                  <Td className="hidden md:table-cell">{a.staff ? a.staff.name : '—'}</Td>
                  <Td className="hidden whitespace-nowrap lg:table-cell">{a.last_login ? when(a.last_login) : 'Belum pernah'}</Td>
                  <Td>
                    {!a.is_active ? <Badge>Tidak aktif</Badge> : a.must_change_password ? <Badge tone="amber">Kata laluan sementara</Badge> : <Badge tone="green">Aktif</Badge>}
                  </Td>
                  <Td className="text-right">
                    {a.is_superuser ? <span className="text-[13px] text-gray-400">Diurus oleh pembangun</span> : (
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" variant="ghost" onClick={() => setDialog({ type: 'edit', account: a })}>Ubah</Button>
                        {!a.is_self && <Button size="sm" variant="ghost" onClick={() => setDialog({ type: 'reset', account: a })}>Set semula kata laluan</Button>}
                        {!a.is_self && <Button size="sm" variant="ghost" onClick={() => setDialog({ type: 'active', account: a })}>{a.is_active ? 'Nyahaktif' : 'Aktifkan'}</Button>}
                      </div>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader title="Sejarah akaun" description="Siapa mengubah akaun apa, dan bila." />
        {events.length === 0 ? <EmptyState title="Belum ada rekod" /> : (
          <ul className="divide-y divide-gray-100">
            {events.slice(0, 20).map((e) => (
              <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-2.5 text-sm">
                <span><span className="font-medium text-gray-900">{e.username}</span> · {e.action_label}{e.detail && <span className="text-gray-600">: {e.detail}</span>}</span>
                <span className="text-xs text-gray-500">{e.by ? `oleh ${e.by} · ` : ''}{when(e.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {dialog?.type === 'add' && (
        <FormModal
          title="Akaun baharu"
          description="Akaun ini boleh log masuk serta-merta dengan kata laluan sementara."
          submitLabel="Buat akaun"
          initial={{ username: '', full_name: '', role: '', staff: '', password: '' }}
          fields={[
            { name: 'username', label: 'Nama pengguna', required: true, hint: 'Huruf kecil, nombor, titik atau garis bawah (3 hingga 30 aksara), cth. aina.r' },
            { name: 'full_name', label: 'Nama penuh', required: true },
            { name: 'role', label: 'Peranan', type: 'select', required: true, options: ROLES },
            { name: 'staff', label: 'Pautkan kepada staf', type: 'select', placeholder: 'Tiada (pilihan)', options: staffOptions(), hint: 'Untuk rekod kehadiran dan cuti staf sendiri.' },
            { name: 'password', label: 'Kata laluan sementara', type: 'password', hint: PASSWORD_HINT },
          ]}
          onSubmit={async (v) => handOver(await run(() => accountsApi.create({ ...v, staff: v.staff || null }), 'Akaun dibuat.'))}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'edit' && (
        <FormModal
          title={`Ubah ${dialog.account.username}`}
          description={dialog.account.is_self ? 'Anda tidak boleh mengubah peranan akaun anda sendiri.' : 'Peranan baharu berkuat kuasa pada permintaan seterusnya oleh pengguna ini.'}
          initial={{ full_name: dialog.account.full_name, role: dialog.account.role || '', staff: dialog.account.staff ? String(dialog.account.staff.id) : '' }}
          fields={[
            { name: 'full_name', label: 'Nama penuh', required: true },
            { name: 'role', label: 'Peranan', type: 'select', required: true, options: dialog.account.is_self ? ROLES.filter((r) => r.value === dialog.account.role) : ROLES },
            { name: 'staff', label: 'Pautkan kepada staf', type: 'select', placeholder: 'Tiada', options: staffOptions(dialog.account) },
          ]}
          onSubmit={(v) => run(() => accountsApi.update(dialog.account.id, { full_name: v.full_name, role: v.role, staff: v.staff || null }), 'Akaun dikemas kini.')}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'reset' && (
        <FormModal
          title={`Set semula kata laluan: ${dialog.account.username}`}
          description="Pengguna dilog keluar dari semua peranti dan mesti memilih kata laluan baharu semasa log masuk."
          submitLabel="Set semula"
          initial={{ password: '' }}
          fields={[{ name: 'password', label: 'Kata laluan sementara', type: 'password', hint: PASSWORD_HINT }]}
          onSubmit={async (v) => handOver(await run(() => accountsApi.resetPassword(dialog.account.id, v.password), 'Kata laluan ditetapkan semula.'))}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'active' && (
        <FormModal
          title={`${dialog.account.is_active ? 'Nyahaktifkan' : 'Aktifkan semula'} ${dialog.account.username}`}
          description={dialog.account.is_active ? 'Pengguna dilog keluar serta-merta dan tidak boleh log masuk. Rekod mereka kekal.' : 'Pengguna boleh log masuk semula dengan kata laluan sedia ada.'}
          danger={dialog.account.is_active}
          submitLabel={dialog.account.is_active ? 'Nyahaktifkan' : 'Aktifkan'}
          fields={[]}
          onSubmit={() => run(() => accountsApi.update(dialog.account.id, { is_active: !dialog.account.is_active }), dialog.account.is_active ? 'Akaun dinyahaktifkan.' : 'Akaun diaktifkan.')}
          onClose={() => setDialog(null)}
        />
      )}

      <Modal
        open={Boolean(shown)}
        onClose={() => setShown(null)}
        title="Kata laluan sementara"
        description="Beri maklumat ini kepada pengguna. Kata laluan hanya dipaparkan sekali dan tidak disimpan di mana-mana."
        size="sm"
        footer={<Button variant="primary" onClick={() => setShown(null)}>Selesai</Button>}
      >
        {shown && (
          <div className="space-y-3 text-sm">
            <div className="rounded-md bg-gray-50 p-4">
              <p className="text-gray-500">Nama pengguna</p>
              <p className="font-mono text-base text-gray-900">{shown.username}</p>
              <p className="mt-3 text-gray-500">Kata laluan sementara</p>
              <p className="font-mono text-base text-gray-900">{shown.password}</p>
            </div>
            <Button icon={Copy} onClick={() => navigator.clipboard?.writeText(`${shown.username} / ${shown.password}`).then(() => notify('Disalin.'), () => notify('Tidak dapat menyalin. Salin secara manual.', 'error'))}>Salin</Button>
            <p className="text-[13px] text-gray-600">Pengguna akan diminta memilih kata laluan sendiri semasa log masuk pertama.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
