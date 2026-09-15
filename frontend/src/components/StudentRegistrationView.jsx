import React, { useState } from 'react';
import { UserPlus, Search, Check, Phone, MessageSquare } from 'lucide-react';

export default function StudentRegistrationView() {
  const [activeTab, setActiveTab] = useState('list');
  const [students, setStudents] = useState([
    {
      id: 1,
      student_id: "AN-2026-001",
      full_name: "Ahmad Daniyal bin Razali",
      ic_number: "090514-03-5511",
      form_level: "F5",
      stream: "SAINS",
      school_name: "SMK Telipot",
      phone_number: "011-23456781",
      parent1_name: "Razali bin Mahmud",
      parent1_phone: "012-9876541",
      preferred_contact: "PARENT_1",
      checklist_ledger: true,
      checklist_whatsapp: true,
      checklist_senarai_pelajar: true,
      checklist_kedatangan: true,
      checklist_sistem_pembayaran: true,
      status: "ACTIVE"
    },
    {
      id: 2,
      student_id: "AN-2026-002",
      full_name: "Nur Aisyah binti Mohd Zaki",
      ic_number: "090822-03-6622",
      form_level: "F5",
      stream: "SAINS",
      school_name: "SMK Zainab 1",
      phone_number: "011-23456782",
      parent1_name: "Mohd Zaki bin Salleh",
      parent1_phone: "012-9876542",
      preferred_contact: "PARENT_1",
      checklist_ledger: true,
      checklist_whatsapp: true,
      checklist_senarai_pelajar: true,
      checklist_kedatangan: true,
      checklist_sistem_pembayaran: true,
      status: "ACTIVE"
    },
    {
      id: 3,
      student_id: "AN-2026-003",
      full_name: "Muhammad Haziq bin Imran",
      ic_number: "100311-03-7733",
      form_level: "F4",
      stream: "SAINS",
      school_name: "SMK Sultan Ismail",
      phone_number: "011-23456783",
      parent1_name: "Imran bin Abdullah",
      parent1_phone: "012-9876543",
      preferred_contact: "PARENT_1",
      checklist_ledger: true,
      checklist_whatsapp: true,
      checklist_senarai_pelajar: true,
      checklist_kedatangan: true,
      checklist_sistem_pembayaran: false,
      status: "ACTIVE"
    }
  ]);

  const [formData, setFormData] = useState({
    full_name: '',
    ic_number: '',
    form_level: 'F5',
    stream: 'SAINS',
    school_name: '',
    phone_number: '',
    email: '',
    address: '',
    student_type: 'MONTHLY',
    lead_source: 'BANNER',
    parent1_name: '',
    parent1_phone: '',
    parent1_occupation: '',
    parent1_relation: 'Bapa',
    parent2_name: '',
    parent2_phone: '',
    parent2_occupation: '',
    parent2_relation: 'Ibu',
    preferred_contact: 'PARENT_1',
    selected_subjects: ['FZ', 'KIM', 'BIO', 'ADDMT'],
    agree_terms: true,
    saps_consent: true,
  });

  const [filterSearch, setFilterSearch] = useState('');

  const subjectOptions = [
    { code: 'FZ', name: 'Fizik', seats: '16/20', isFull: false },
    { code: 'KIM', name: 'Kimia', seats: '19/20', isFull: false },
    { code: 'BIO', name: 'Biologi', seats: '18/20', isFull: false },
    { code: 'ADDMT', name: 'Add Math', seats: '21/20', isOver: true },
    { code: 'BI', name: 'Bahasa Inggeris', seats: '17/20', isFull: false },
    { code: 'BM', name: 'Bahasa Melayu', seats: '19/20', isFull: false },
    { code: 'MATH', name: 'Matematik', seats: '20/20', isFull: true },
    { code: 'SAINS', name: 'Sains', seats: '18/20', isFull: false },
    { code: 'SEJ', name: 'Sejarah', seats: '19/20', isFull: false },
    { code: 'ACC', name: 'Prinsip Perakaunan', seats: '14/20', isFull: false },
  ];

  const toggleSubject = (code) => {
    if (formData.selected_subjects.includes(code)) {
      setFormData({ ...formData, selected_subjects: formData.selected_subjects.filter((s) => s !== code) });
    } else {
      setFormData({ ...formData, selected_subjects: [...formData.selected_subjects, code] });
    }
  };

  const handleToggleChecklist = (studentId, key) => {
    setStudents(
      students.map((s) => (s.id === studentId ? { ...s, [key]: !s[key] } : s))
    );
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (formData.selected_subjects.length < 4 && formData.form_level.startsWith('F')) {
      alert("Pilihan Minimum: 4 Subjek bagi Sekolah Menengah!");
      return;
    }
    const newId = `AN-2026-${String(students.length + 1).padStart(3, '0')}`;
    const newStudent = {
      id: students.length + 1,
      student_id: newId,
      full_name: formData.full_name,
      ic_number: formData.ic_number,
      form_level: formData.form_level,
      stream: formData.stream,
      school_name: formData.school_name,
      phone_number: formData.phone_number,
      parent1_name: formData.parent1_name,
      parent1_phone: formData.parent1_phone,
      preferred_contact: formData.preferred_contact,
      checklist_ledger: true,
      checklist_whatsapp: true,
      checklist_senarai_pelajar: true,
      checklist_kedatangan: true,
      checklist_sistem_pembayaran: true,
      status: "ACTIVE"
    };
    setStudents([newStudent, ...students]);
    setActiveTab('list');
    alert(`Pendaftaran Pelajar ${formData.full_name} berjaya! ID: ${newId}. Invois RM270 dijana secara automatik.`);
  };

  return (
    <div className="space-y-6">
      {/* Header with Sub-tabs */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Modul Pendaftaran & Direktori Pelajar</h2>
          <p className="text-xs text-slate-500">
            Borang Pendaftaran Rasmi, Kebenaran SAPS MOE, 5-Poin Kegunaan Pejabat (L, TEL, SP, AT, SY)
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('list')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition ${
              activeTab === 'list'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            Senarai Pelajar ({students.length})
          </button>
          <button
            onClick={() => setActiveTab('form')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition ${
              activeTab === 'form'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            + Borang Pendaftaran Baru
          </button>
        </div>
      </div>

      {activeTab === 'list' ? (
        /* Student Directory Table with 5-Point Office Checklist */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Cari nama pelajar, no K/P, atau sekolah..."
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                className="w-full text-xs pl-9 pr-4 py-2 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none"
              />
            </div>
            <div className="text-xs text-slate-500 font-medium">
              Checklist: <span className="font-bold text-slate-700">L</span> (Ledger), <span className="font-bold text-slate-700">TEL</span> (WhatsApp), <span className="font-bold text-slate-700">SP</span> (Senarai Pelajar), <span className="font-bold text-slate-700">AT</span> (Kedatangan), <span className="font-bold text-slate-700">SY</span> (Sistem Yuran)
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-semibold text-[11px]">
                <tr>
                  <th className="py-3.5 px-4">ID Pelajar</th>
                  <th className="py-3.5 px-4">Nama Pelajar</th>
                  <th className="py-3.5 px-4">Tingkatan / Aliran</th>
                  <th className="py-3.5 px-4">Sekolah</th>
                  <th className="py-3.5 px-4">Penjaga & Tel</th>
                  <th className="py-3.5 px-4 text-center">Kegunaan Pejabat (Checklist)</th>
                  <th className="py-3.5 px-4 text-right">Tindakan Cepat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {students
                  .filter((s) => s.full_name.toLowerCase().includes(filterSearch.toLowerCase()) || s.student_id.includes(filterSearch))
                  .map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-3 px-4 font-bold text-indigo-600">{s.student_id}</td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{s.full_name}</div>
                        <div className="text-slate-400 text-[10px]">{s.ic_number}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-bold text-[10px]">
                          {s.form_level}
                        </span>
                        <span className="ml-1 text-slate-500 font-medium">({s.stream})</span>
                      </td>
                      <td className="py-3 px-4 text-slate-600">{s.school_name}</td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-800">{s.parent1_name}</div>
                        <div className="text-slate-500 text-[11px]">{s.parent1_phone}</div>
                      </td>
                      {/* 5-Point Office Checklist Badges (Interactive) */}
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-center gap-1.5">
                          {[
                            { key: 'checklist_ledger', label: 'L' },
                            { key: 'checklist_whatsapp', label: 'TEL' },
                            { key: 'checklist_senarai_pelajar', label: 'SP' },
                            { key: 'checklist_kedatangan', label: 'AT' },
                            { key: 'checklist_sistem_pembayaran', label: 'SY' }
                          ].map((ck) => (
                            <button
                              key={ck.key}
                              title={`Togol status ${ck.label}`}
                              onClick={() => handleToggleChecklist(s.id, ck.key)}
                              className={`w-7 h-6 rounded-md font-bold text-[10px] flex items-center justify-center transition border ${
                                s[ck.key]
                                  ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                                  : 'bg-slate-100 text-slate-400 border-slate-200 hover:bg-slate-200'
                              }`}
                            >
                              {ck.label}
                            </button>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <a
                            href={`https://wa.me/60${s.parent1_phone.replace(/[^0-9]/g, '').replace(/^0/, '')}?text=Assalamualaikum%20${encodeURIComponent(s.parent1_name)},%20makluman%20dari%20Pusat%20Tuisyen%20An%20Nur%20Telipot%20mengenai%20${encodeURIComponent(s.full_name)}.`}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1.5 rounded-lg bg-emerald-50 text-[#25D366] hover:bg-emerald-100 transition border border-emerald-200"
                            title="Hantar WhatsApp"
                          >
                            <MessageSquare className="w-4 h-4" />
                          </a>
                          <a
                            href={`tel:${s.parent1_phone}`}
                            className="p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition border border-blue-200"
                            title="Panggilan Terus"
                          >
                            <Phone className="w-4 h-4" />
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Full Registration Form Matching Borang Pendaftaran PDF */
        <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl mx-auto">
          {/* Section 1: Maklumat Pelajar */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-indigo-600" /> 1. Maklumat Pelajar
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nama Penuh Pelajar *</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Muhammad Danial bin Farhan"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">No. Kad Pengenalan / Surat Beranak *</label>
                <input
                  type="text"
                  required
                  placeholder="090101-03-XXXX"
                  value={formData.ic_number}
                  onChange={(e) => setFormData({ ...formData, ic_number: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Tingkatan / Darjah *</label>
                <select
                  value={formData.form_level}
                  onChange={(e) => setFormData({ ...formData, form_level: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none bg-white font-medium"
                >
                  <option value="F5">Tingkatan 5 (SPM)</option>
                  <option value="F4">Tingkatan 4</option>
                  <option value="F3">Tingkatan 3</option>
                  <option value="F2">Tingkatan 2</option>
                  <option value="F1">Tingkatan 1</option>
                  <option value="S6">Darjah 6</option>
                  <option value="S5">Darjah 5</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Aliran *</label>
                <select
                  value={formData.stream}
                  onChange={(e) => setFormData({ ...formData, stream: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none bg-white font-medium"
                >
                  <option value="SAINS">Sains Tulen</option>
                  <option value="SASTERA">Sastera / Perniagaan / Akaun</option>
                  <option value="GENERAL">Umum (Ting 1-3 & Rendah)</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nama Sekolah Asal *</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: SMK Telipot / SMK Sultan Ismail"
                  value={formData.school_name}
                  onChange={(e) => setFormData({ ...formData, school_name: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">No. Telefon Pelajar (HP)</label>
                <input
                  type="text"
                  placeholder="011-XXXXXXXX"
                  value={formData.phone_number}
                  onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block font-semibold text-slate-700 mb-1">Alamat Kediaman Penuh</label>
                <textarea
                  rows="2"
                  placeholder="Alamat rumah..."
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 outline-none"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Maklumat Ibu Bapa / Penjaga */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
              2. Maklumat Ibu Bapa / Penjaga (2 Penjaga)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800">Penjaga 1 (Bapa)</span>
                  <label className="flex items-center gap-1.5 cursor-pointer text-indigo-700 font-semibold">
                    <input
                      type="radio"
                      name="preferred"
                      checked={formData.preferred_contact === 'PARENT_1'}
                      onChange={() => setFormData({ ...formData, preferred_contact: 'PARENT_1' })}
                    />
                    Hubungi Utama (WhatsApp)
                  </label>
                </div>
                <div>
                  <label className="block font-medium text-slate-600 mb-1">Nama Bapa / Penjaga *</label>
                  <input
                    type="text"
                    required
                    placeholder="Nama bapa"
                    value={formData.parent1_name}
                    onChange={(e) => setFormData({ ...formData, parent1_name: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-600 mb-1">No. Telefon WhatsApp *</label>
                  <input
                    type="text"
                    required
                    placeholder="012-XXXXXXX"
                    value={formData.parent1_phone}
                    onChange={(e) => setFormData({ ...formData, parent1_phone: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-600 mb-1">Pekerjaan</label>
                  <input
                    type="text"
                    placeholder="Pekerjaan"
                    value={formData.parent1_occupation}
                    onChange={(e) => setFormData({ ...formData, parent1_occupation: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white"
                  />
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800">Penjaga 2 (Ibu)</span>
                  <label className="flex items-center gap-1.5 cursor-pointer text-indigo-700 font-semibold">
                    <input
                      type="radio"
                      name="preferred"
                      checked={formData.preferred_contact === 'PARENT_2'}
                      onChange={() => setFormData({ ...formData, preferred_contact: 'PARENT_2' })}
                    />
                    Hubungi Utama (WhatsApp)
                  </label>
                </div>
                <div>
                  <label className="block font-medium text-slate-600 mb-1">Nama Ibu</label>
                  <input
                    type="text"
                    placeholder="Nama ibu"
                    value={formData.parent2_name}
                    onChange={(e) => setFormData({ ...formData, parent2_name: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-600 mb-1">No. Telefon Ibu</label>
                  <input
                    type="text"
                    placeholder="013-XXXXXXX"
                    value={formData.parent2_phone}
                    onChange={(e) => setFormData({ ...formData, parent2_phone: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-600 mb-1">Pekerjaan Ibu</label>
                  <input
                    type="text"
                    placeholder="Pekerjaan"
                    value={formData.parent2_occupation}
                    onChange={(e) => setFormData({ ...formData, parent2_occupation: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Pemilihan Subjek & Kapasiti Kerusi Langsung */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900">3. Pemilihan Subjek (Minima 4 Subjek Menengah)</h3>
                <p className="text-xs text-slate-500">Pakej Yuran: 4 Sub = RM240, 5 Sub = RM275, 6 Sub = RM330, 7 Sub = RM350, 8 Sub = RM400</p>
              </div>
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-indigo-50 text-indigo-700">
                {formData.selected_subjects.length} Subjek Dipilih
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {subjectOptions.map((sub) => {
                const isSelected = formData.selected_subjects.includes(sub.code);
                return (
                  <button
                    type="button"
                    key={sub.code}
                    onClick={() => toggleSubject(sub.code)}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      isSelected
                        ? 'bg-indigo-600 text-white border-indigo-700 shadow-sm ring-2 ring-indigo-200'
                        : 'bg-white text-slate-800 border-slate-200 hover:border-indigo-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-sm">{sub.code}</span>
                      {isSelected && <Check className="w-4 h-4 text-white" />}
                    </div>
                    <div className={`text-[11px] truncate ${isSelected ? 'text-indigo-100' : 'text-slate-500'}`}>
                      {sub.name}
                    </div>
                    <div className="mt-2 pt-1.5 border-t border-slate-100/30 flex items-center justify-between text-[10px]">
                      <span className={isSelected ? 'text-indigo-200' : 'text-slate-400'}>Kerusi:</span>
                      <span
                        className={`font-bold px-1.5 py-0.5 rounded ${
                          sub.isOver
                            ? 'bg-rose-500 text-white'
                            : sub.isFull
                            ? 'bg-amber-500 text-white'
                            : isSelected
                            ? 'bg-indigo-700 text-indigo-100'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {sub.isOver ? '-1 (Lebih)' : sub.seats}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 4: Persetujuan SAPS MOE & Syarat Peraturan */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-3 text-xs text-slate-700">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
              4. Perakuan Pelajar & Syarat Kontrak Ibu Bapa (Borang Pendaftaran MS 2)
            </h3>
            <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.saps_consent}
                onChange={(e) => setFormData({ ...formData, saps_consent: e.target.checked })}
                className="mt-0.5"
              />
              <span>
                <strong>Kebenaran Semakan SAPS:</strong> Saya membenarkan pihak tuisyen menyemak keputusan peperiksaan saya di laman sesawang <code>sapsnkra.moe</code> bertujuan memantau prestasi akademik.
              </span>
            </label>
            <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.agree_terms}
                onChange={(e) => setFormData({ ...formData, agree_terms: e.target.checked })}
                className="mt-0.5"
              />
              <span>
                <strong>Syarat Pembayaran & Peraturan:</strong> Bersetuju menjelaskan yuran sebelum <strong>7hb setiap bulan</strong>, maklumkan notis berhenti 2 minggu awal, dan mematuhi polisi penamatan jika yuran tertunggak 2 bulan tanpa makluman.
              </span>
            </label>
          </div>

          {/* Submit Action */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setActiveTab('list')}
              className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold text-xs hover:bg-slate-50"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-700 shadow-sm"
            >
              Daftar Pelajar & Jana Invois Rasmi
            </button>
          </div>
        </form>
      )}
    </div>
  );
}