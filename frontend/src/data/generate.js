// Builds the full demo dataset (≈200 students with Jan–Mar 2026 history) from the
// configuration in demo.js. A fixed seed keeps the numbers identical every time.
import {
  CLASS_ROWS, DAYS, DEMO_TODAY, DISCOUNTS, EXAMS, HISTORY_MONTHS, PRICING_TIERS, ROOMS, SETTINGS, SUBJECTS, TEACHERS,
} from './demo';

function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let rand = rng(20260313);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const int = (min, max) => min + Math.floor(rand() * (max - min + 1));
const chance = (p) => rand() < p;
const pad = (n, w = 2) => String(n).padStart(w, '0');
const gauss = () => (rand() + rand() + rand() + rand() - 2) / 0.58; // ≈ N(0,1)

const MALE = ['Ahmad', 'Muhammad', 'Muhammad Amir', 'Adam', 'Aiman', 'Haziq', 'Irfan', 'Danish', 'Hakimi', 'Luqman', 'Amirul', 'Syafiq', 'Firdaus', 'Harith', 'Iqbal', 'Naufal', 'Rayyan', 'Faris', 'Aqil', 'Hafiz', 'Imran', 'Zikri', 'Arif', 'Afiq', 'Ilham', 'Aidil', 'Khairul', 'Nabil', 'Izzat', 'Syahmi'];
const FEMALE = ['Nur Aisyah', 'Nurul Huda', 'Siti Hajar', 'Aina', 'Alya', 'Batrisyia', 'Damia', 'Fatimah', 'Hana', 'Iman', 'Insyirah', 'Irdina', 'Khadijah', 'Maisarah', 'Nur Balqis', 'Nur Qistina', 'Puteri', 'Qaisara', 'Sofea', 'Syafiqah', 'Wardah', 'Zahra', 'Nur Farhana', 'Athirah', 'Nadhirah', 'Humaira', 'Aqilah', 'Najwa', 'Hanis', 'Ain'];
const FATHER = ['Razali', 'Zaki', 'Imran', 'Azman', 'Shukri', 'Ismail', 'Hassan', 'Kamarudin', 'Rosli', 'Yusof', 'Zulkifli', 'Hamdan', 'Nordin', 'Rahim', 'Mazlan', 'Faizal', 'Hisham', 'Nizam', 'Salleh', 'Mokhtar', 'Azhar', 'Harun', 'Jamal', 'Rashid', 'Sulaiman', 'Wahab', 'Zainal', 'Fauzi', 'Khalid', 'Idris', 'Ramli', 'Latif', 'Anuar', 'Hafizuddin', 'Syukri', 'Ariffin'];
const GRANDFATHER = ['Mahmud', 'Salleh', 'Abdullah', 'Yusof', 'Ramli', 'Omar', 'Ibrahim', 'Hussin', 'Daud', 'Ali', 'Mat', 'Jusoh', 'Awang', 'Deraman', 'Musa', 'Ismail', 'Che Hassan', 'Mamat'];
const MOTHER = ['Halimah', 'Rohana', 'Salmah', 'Noraini', 'Zaleha', 'Rosnah', 'Faridah', 'Azizah', 'Suraya', 'Norhayati', 'Rozita', 'Hasnah', 'Mazni', 'Nor Azila', 'Wan Aminah', 'Zarina', 'Khatijah', 'Aisyah'];
const OCCUPATION = ['Guru', 'Jurutera', 'Peniaga', 'Pegawai kerajaan', 'Jururawat', 'Doktor', 'Pegawai bank', 'Polis', 'Kontraktor', 'Pensyarah', 'Akauntan', 'Suri rumah', 'Pemandu', 'Juruteknik', 'Kerani'];
const SECONDARY_SCHOOLS = ['SMK Telipot', 'SMK Zainab 1', 'SMK Zainab 2', 'SMK Sultan Ismail', 'SMK Maktab Sultan Ismail', 'SMK Kubang Kerian', 'SMK Kota', 'SMK Long Ghafar', 'SMK Ismail Petra', 'SMK Pengkalan Chepa', 'SMKA Naim Lilbanat', 'SMK Hamzah'];
const PRIMARY_SCHOOLS = ['SK Telipot', 'SK Kubang Kerian', 'SK Islah', 'SK Zainab', 'SK Sultan Ismail 1', 'SK Kota', 'SK Padang Garong'];
const PLACES = ['Kampung Telipot', 'Taman Desa Kujid', 'Jalan Hospital', 'Kubang Pasu', 'Taman Uda Murni', 'Jalan Sultanah Zainab', 'Kampung Sireh', 'Taman Guru', 'Pengkalan Chepa', 'Lundang', 'Kampung Kota', 'Jalan Pengkalan Chepa'];
const BIRTH_YEAR = { F5: 2009, F4: 2010, F3: 2011, F2: 2012, F1: 2013, S6: 2014, S5: 2015 };

