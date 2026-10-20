// Server validation errors, said the way the form says them.
//
// The server's standard checks (missing, blank, too long...) come back in English and without the name of the
// field, so a person at the counter sees "This field may not be blank." and has to guess which one. Here the
// standard checks are put into Malay and given the label the person sees on screen. Messages the system wrote
// itself are already Malay and specific, so they are shown as they are.

const FIELD_LABEL = {
  full_name: 'Nama penuh',
  ic_number: 'No. kad pengenalan / sijil lahir',
  form_level: 'Tingkatan / darjah',
  stream: 'Aliran',
  student_type: 'Jenis pelajar',
  school_name: 'Sekolah',
  phone_number: 'No. telefon pelajar',
  email: 'E-mel pelajar',
  address: 'Alamat',
  parent1_name: 'Nama penjaga',
  parent1_phone: 'No. telefon penjaga',
  parent1_email: 'E-mel penjaga',
  parent1_occupation: 'Pekerjaan penjaga',
  parent2_name: 'Nama penjaga 2',
  parent2_phone: 'No. telefon penjaga 2',
  parent2_email: 'E-mel penjaga 2',
  parent2_occupation: 'Pekerjaan penjaga 2',
  walk_in_description: 'Keterangan walk-in',
  class_ids: 'Kelas',
};

const STANDARD = [
  [/^This field is required\.$/, () => 'wajib diisi'],
  [/^This field may not be (?:blank|null)\.$/, () => 'tidak boleh kosong'],
  [/^Enter a valid email address\.$/, () => 'alamat e-mel tidak sah'],
  [/^Ensure this field has no more than (\d+) characters?\.$/, (_, n) => `terlalu panjang (paling banyak ${n} aksara)`],
  [/^Ensure this field has at least (\d+) characters?\.$/, (_, n) => `terlalu pendek (sekurang-kurangnya ${n} aksara)`],
  [/^A valid integer is required\.$/, () => 'mesti nombor bulat'],
  [/^A valid number is required\.$/, () => 'mesti nombor'],
  [/^Date has wrong format\./, () => 'tarikh tidak sah'],
  [/^"[^"]*" is not a valid choice\.$/, () => 'pilihan tidak sah'],
];

const nameOf = (field) => {
  const label = FIELD_LABEL[field] ?? field.replace(/_/g, ' ');
  return label.charAt(0).toUpperCase() + label.slice(1);
};

function say(field, message) {
  const text = String(message);
  for (const [pattern, words] of STANDARD) {
    const match = text.match(pattern);
    if (match) return `${nameOf(field)}: ${words(...match)}.`;
  }
  return text;
}

// "Nama penuh: wajib diisi. No. telefon penjaga: tidak boleh kosong."
// Reads both shapes the server uses: { field: [messages] } and { errors: { field: [messages] } }.
export function describeError(err, fallback = 'Ralat.') {
  const body = err?.data?.errors && typeof err.data.errors === 'object' ? err.data.errors : err?.data;
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const parts = Object.entries(body).flatMap(([field, messages]) => [].concat(messages).map((m) => say(field, m)));
    if (parts.length) return parts.join(' ');
  }
  return err?.message || fallback;
}
