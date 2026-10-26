import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Copy, Link2, Plus } from 'lucide-react';
import { teacherLinksApi } from '../api/client';
import { describeError } from '../lib/apiErrors';
import { CENTRE } from '../lib/config';
import { cikgu, clock, date, todayISO } from '../lib/format';
import { fillMessage } from '../lib/messages';
import { publicUrl } from '../lib/nav';
import FormModal from './FormModal';
import { Badge, Button, Card, CardHeader, EmptyState, Modal, Table, Td, Th, useToast, WhatsAppIcon } from './ui';
import WhatsAppButton from './WhatsAppButton';

// Teacher private links (Phase F), for Pengurusan: a personal link per teacher, or a general link for applicants.
// What is sent through a link arrives in the Permohonan tab for approval. A link's address is shown only when it is
// made; a lost one is replaced with a new link (which stops the old). Any link can be cancelled at any time.

const STATE = { ACTIVE: { label: 'Aktif', tone: 'green' }, REVOKED: { label: 'Dibatalkan', tone: 'neutral' }, EXPIRED: { label: 'Tamat', tone: 'neutral' } };
const when = (iso) => (iso ? `${date(String(iso).slice(0, 10))} ${clock(iso)}` : '—');

export default function TeacherLinks({ teachers, making, onMade, onCloseMaking }) {
  const notify = useToast();
  const [links, setLinks] = useState(null);
  const [dialog, setDialog] = useState(null); // 'teacher' | 'applicant'
  const [shown, setShown] = useState(null); // a link just made: { link, url }
  const load = useCallback(() => teacherLinksApi.list().then(setLinks).catch(() => setLinks([])), []);
  useEffect(() => { load(); }, [load]);


  const create = async (body) => {
    try {
      const made = await teacherLinksApi.create(body);
      setShown({ link: made, url: publicUrl(`guru/${made.token}`) });
      await load();
      onMade?.();
    } catch (err) {
      notify(describeError(err), 'error');
      throw err;
    }
  };
  const revoke = async (link) => {
    if (!window.confirm(`Batalkan pautan ${link.teacher_name ? cikgu(link.teacher_name) : link.label}? Pautan ini tidak boleh dibuka lagi.`)) return;
    try {
      await teacherLinksApi.revoke(link.id);
      notify('Pautan dibatalkan.', 'info');
      await load();
    } catch (err) {
      notify(describeError(err), 'error');
    }
  };

  const active = (links || []).filter((l) => l.state === 'ACTIVE');
  const old = (links || []).filter((l) => l.state !== 'ACTIVE');
  const closeDialog = () => { setDialog(null); onCloseMaking?.(); };
  // Opened from a teacher's row in the directory, or from the button here
  const forTeacher = making ? { teacher: making } : dialog?.type === 'teacher' ? dialog : null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Pautan guru"
          description="Pautan peribadi untuk guru mengemas kini maklumat sendiri, atau pautan umum untuk pemohon. Maklumat yang dihantar menunggu kelulusan anda di tab Permohonan."
          actions={
            <div className="flex flex-wrap gap-2">
              <Button icon={Plus} onClick={() => setDialog({ type: 'applicant' })}>Pautan pemohon</Button>
              <Button variant="primary" icon={Link2} onClick={() => setDialog({ type: 'teacher' })}>Pautan untuk guru</Button>
            </div>
          }
        />
        {links === null ? <p className="px-5 py-4 text-sm text-gray-500">Memuatkan…</p> : active.length === 0 ? (
          <EmptyState icon={Link2} title="Tiada pautan aktif" description="Buat pautan untuk guru dan hantar melalui WhatsApp." />
        ) : <LinkTable rows={active} onRevoke={revoke} />}
      </Card>
      {old.length > 0 && (
        <Card>
          <CardHeader title="Pautan lama" description="Pautan yang telah dibatalkan, diganti atau tamat." />
          <LinkTable rows={old} />
        </Card>
      )}

      {forTeacher && (
        <FormModal
          title="Pautan untuk guru"
          description="Pautan baharu menggantikan pautan peribadi guru itu yang sedia ada."
          submitLabel="Buat pautan"
          fields={[{ name: 'teacher', label: 'Guru', type: 'select', required: true, options: teachers.filter((t) => t.active).map((t) => ({ value: t.pk, label: `${t.name} (${t.code})` })) }]}
          initial={{ teacher: forTeacher.teacher?.pk ?? '' }}
          onSubmit={(v) => create({ kind: 'TEACHER', teacher: Number(v.teacher) })}
          onClose={closeDialog}
        />
      )}
      {dialog?.type === 'applicant' && (
        <FormModal
          title="Pautan pemohon"
          description="Satu pautan untuk ramai pemohon, cth. dikongsi dalam iklan jawatan. Setiap borang menjadi permohonan guru baharu; kod guru dan kadar ditetapkan semasa meluluskan."
          submitLabel="Buat pautan"
          fields={[
            { name: 'label', label: 'Nama pautan', required: true, hint: 'cth. Pengambilan guru 2027' },
            { name: 'expires_on', label: 'Tamat pada', type: 'date', min: todayISO(), hint: 'Pilihan. Kosongkan untuk tiada tarikh tamat.' },
          ]}
          initial={{ label: '', expires_on: '' }}
          onSubmit={(v) => create({ kind: 'APPLICANT', label: v.label.trim(), expires_on: v.expires_on || null })}
          onClose={closeDialog}
        />
      )}
      {shown && <ShowLink {...shown} teacher={teachers.find((t) => t.pk === shown.link.teacher)} onClose={() => setShown(null)} />}
    </div>
  );
}