const phone = (prefix) => `${prefix}${int(0, 9)}-${int(100, 999)} ${int(1000, 9999)}`;
const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const weekday = (iso) => ['', 'ISNIN', 'SELASA', 'RABU', 'KHAMIS', 'JUMAAT', 'SABTU'][new Date(`${iso}T00:00:00`).getDay()];

function makeClasses() {
  const slotCount = {};
  return CLASS_ROWS.map(([day, start, end, subject, form, section, teacher, target], i) => {
    const slot = `${day}${start}`;
    slotCount[slot] = (slotCount[slot] ?? -1) + 1;
    return { id: i + 1, day, start, end, subject, form, section, teacher, target, max: SETTINGS.classCapacity, room: ROOMS[slotCount[slot] % ROOMS.length] };
  });
}

function newFamily() {
  const father = pick(FATHER);
  const occupation = pick(OCCUPATION);
  return {
    father,
    parent1: { name: `${father} bin ${pick(GRANDFATHER.filter((g) => g !== father))}`, phone: phone('01'), occupation, relation: 'Bapa' },
    parent2: chance(0.8)
      ? { name: `${pick(MOTHER)} binti ${pick(GRANDFATHER)}`, phone: phone('01'), occupation: pick(OCCUPATION), relation: 'Ibu' }
      : { name: '', phone: '', occupation: '', relation: 'Ibu' },
    preferred: chance(0.3) ? 2 : 1,
    address: `${pick(['Lot', 'No.'])} ${int(2, 480)}, ${pick(PLACES)}, 15${pick(['150', '200', '050', '100'])} Kota Bharu`,
  };
}

function makeIc(form, male) {
  const y = BIRTH_YEAR[form];
  const last = int(100, 999) * 10 + (male ? int(0, 4) * 2 + 1 : int(0, 4) * 2);
  return `${String(y).slice(2)}${pad(int(1, 12))}${pad(int(1, 28))}-03-${pad(last, 4)}`;
}

