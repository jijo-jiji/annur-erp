import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { schoolCategory } from '../lib/domain';
import { useStore } from '../store';
import SchoolPicker from './SchoolPicker';
import { Button, Input, Modal, Textarea } from './ui';

// The details a registration needs, so the counter can complete a record that came in half-filled
// (a QR form, an old record) before the Supervisor is asked to approve it.
export default function StudentDetailsModal({ student, onClose, onSaved }) {
  const store = useStore();
  const { getMasterOptions } = useApp();
  const schools = getMasterOptions('6_school');
  const s = student;
  const [f, setF] = useState({
    full_name: s.name || '', ic_number: s.ic || '', school_name: s.school || '', phone_number: s.phone || '', email: s.email || '', address: s.address || '',
    parent1_name: s.parent1?.name || '', parent1_phone: s.parent1?.phone || '', parent1_email: s.parent1?.email || '',
    parent2_name: s.parent2?.name || '', parent2_phone: s.parent2?.phone || '',
    walk_in_description: s.walkIn?.description || '',
  });
  const [busy, setBusy] = useState(false);
  const set = (patch) => setF((prev) => ({ ...prev, ...patch }));
  const walkIn = s.type === 'WALK_IN';

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const school = schools.find((x) => x.label === f.school_name);
      await store.updateStudent(s.id, {
        ...f,
        // the school's category and code follow the school chosen
        school_category: school ? schoolCategory(school) : s.schoolCategory || '',
        school_code: school?.meta?.kod || '',
      });
      onSaved?.();
      onClose();
    } catch {
      setBusy(false); // the store has already said what was wrong
    }
  };

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title="Ubah maklumat pelajar"
      description="Lengkapkan atau betulkan maklumat. Pilihan kelas ditetapkan dalam tab Kelas."
      footer={
        <>
          <Button onClick={onClose}>Batal</Button>
          <Button type="submit" form="student-details" variant="primary" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</Button>
        </>
      }
    >
      <form id="student-details" onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Nama penuh" required className="sm:col-span-2" value={f.full_name} onChange={(e) => set({ full_name: e.target.value })} />
          <Input label="No. kad pengenalan / sijil lahir" required value={f.ic_number} onChange={(e) => set({ ic_number: e.target.value })} placeholder="090101-03-1234" />
          <SchoolPicker value={f.school_name} onChange={(school_name) => set({ school_name })} schools={schools} required />
          <Input label="No. telefon pelajar" type="tel" value={f.phone_number} onChange={(e) => set({ phone_number: e.target.value })} placeholder="Jika ada" />
          <Input label="E-mel pelajar" type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} placeholder="Jika ada" />
          <Textarea label="Alamat rumah" className="sm:col-span-2" rows={2} value={f.address} onChange={(e) => set({ address: e.target.value })} />
        </div>
        <fieldset className="space-y-3 rounded-md border border-gray-200 p-4">
          <legend className="px-1 text-[13px] font-medium text-gray-700">Penjaga 1 (hubungan utama)</legend>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="Nama penjaga" required value={f.parent1_name} onChange={(e) => set({ parent1_name: e.target.value })} />
            <Input label="No. telefon penjaga (WhatsApp)" type="tel" required value={f.parent1_phone} onChange={(e) => set({ parent1_phone: e.target.value })} />
            <Input label="E-mel penjaga" type="email" value={f.parent1_email} onChange={(e) => set({ parent1_email: e.target.value })} />
          </div>
        </fieldset>
        <fieldset className="space-y-3 rounded-md border border-gray-200 p-4">
          <legend className="px-1 text-[13px] font-medium text-gray-700">Penjaga 2 (jika ada)</legend>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="Nama penjaga 2" value={f.parent2_name} onChange={(e) => set({ parent2_name: e.target.value })} />
            <Input label="No. telefon penjaga 2" type="tel" value={f.parent2_phone} onChange={(e) => set({ parent2_phone: e.target.value })} />
          </div>
        </fieldset>
        {walkIn && (
          <Textarea label="Keterangan walk-in" required rows={2} value={f.walk_in_description} onChange={(e) => set({ walk_in_description: e.target.value })} />
        )}
      </form>
    </Modal>
  );
}