function LinkTable({ rows, onRevoke }) {
  return (
    <Table>
      <thead>
        <tr>
          <Th>Pautan</Th><Th className="hidden md:table-cell">Dibuat</Th><Th className="hidden sm:table-cell">Terakhir digunakan</Th><Th>Status</Th>
          {onRevoke && <Th className="text-right">Tindakan</Th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((l) => (
          <tr key={l.id}>
            <Td>
              <p className="font-medium text-gray-900">{l.teacher_name ? `${cikgu(l.teacher_name)} (${l.teacher_code})` : l.label}</p>
              <p className="text-[13px] text-gray-500">
                {l.kind === 'TEACHER' ? 'Peribadi' : 'Pemohon'} · …{l.hint}{l.expires_on ? ` · tamat ${date(l.expires_on)}` : ''}
              </p>
            </Td>
            <Td className="hidden text-[13px] text-gray-600 md:table-cell">{l.created_by}<br />{when(l.created_at)}</Td>
            <Td className="hidden text-[13px] text-gray-600 sm:table-cell">
              {when(l.last_used_at)}
              {l.submissions > 0 && <p>{l.submissions} borang dihantar</p>}
            </Td>
            <Td>
              <Badge tone={STATE[l.state].tone}>{STATE[l.state].label}</Badge>
              {l.waiting && <Badge tone="amber" className="ml-1">Borang menunggu</Badge>}
              {l.revoked_by && <p className="mt-0.5 text-xs text-gray-500">{l.revoked_by}</p>}
            </Td>
            {onRevoke && <Td className="text-right"><Button size="sm" variant="danger" onClick={() => onRevoke(l)}>Batalkan</Button></Td>}
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

function ShowLink({ link, url, teacher, onClose }) {
  const notify = useToast();
  const [qr, setQr] = useState('');
  useEffect(() => {
    QRCode.toDataURL(url, { width: 360, margin: 1, color: { dark: '#133b2c', light: '#ffffff' } }).then(setQr).catch(() => setQr(''));
  }, [url]);
  const copy = () => navigator.clipboard.writeText(url).then(() => notify('Pautan disalin.', 'info'), () => notify('Pautan tidak dapat disalin.', 'error'));
  const message = fillMessage('teacher_link', { teacher: teacher ? `Cikgu ${teacher.name}` : '', centre: CENTRE.name, link: url });
  return (
    <Modal
      open
      onClose={onClose}
      title={link.kind === 'TEACHER' ? `Pautan ${cikgu(link.teacher_name)}` : `Pautan pemohon: ${link.label}`}
      description="Simpan atau hantar sekarang. Pautan penuh hanya dipaparkan sekali; jika hilang, buat pautan baharu."
      footer={
        <>
          <Button onClick={onClose}>Tutup</Button>
          <Button icon={Copy} onClick={copy}>Salin pautan</Button>
          {teacher?.phone && (
            <WhatsAppButton variant="primary" phone={teacher.phone} message={message} recipient={`Cikgu ${teacher.name}`}>
              <WhatsAppIcon className="size-4" /> Hantar melalui WhatsApp
            </WhatsAppButton>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <p className="break-all rounded-md bg-gray-50 px-3 py-2 font-mono text-[13px] text-gray-800">{url}</p>
        {qr && <img src={qr} alt="Kod QR pautan" className="mx-auto size-48 rounded-md border border-gray-200" />}
      </div>
    </Modal>
  );
}