export function createDemoData() {
  rand = rng(20260313);
  const classes = makeClasses();
  const byKey = (form, subject, section = 'A') => classes.find((c) => c.form === form && c.subject === subject && c.section === section).id;
  const remaining = Object.fromEntries(classes.map((c) => [c.id, c.target]));
  const students = [];
  const families = [];
  let seq = 0;

  const add = (s) => {
    seq += 1;
    const student = {
      id: `AN-2026-${pad(seq, 3)}`,
      type: 'MONTHLY',
      status: 'ACTIVE',
      joined: '2026-01-02',
      source: pick(['BANNER', 'BANNER', 'RAKAN', 'FACEBOOK', 'WHATSAPP']),
      discounts: [],
      checklist: { L: true, TEL: true, SP: true, AT: true, SY: true },
      phone: '',
      ...s,
    };
    student.classes.forEach((id) => (remaining[id] -= 1));
    students.push(student);
    return student;
  };

  // --- Named students used in the walkthrough ---------------------------------
  const razali = {
    father: 'Razali',
    parent1: { name: 'Razali bin Mahmud', phone: '012-987 6541', occupation: 'Jurutera', relation: 'Bapa' },
    parent2: { name: 'Halimah binti Omar', phone: '013-888 9991', occupation: 'Guru', relation: 'Ibu' },
    preferred: 1,
    address: 'Lot 22, Kampung Telipot, 15150 Kota Bharu',
  };
  families.push(razali);
  const named = [
    { name: 'Ahmad Daniyal bin Razali', ic: '090514-03-5511', form: 'F5', stream: 'SAINS', school: 'SMK Telipot', family: razali, classes: [byKey('F5', 'FZ'), byKey('F5', 'KIM'), byKey('F5', 'BIO'), byKey('F5', 'ADDMT')], phone: '011-2345 6781' },
    { name: 'Nur Aisyah binti Mohd Zaki', ic: '090822-03-6622', form: 'F5', stream: 'SAINS', school: 'SMK Zainab 1', classes: [byKey('F5', 'BIO', 'B'), byKey('F5', 'KIM', 'B'), byKey('F5', 'BI'), byKey('F5', 'MATH')] },
    { name: 'Muhammad Haziq bin Imran', ic: '100311-03-7733', form: 'F4', stream: 'SAINS', school: 'SMK Sultan Ismail', classes: [byKey('F4', 'FZ'), byKey('F4', 'KIM'), byKey('F4', 'BIO'), byKey('F4', 'ADDMT'), byKey('F4', 'BI')], checklist: { L: true, TEL: true, SP: true, AT: true, SY: false } },
    { name: 'Farah Nadiah binti Azman', ic: '110425-03-8844', form: 'F3', stream: 'GENERAL', school: 'SMK Maktab Sultan Ismail', classes: [byKey('F3', 'MATH'), byKey('F3', 'SEJ'), byKey('F3', 'BM', 'B'), byKey('F3', 'SAINS')], joined: '2026-02-10', checklist: { L: true, TEL: true, SP: true, AT: false, SY: false } },
    { name: 'Amirul Hakim bin Shukri', ic: '140212-03-9955', form: 'S6', stream: 'GENERAL', school: 'SK Telipot', classes: [byKey('S6', 'BM_R'), byKey('S6', 'BI_R'), byKey('S6', 'MATH_R'), byKey('S6', 'SAINS_R')] },
    { name: 'Nur Iman binti Razali', ic: '120903-03-6612', form: 'F2', stream: 'GENERAL', school: 'SMK Telipot', family: razali, classes: [byKey('F2', 'BI'), byKey('F2', 'MATH'), byKey('F2', 'SAINS'), byKey('F2', 'BM')] },
  ];
  for (const n of named) {
    const fam = n.family ?? newFamily();
    if (!n.family) {
      fam.father = n.name.split(/ bin | binti /)[1].replace(/^Mohd /, '');
      fam.parent1.name = `${n.name.split(/ bin | binti /)[1]} bin ${pick(GRANDFATHER)}`;
      families.push(fam);
    }
    const { family: _family, ...rest } = n;
    add({ ...rest, parent1: { ...fam.parent1 }, parent2: { ...fam.parent2 }, preferred: fam.preferred, address: fam.address });
  }

  // --- Generated population, filling each class towards its target -------------
  const PLAN = { F5: 62, F4: 42, F3: 34, F2: 18, F1: 12, S6: 15, S5: 10 };
  for (const [form, total] of Object.entries(PLAN)) {
    const formClasses = classes.filter((c) => c.form === form);
    const subjects = [...new Set(formClasses.map((c) => c.subject))];
    const already = students.filter((s) => s.form === form).length;
    for (let i = already; i < total; i++) {
      const left = total - i;
      const remTotal = formClasses.reduce((a, c) => a + Math.max(0, remaining[c.id]), 0);
      const k = form === 'S6' ? 4 : form === 'S5' ? 2 : Math.min(subjects.length, Math.max(4, Math.round(remTotal / left)));
      const bySubject = subjects
        .map((sub) => ({ sub, rem: formClasses.filter((c) => c.subject === sub).reduce((a, c) => a + remaining[c.id], 0) + rand() * 1.5 }))
        .sort((a, b) => b.rem - a.rem)
        .slice(0, k);
      const chosen = bySubject.map(({ sub }) =>
        formClasses.filter((c) => c.subject === sub).sort((a, b) => remaining[b.id] - remaining[a.id])[0].id,
      );
      const male = chance(0.5);
      // ~12% of students are siblings of an existing family
      const fam = chance(0.12) && families.length > 3 ? pick(families) : newFamily();
      if (!families.includes(fam)) families.push(fam);
      const subjCodes = chosen.map((id) => classes[id - 1].subject);
      const stream = ['FZ', 'KIM', 'BIO'].some((c) => subjCodes.includes(c)) ? 'SAINS' : subjCodes.includes('ACC') ? 'SASTERA' : 'GENERAL';
      const joinRoll = rand();
      add({
        name: `${pick(male ? MALE : FEMALE)} ${male ? 'bin' : 'binti'} ${fam.father}`,
        ic: makeIc(form, male),
        form,
        stream,
        school: pick(form.startsWith('S') ? PRIMARY_SCHOOLS : SECONDARY_SCHOOLS),
        phone: form === 'F5' || form === 'F4' ? phone('01') : '',
        parent1: { ...fam.parent1 },
        parent2: { ...fam.parent2 },
        preferred: fam.preferred,
        address: fam.address,
        classes: chosen,
        joined: joinRoll < 0.8 ? `2026-01-${pad(int(2, 10))}` : joinRoll < 0.92 ? `2026-02-${pad(int(2, 20))}` : `2026-03-${pad(int(2, 10))}`,
      });
    }
  }

  // Students who joined recently haven't finished the office checklist
  for (const s of students) {
    if (s.joined >= '2026-03-01') s.checklist = { L: true, TEL: true, SP: chance(0.5), AT: false, SY: false };
  }

  // A few students left during the term
  const leavers = [];
  for (let i = 0; i < 6; i++) {
    const form = pick(['F5', 'F4', 'F3', 'F2']);
    const male = chance(0.5);
    const fam = newFamily();
    seq += 1;
    leavers.push({
      id: `AN-2026-${pad(seq, 3)}`,
      name: `${pick(male ? MALE : FEMALE)} ${male ? 'bin' : 'binti'} ${fam.father}`,
      ic: makeIc(form, male), form, stream: 'GENERAL', school: pick(SECONDARY_SCHOOLS), phone: '',
      parent1: fam.parent1, parent2: fam.parent2, preferred: 1, address: fam.address,
      classes: [], type: 'MONTHLY', status: 'TERMINATED', joined: '2026-01-05', left: i < 3 ? '2026-01-31' : '2026-02-28',
      source: 'BANNER', discounts: [], checklist: { L: true, TEL: true, SP: true, AT: true, SY: true },
    });
  }
  students.push(...leavers);

  // Assigned discounts
  const active = students.filter((s) => s.status === 'ACTIVE');
  [7, 23, 58, 104].forEach((i) => active[i] && (active[i].discounts = ['ASNAF']));
  [41].forEach((i) => active[i] && (active[i].discounts = ['STAFF']));

  // --- Invoices & receipts -----------------------------------------------------
  const tierFee = (form, count) => {
    if (form === 'S5') return 100;
    if (form === 'S6') return 200;
    const t = PRICING_TIERS.find((x) => x.category === 'SECONDARY' && x.count === count);
    return t ? t.rate * t.count : count * 50;
  };
  const familyKey = (s) => s.parent1.phone;
  const formRank = { F5: 7, F4: 6, F3: 5, F2: 4, F1: 3, S6: 2, S5: 1 };
  const eldestOf = {};
  for (const s of students) {
    const key = familyKey(s);
    if (!eldestOf[key] || formRank[s.form] > formRank[eldestOf[key].form]) eldestOf[key] = s;
  }
  const siblingCount = students.reduce((a, s) => ((a[familyKey(s)] = (a[familyKey(s)] ?? 0) + 1), a), {});

  // Outstanding-fee storyline: a few families behind for two months
  const lateTwoMonths = new Set([active[12]?.id, active[67]?.id, active[131]?.id]);
  const partialMarch = new Set([active[33]?.id, active[90]?.id]);

  const invoices = [];
  const receipts = [];
  let invSeq = 0;
  for (const month of HISTORY_MONTHS) {
    for (const s of students) {
      if (s.joined.slice(0, 7) > month) continue;
      if (s.left && s.left.slice(0, 7) < month) continue;
      const count = s.classes.length || 4;
      const monthly = tierFee(s.form, count);
      const regFee = s.joined.slice(0, 7) === month ? SETTINGS.regFee : 0;
      const discounts = [];
      if (siblingCount[familyKey(s)] > 1 && eldestOf[familyKey(s)] !== s) {
        discounts.push({ id: 'SIBLING', label: DISCOUNTS[0].label, amount: Math.round(monthly * 0.1) });
      }
      for (const id of s.discounts) {
        const rule = DISCOUNTS.find((d) => d.id === id);
        discounts.push({ id, label: rule.label, amount: Math.round((monthly * rule.value) / 100) });
      }
      const discount = discounts.reduce((a, d) => a + d.amount, 0);
      const total = monthly + regFee;
      invSeq += 1;
      const inv = {
        no: `INV-2026-${pad(invSeq, 4)}`, studentId: s.id, month, monthlyFee: monthly, regFee, discounts, discount, total,
        paid: 0, dueDate: `${month}-${pad(SETTINGS.dueDay)}`, receipt: null,
      };
      const due = total - discount;
      let pay = 0;
      if (month === '2026-03') {
        if (lateTwoMonths.has(s.id)) pay = 0;
        else if (partialMarch.has(s.id)) pay = Math.round(due / 2);
        else if (s.name.startsWith('Farah Nadiah') || s.name.startsWith('Nur Iman')) pay = 0;
        else if (s.name.startsWith('Ahmad Daniyal')) pay = due;
        else pay = chance(0.72) ? due : 0;
      } else if (month === '2026-02') {
        pay = lateTwoMonths.has(s.id) ? 0 : chance(0.97) ? due : 0;
      } else {
        pay = chance(0.99) ? due : 0;
      }
      if (pay > 0) {
        const lastDay = month === '2026-03' ? 12 : 14;
        const date = `${month}-${pad(Math.min(lastDay, Math.max(Number(s.joined.slice(8)) * (s.joined.slice(0, 7) === month ? 1 : 0), int(1, 9))))}`;
        const method = pick(['DUITNOW_QR', 'DUITNOW_QR', 'DUITNOW_QR', 'FPX', 'FPX', 'CASH', 'CASH', 'CARD']);
        receipts.push({ invoiceNo: inv.no, amount: pay, date, method, ref: method === 'CASH' ? '' : `${method === 'FPX' ? 'FPX' : method === 'CARD' ? 'CRD' : 'DN'}-${int(10000000, 99999999)}`, by: 'Admin Kaunter' });
        inv.paid = pay;
      }
      invoices.push(inv);
    }
  }
  receipts.sort((a, b) => a.date.localeCompare(b.date) || a.invoiceNo.localeCompare(b.invoiceNo));
  receipts.forEach((r, i) => {
    r.no = `REC-2026-${pad(i + 1, 4)}`;
    invoices.find((inv) => inv.no === r.invoiceNo).receipt = r.no;
  });
  invoices.reverse();
  receipts.reverse();

  // --- Attendance history (every session up to yesterday) -----------------------
  const chronic = new Set(active.filter(() => chance(0.06)).map((s) => s.id));
  const attendance = [];
  for (let d = '2026-01-02'; d < DEMO_TODAY; d = addDays(d, 1)) {
    const day = weekday(d);
    if (!DAYS.includes(day)) continue;
    for (const c of classes.filter((x) => x.day === day)) {
      const roster = students.filter((s) => s.classes.includes(c.id) && s.joined <= d && (!s.left || s.left >= d));
      const absent = [];
      const late = [];
      for (const s of roster) {
        const r = rand();
        if (r < (chronic.has(s.id) ? 0.22 : 0.05)) absent.push(s.id);
        else if (r < (chronic.has(s.id) ? 0.3 : 0.08)) late.push(s.id);
      }
      attendance.push({ classId: c.id, date: d, absent, late, takenBy: c.teacher });
    }
  }

  // --- Exam marks for Ujian 1 & 2 -----------------------------------------------
  const ability = Object.fromEntries(students.map((s) => [s.id, Math.max(30, Math.min(92, 64 + gauss() * 13))]));
  ability[students[0].id] = 82; // Ahmad Daniyal
  ability[students[5].id] = 70; // Nur Iman
  const results = [];
  for (const exam of EXAMS.filter((e) => e.date < DEMO_TODAY)) {
    const idx = EXAMS.indexOf(exam);
    for (const c of classes) {
      const marks = {};
      for (const s of students.filter((x) => x.classes.includes(c.id) && x.joined <= exam.date)) {
        marks[s.id] = Math.round(Math.max(12, Math.min(100, ability[s.id] + idx * 2.5 + gauss() * 7)));
      }
      results.push({ examId: exam.id, classId: c.id, marks, enteredBy: c.teacher });
    }
  }

  // --- Waiting lists on full classes ------------------------------------------
  const waitlist = [];
  const fzF5 = byKey('F5', 'FZ');
  const mathF4 = byKey('F4', 'MATH');
  active.filter((s) => s.form === 'F5' && !s.classes.some((id) => classes[id - 1].subject === 'FZ')).slice(0, 2)
    .forEach((s, i) => waitlist.push({ id: i + 1, classId: fzF5, studentId: s.id, added: `2026-03-0${i + 3}` }));
  const f4 = active.find((s) => s.form === 'F4' && !s.classes.some((id) => classes[id - 1].subject === 'MATH'));
  if (f4) waitlist.push({ id: 3, classId: mathF4, studentId: f4.id, added: '2026-03-06' });

  // --- Reschedules & vouchers ----------------------------------------------------
  const reschedules = [
    { id: 1, classId: byKey('F5', 'BI'), cancelled: '2026-01-13', replacement: '2026-01-17', extra: false, reason: 'PH', remarks: 'Cuti Thaipusam', approved: true, notified: true },
    { id: 2, classId: byKey('F5', 'ADDMT'), cancelled: '2026-01-23', replacement: '2026-01-31', extra: false, reason: 'MARKING', remarks: 'Cikgu menanda kertas percubaan', approved: true, notified: true },
    { id: 3, classId: byKey('F5', 'FZ'), cancelled: '2026-01-30', replacement: '2026-02-07', extra: false, reason: 'TIME', remarks: 'Tersilap masa, kelas dibatalkan 30 minit', approved: true, notified: true },
    { id: 4, classId: byKey('F5', 'KIM'), cancelled: null, replacement: '2026-02-14', extra: true, reason: 'EXTRA', remarks: 'Kelas intensif sebelum Ujian 2', approved: true, notified: true },
    { id: 5, classId: byKey('F4', 'MATH'), cancelled: '2026-02-16', replacement: '2026-02-21', extra: false, reason: 'PH', remarks: 'Cuti Tahun Baru Cina', approved: true, notified: true },
    { id: 6, classId: byKey('F5', 'BIO'), cancelled: '2026-03-19', replacement: '2026-03-26', extra: false, reason: 'LEAVE', remarks: 'Cikgu Diana cuti sakit', approved: false, notified: false },
    { id: 7, classId: byKey('F3', 'SAINS'), cancelled: null, replacement: '2026-03-28', extra: true, reason: 'EXTRA', remarks: 'Kelas ulangkaji sebelum Ujian 3', approved: false, notified: false },
  ].reverse();

  const voucher = (no, date, vendor, category, amount, description, status, approvedBy = '') => ({ no, date, vendor, category, amount, description, status, preparedBy: 'Admin Kaunter', approvedBy });
  const vouchers = [
    voucher('PV26-0101', '2026-01-02', 'Hartanah Telipot Sdn Bhd', 'Utiliti & sewa', 3500, 'Sewa premis tingkat 1 & 2, Januari 2026', 'APPROVED', 'Pengurusan'),
    voucher('PV26-0102', '2026-01-05', 'Pustaka Sri Telipot', 'Alat tulis & modul', 420, 'Kertas A4, marker dan fail pelajar baharu', 'VERIFIED', 'Admin Kaunter'),
    voucher('PV26-0103', '2026-01-12', 'Percetakan Kota Bharu', 'Alat tulis & modul', 2850, 'Cetakan modul SPM Fizik, Kimia, Biologi', 'APPROVED', 'Supervisor Akademik'),
    voucher('PV26-0104', '2026-01-15', 'TNB', 'Utiliti & sewa', 812, 'Bil elektrik Disember 2025', 'APPROVED', 'Supervisor Akademik'),
    voucher('PV26-0105', '2026-01-20', 'Unifi', 'Utiliti & sewa', 199, 'Internet Januari 2026', 'VERIFIED', 'Admin Kaunter'),
    voucher('PV26-0201', '2026-02-02', 'Hartanah Telipot Sdn Bhd', 'Utiliti & sewa', 3500, 'Sewa premis tingkat 1 & 2, Februari 2026', 'APPROVED', 'Pengurusan'),
    voucher('PV26-0202', '2026-02-09', 'Kedai Banner Wakaf Che Yeh', 'Pemasaran', 380, 'Banner pendaftaran pertengahan tahun', 'VERIFIED', 'Admin Kaunter'),
    voucher('PV26-0203', '2026-02-14', 'TNB', 'Utiliti & sewa', 845, 'Bil elektrik Januari 2026', 'APPROVED', 'Supervisor Akademik'),
    voucher('PV26-0204', '2026-02-20', 'Unifi', 'Utiliti & sewa', 199, 'Internet Februari 2026', 'VERIFIED', 'Admin Kaunter'),
    voucher('PV26-0205', '2026-02-25', 'Sri Telipot Aircond Services', 'Penyelenggaraan', 1200, 'Servis 4 unit penghawa dingin tingkat 1 & 2', 'APPROVED', 'Supervisor Akademik'),
    voucher('PV26-0301', '2026-03-02', 'Hartanah Telipot Sdn Bhd', 'Utiliti & sewa', 3500, 'Sewa premis tingkat 1 & 2, Mac 2026', 'APPROVED', 'Pengurusan'),
    voucher('PV26-0302', '2026-03-03', 'Pustaka Sri Telipot', 'Alat tulis & modul', 350, 'Kertas A4 (10 rim) dan modul latihan Fizik T5', 'VERIFIED', 'Admin Kaunter'),
    voucher('PV26-0303', '2026-03-10', 'Percetakan Kota Bharu', 'Alat tulis & modul', 3400, 'Cetakan buku modul SPM 2026 untuk semua subjek teras', 'PENDING'),
    voucher('PV26-0304', '2026-03-12', 'TNB', 'Utiliti & sewa', 860, 'Bil elektrik Februari 2026', 'PENDING'),
  ].reverse();

  return structuredClone({
    subjects: SUBJECTS,
    teachers: TEACHERS,
    classes: classes.map(({ target: _target, ...c }) => c),
    students,
    invoices,
    receipts,
    reschedules,
    vouchers,
    pricingTiers: PRICING_TIERS,
    settings: SETTINGS,
    discounts: DISCOUNTS,
    exams: EXAMS,
    results,
    attendance,
    waitlist,
    arrearsWarnings: {},
  });
}
