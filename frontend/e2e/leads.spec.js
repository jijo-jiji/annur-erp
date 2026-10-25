import { expect, test } from '@playwright/test';
import { api, openAs, signInAs, tryApi, unique } from './support/auth';
import { displayPhone, normalizePhone } from '../src/lib/phone.js';

// The prospect funnel: partial leads, subjects by tingkatan, who moved a lead and going back, the lists managed in
// Data induk, registration through the full form, the board window (Arkib) and CSV import.

const STAGES = ['Enquiry', 'Content 1', 'Content 2', 'Content 3', 'Free Trial', 'Waiting Payment', 'Registered', 'Active'];
const column = (page, label) => page.locator(`section[aria-label="${label}"]`);
const cardIn = (page, label, text) => column(page, label).locator('div.space-y-2 > div').filter({ hasText: text });
const toast = (page) => page.getByRole('status');
const newPhone = () => `011-${Math.floor(10000000 + Math.random() * 89999999)}`;
// How a number typed into the form is written on the screen: +6011-1234-5678 (the server keeps it as 601112345678)
const shown = (typed) => displayPhone(normalizePhone(typed));

async function openLeads(page) {
  await page.goto('/#/leads');
  await expect(column(page, 'Enquiry')).toBeVisible();
}

// A lead made through the API, for tests that are about what happens next
async function makeLead(request, fields = {}) {
  const phone = newPhone();
  const name = unique('Prospek E2E');
  const lead = await api(request, 'ADMIN', 'POST', '/students/leads/', { phone, lead_source: 'TIKTOK', student_name: name, ...fields });
  return { ...lead, phone, name };
}

test.describe('Saving a prospect with partial information', () => {
  test('a phone number and a source are enough; the card says what is still missing and it can be completed later', async ({ page }) => {
    const phone = newPhone();
    await signInAs(page, 'ADMIN');
    await openLeads(page);
    await page.getByRole('button', { name: 'Prospek baharu' }).click();
    const form = page.getByRole('dialog', { name: 'Prospek baharu' });

    await form.getByLabel(/^No\. telefon/).fill(phone);
    await form.getByRole('button', { name: 'Simpan' }).click(); // no source yet: the browser stops it
    await expect(form).toBeVisible();

    await form.getByLabel(/^Sumber/).selectOption({ index: 1 });
    await form.getByRole('button', { name: 'Simpan' }).click();
    await expect(form).toBeHidden();

    const card = cardIn(page, 'Enquiry', shown(phone));
    await expect(card).toContainText('Belum lengkap (5)');
    await card.getByRole('button', { name: shown(phone) }).click();
    const detail = page.getByRole('dialog', { name: shown(phone) });
    await expect(detail).toContainText('Maklumat belum lengkap: Nama pelajar, Nama ibu bapa, Tingkatan, Sekolah, Subjek diminati');

    await detail.getByRole('button', { name: 'Lengkapkan' }).click();
    await detail.getByLabel('Nama pelajar').fill('Aina Lengkap');
    await detail.getByLabel(/^Nama ibu bapa/).fill('Puan Lengkap');
    await detail.getByLabel(/^Tingkatan/).selectOption({ label: 'Tingkatan 5' });
    await detail.getByRole('button', { name: 'Simpan', exact: true }).click();
    const completed = page.getByRole('dialog', { name: 'Aina Lengkap' }); // titled with the name now that it is known
    await expect(completed).toContainText('Maklumat belum lengkap: Sekolah, Subjek diminati');
  });
});

test.describe('Subjects follow the tingkatan', () => {
  test('only the subjects for the chosen tingkatan are offered', async ({ page }) => {
    await signInAs(page, 'ADMIN');
    await openLeads(page);
    await page.getByRole('button', { name: 'Prospek baharu' }).click();
    const form = page.getByRole('dialog', { name: 'Prospek baharu' });
    const chip = (name) => form.getByRole('button', { name, exact: true });

    await expect(form).toContainText('Pilih tingkatan dahulu');
    await expect(chip('Fizik')).toHaveCount(0);

    await form.getByLabel(/^Tingkatan/).selectOption({ label: 'Tingkatan 5' });
    await expect(form).toContainText('Kelas dibuka untuk Tingkatan 5');
    await expect(chip('Fizik')).toBeVisible();
    await expect(chip('Sains Sekolah Rendah')).toHaveCount(0);

    await form.getByLabel(/^Tingkatan/).selectOption({ label: 'Darjah 5' });
    await expect(chip('Sains Sekolah Rendah')).toBeVisible();
    await expect(chip('Fizik')).toHaveCount(0);

    // a subject chosen before the tingkatan was corrected stays visible and is pointed out
    await chip('Sains Sekolah Rendah').click();
    await form.getByLabel(/^Tingkatan/).selectOption({ label: 'Tingkatan 5' });
    await expect(form).toContainText('Dipilih untuk tingkatan lain');
    await expect(chip('Sains Sekolah Rendah')).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe('The stages', () => {
  test('the board has the eight default stages in order and no Contacted', async ({ page }) => {
    await signInAs(page, 'ADMIN');
    await openLeads(page);
    const titles = await page.locator('section[aria-label] h2').allTextContents();
    expect(titles).toEqual(STAGES.map((label, i) => `${i + 1}. ${label}`));
    await expect(page.getByText('Contacted')).toHaveCount(0);
  });
});

test.describe('Who moved a prospect, going back and undo', () => {
  test('the card names the person who clicked, not only the PIC; a wrong click is undone or moved back', async ({ page, request }) => {
    const lead = await makeLead(request);
    await signInAs(page, 'SUPERVISOR');
    await openLeads(page);

    // forward: the Supervisor clicks, the Admin is still the lead's PIC
    await cardIn(page, 'Enquiry', lead.name).getByRole('button', { name: /Content 1/ }).click();
    const moved = cardIn(page, 'Content 1', lead.name);
    await expect(moved).toContainText('Ditukar oleh Supervisor');
    await expect(moved).toContainText('PIC: Admin 1');

    // undo straight from the message
    await toast(page).filter({ hasText: 'dipindah ke Content 1' }).getByRole('button', { name: 'Buat asal' }).click();
    await expect(cardIn(page, 'Enquiry', lead.name)).toBeVisible();

    // forward twice, then back with the arrow on the card
    await cardIn(page, 'Enquiry', lead.name).getByRole('button', { name: /Content 1/ }).click();
    await cardIn(page, 'Content 1', lead.name).getByRole('button', { name: /Content 2/ }).click();
    await cardIn(page, 'Content 2', lead.name).getByRole('button', { name: 'Kembali ke Content 1' }).click();
    await expect(cardIn(page, 'Content 1', lead.name)).toBeVisible();

    // the log says who did each step and when, and calls going back by its name
    await cardIn(page, 'Content 1', lead.name).getByRole('button', { name: lead.name }).click();
    const detail = page.getByRole('dialog', { name: lead.name });
    await expect(detail.getByRole('columnheader', { name: 'Dibuat oleh' })).toBeVisible();
    const log = detail.getByRole('row').filter({ hasText: 'Kembali ke peringkat sebelumnya: Content 2 → Content 1' });
    await expect(log).toHaveCount(1);
    await expect(log).toContainText('Supervisor');
    await expect(log).toContainText(/\d{2}:\d{2}/); // the time, not only the date
  });

  test('the move-to list in the lead also goes back', async ({ page, request }) => {
    const lead = await makeLead(request, { status: 'CONTENT_3' });
    await signInAs(page, 'ADMIN');
    await openLeads(page);
    await cardIn(page, 'Content 3', lead.name).getByRole('button', { name: lead.name }).click();
    const detail = page.getByRole('dialog', { name: lead.name });
    await detail.getByLabel(/^Pindah ke/).selectOption({ label: 'Enquiry' });
    await detail.getByRole('button', { name: 'Tukar peringkat' }).click();
    await expect(detail).toContainText('Kembali ke peringkat sebelumnya: Content 3 → Enquiry');
  });
});

test.describe('Drop-downs kept in Data induk', () => {
  test('school, campaign, action and reason are lists; a new campaign appears once it is approved', async ({ page, request, browser }) => {
    const campaign = unique('Kempen E2E');
    const waiting = unique('Kempen Menunggu');
    await signInAs(page, 'ADMIN');
    await openLeads(page);
    await page.getByRole('button', { name: 'Prospek baharu' }).click();
    const form = page.getByRole('dialog', { name: 'Prospek baharu' });

    // school: a list with a way to type one that is not listed
    await expect(form.getByLabel(/^Sekolah/).locator('option', { hasText: 'SMK Telipot' })).toHaveCount(1);
    await form.getByLabel(/^Sekolah/).selectOption({ label: 'Lain-lain (taip nama)' });
    await expect(form.getByLabel('Nama sekolah')).toBeVisible();

    // campaign: only what the centre has listed
    const options = form.getByLabel('Kempen').locator('option');
    await expect(options).toHaveText(['Tiada kempen']);
    await form.getByRole('button', { name: 'Batal' }).click();

    // the Supervisor adds one directly; the Admin can only propose one
    await api(request, 'SUPERVISOR', 'POST', '/business-config/master-data/', { category: '22_lead_campaign', code: `E2E_${Date.now()}`, label: campaign });
    await api(request, 'ADMIN', 'POST', '/business-config/master-data/', { category: '22_lead_campaign', code: `E2EW_${Date.now()}`, label: waiting });
    await page.reload();
    await page.getByRole('button', { name: 'Prospek baharu' }).click();
    const again = page.getByRole('dialog', { name: 'Prospek baharu' });
    await expect(again.getByLabel('Kempen').locator('option', { hasText: campaign })).toHaveCount(1);
    await expect(again.getByLabel('Kempen').locator('option', { hasText: waiting })).toHaveCount(0);
    await again.getByRole('button', { name: 'Batal' }).click();

    // the lists are in Data induk for the centre to change
    const supervisor = await openAs(browser, 'SUPERVISOR');
    await supervisor.page.goto('/#/master-data');
    for (const name of ['Kempen prospek', 'Tindakan susulan prospek', 'Sebab prospek tidak berminat']) {
      await expect(supervisor.page.getByRole('button', { name: new RegExp(name) }).first()).toBeVisible();
    }
    await supervisor.close();
  });

  test('the follow-up action and the reason for losing a prospect come from lists', async ({ page, request }) => {
    const lead = await makeLead(request);
    await signInAs(page, 'ADMIN');
    await openLeads(page);
    await cardIn(page, 'Enquiry', lead.name).getByRole('button', { name: lead.name }).click();
    const detail = page.getByRole('dialog', { name: lead.name });

    await expect(detail.getByLabel('Tindakan').locator('option')).toContainText(['WhatsApp', 'Panggilan telefon', 'Hantar content']);

    await detail.getByLabel(/^Tidak berminat/).selectOption({ label: 'Yuran terlalu tinggi' });
    await detail.getByRole('button', { name: 'Tanda tidak berminat' }).click();
    await expect(toast(page).filter({ hasText: 'tidak berminat' })).toBeVisible();
    const lost = (await api(request, 'ADMIN', 'GET', '/students/leads/')).find((l) => l.id === lead.id);
    expect(lost.lost_reason).toBe('Yuran terlalu tinggi'); // the list's wording, so the reasons report groups them
  });
});

test.describe('Registering a prospect through the full form', () => {
  test('the form opens filled from the prospect, the prospect closes as Registered and the Supervisor activates it', async ({ page, request, browser }) => {
    const parent = unique('Puan Daftar');
    const lead = await makeLead(request, { parent_name: parent, form_level: 'F4', school_name: 'SMK Telipot', interested_subjects: ['FZ'] });
    await signInAs(page, 'ADMIN');
    await openLeads(page);
    await cardIn(page, 'Enquiry', lead.name).getByRole('button', { name: lead.name }).click();
    await page.getByRole('dialog', { name: lead.name }).getByRole('button', { name: 'Buka borang pendaftaran' }).click();

    await expect(page).toHaveURL(/students\?new&lead=/);
    await expect(page.getByRole('note')).toContainText(`Mendaftar prospek ${lead.lead_id}`);
    await expect(page.getByLabel('Nama penuh')).toHaveValue(lead.name);
    await expect(page.getByLabel(/^Nama( \*)?$/).first()).toHaveValue(parent);
    await expect(page.getByLabel(/^No\. telefon \(WhatsApp\)/).first()).toHaveValue(normalizePhone(lead.phone));
    await expect(page.getByLabel(/^Tingkatan \/ darjah/)).toHaveValue('F4');

    // what the prospect did not have is completed here
    await page.getByLabel(/^No\. kad pengenalan/).fill('100203-03-5566');
    const subjects = page.locator('#pilihan-kelas .divide-y > div');
    await expect(subjects.first()).toBeVisible();
    for (let i = 0; i < 4; i += 1) await subjects.nth(i).locator('button[aria-pressed]').first().click();
    await page.getByLabel(/^Syarat pembayaran dan peraturan/).check();
    await page.getByRole('button', { name: 'Daftar pelajar' }).click();
    await expect(page.getByRole('heading', { name: lead.name })).toBeVisible();

    const registered = (await api(request, 'ADMIN', 'GET', '/students/leads/')).find((l) => l.id === lead.id);
    expect(registered.status).toBe('REGISTERED');
    expect(registered.converted_student_code).toMatch(/^AN-/);

    // the Supervisor approves the complete record and the prospect becomes Active
    const supervisor = await openAs(browser, 'SUPERVISOR');
    await supervisor.page.goto('/#/students?tab=approvals');
    await supervisor.page.getByRole('row').filter({ hasText: lead.name }).getByRole('button', { name: 'Luluskan' }).click();
    await expect(toast(supervisor.page).filter({ hasText: 'diluluskan' })).toBeVisible();
    await supervisor.close();
    const active = (await api(request, 'ADMIN', 'GET', '/students/leads/')).find((l) => l.id === lead.id);
    expect(active.status).toBe('ACTIVE');
  });

  test('there is no longer a shortcut that turns a prospect into a student without the form', async ({ request }) => {
    const lead = await makeLead(request);
    const shortcut = await tryApi(request, 'ADMIN', 'POST', `/students/leads/${lead.id}/convert_to_student/`, {});
    expect(shortcut.status).toBe(404);
  });

  test('an incomplete registration cannot be approved until the counter completes it', async ({ page, request, browser }) => {
    const child = unique('Anak Belum Lengkap');
    const registered = await request.post('/api/v1/students/parent-self-register/', {
      data: { full_name: child, ic_number: '120304-03-7788', form_level: 'F3', school_name: 'SMK Telipot', parent1_name: 'Ibu E2E', parent1_phone: newPhone() },
    });
    expect(registered.ok()).toBeTruthy();
    const { student_id: code } = await registered.json();

    // the Supervisor is told why the approve button is held back, and the server agrees
    const supervisor = await openAs(browser, 'SUPERVISOR');
    await supervisor.page.goto('/#/students?tab=approvals');
    const row = supervisor.page.getByRole('row').filter({ hasText: child });
    await expect(row).toContainText('Belum lengkap: Pilihan kelas');
    await expect(row.getByRole('button', { name: 'Luluskan' })).toBeDisabled();
    const students = await api(request, 'SUPERVISOR', 'GET', '/students/students/');
    const refused = await tryApi(request, 'SUPERVISOR', 'POST', `/students/students/${students.find((s) => s.student_id === code).id}/approve/`, {});
    expect(refused.status).toBe(400);
    expect(refused.body.detail).toContain('Pilihan kelas');

    // the counter adds a class from the student's profile
    await signInAs(page, 'ADMIN');
    await page.goto(`/#/students/${code}`);
    await expect(page.getByRole('alert')).toContainText('Pendaftaran belum lengkap: Pilihan kelas');
    await page.getByRole('tab', { name: /^Kelas/ }).click();
    await page.getByRole('button', { name: 'Tambah subjek' }).click();
    const dialog = page.getByRole('dialog', { name: 'Tambah subjek' });
    await dialog.getByLabel(/^Kelas/).selectOption({ index: 1 });
    await dialog.locator('button[type="submit"]').click();
    await expect(page.getByRole('alert')).toHaveCount(0);

    await supervisor.page.reload();
    await expect(supervisor.page.getByRole('row').filter({ hasText: child }).getByRole('button', { name: 'Luluskan' })).toBeEnabled();
    await supervisor.close();
  });

  test('the counter can complete the student details from the profile', async ({ page, request }) => {
    const child = unique('Anak Ubah Maklumat');
    const registered = await request.post('/api/v1/students/parent-self-register/', {
      data: { full_name: child, ic_number: '130405-03-1212', form_level: 'F2', school_name: 'SMK Kota', parent1_name: 'Ibu Asal', parent1_phone: newPhone() },
    });
    const { student_id: code } = await registered.json();
    await signInAs(page, 'ADMIN');
    await page.goto(`/#/students/${code}`);
    await page.getByRole('button', { name: 'Ubah maklumat' }).click();
    const dialog = page.getByRole('dialog', { name: 'Ubah maklumat pelajar' });
    await dialog.getByLabel('Nama penjaga 2').fill('Bapa Tambahan');
    await dialog.getByLabel('No. telefon penjaga 2').fill('013-2223333');
    await dialog.getByLabel('Alamat rumah').fill('Lot 5, Jalan Telipot');
    await dialog.getByRole('button', { name: 'Simpan' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText('Bapa Tambahan')).toBeVisible();
    await expect(page.getByText('Lot 5, Jalan Telipot')).toBeVisible();
  });
});

test.describe('The board does not fill up with finished prospects', () => {
  test.afterEach(async ({ request }) => {
    await api(request, 'MANAGEMENT', 'PUT', '/thresholds/', { lead_board_days: 30 });
  });

  test('an old finished prospect is in Arkib, not on the board, and the window is a setting', async ({ page, browser }) => {
    await signInAs(page, 'SUPERVISOR');
    await openLeads(page);
    // LD-2026-003 finished 90 days ago; the board keeps finished prospects for 30
    await expect(column(page, 'Registered')).toContainText('+1 lebih 30 hari lalu');
    await expect(column(page, 'Registered')).not.toContainText('Wan Arif');

    await column(page, 'Registered').getByRole('button', { name: /lihat di Arkib/ }).click();
    const row = page.getByRole('row').filter({ hasText: 'Wan Arif' });
    await expect(row).toContainText('Registered');
    await page.getByLabel('Cari dalam arkib').fill('zzz-tiada');
    await expect(page.getByText('Tiada prospek dalam arkib')).toBeVisible();

    // Management widens the window and the prospect is back on the board
    const management = await openAs(browser, 'MANAGEMENT');
    await management.page.goto('/#/settings');
    await management.page.getByRole('tab', { name: 'Had & amaran' }).click();
    await management.page.getByLabel('Prospek yang selesai kekal di papan selama').fill('120');
    await management.page.getByRole('button', { name: 'Simpan', exact: true }).click();
    await expect(toast(management.page).filter({ hasText: 'Tetapan disimpan' })).toBeVisible();
    await management.page.goto('/#/leads');
    await expect(column(management.page, 'Registered')).toContainText('Wan Arif');
    await management.close();
  });

  test('a prospect that has only just finished stays on the board', async ({ page, request }) => {
    const lead = await makeLead(request, { parent_name: 'Ibu Baru', form_level: 'F5', school_name: 'SMK Telipot' });
    const student = await api(request, 'ADMIN', 'POST', '/students/students/', {
      full_name: lead.name, ic_number: '110101-03-1111', form_level: 'F5', school_name: 'SMK Telipot', parent1_name: 'Ibu Baru',
      parent1_phone: lead.phone, class_ids: [(await api(request, 'ADMIN', 'GET', '/academic/timetable/')).find((c) => c.form_level === 'F5').id], lead_id: lead.id,
    });
    expect(student.student_id).toMatch(/^AN-/);
    await signInAs(page, 'ADMIN');
    await openLeads(page);
    await expect(cardIn(page, 'Registered', lead.name)).toContainText(student.student_id);
  });
});

test.describe('Importing prospects from a CSV', () => {
  const upload = (page, name, text) => page.locator('input[type="file"]').setInputFiles({ name, mimeType: 'text/csv', buffer: Buffer.from(text, 'utf-8') });

  test('the file is checked first, only good rows are imported, and what was left out can be downloaded', async ({ page }) => {
    const [good, partial] = [newPhone(), newPhone()];
    const csv = [
      '﻿Nama pelajar,Nama ibu bapa,No. telefon,Tingkatan,Sekolah,Sumber,Subjek,Lajur asing',
      `Aina Import,Puan Sarah,${good},Tingkatan 5,SMK Telipot,TikTok Ads / Live,Fizik; Kimia,x`,
      `,,${partial},,,Facebook Ads & Page,,`,
      'Pendua Seed,Ibu,019-9881122,Tingkatan 4,,Facebook Ads & Page,,',
      'Salah Sumber,Ibu,011-5550001,Tingkatan 4,,Radio,,',
    ].join('\r\n');

    await signInAs(page, 'ADMIN');
    await openLeads(page);
    await page.getByRole('button', { name: 'Import CSV' }).click();
    const dialog = page.getByRole('dialog', { name: 'Import prospek daripada CSV' });
    await upload(page, 'okt.csv', csv);

    await expect(dialog).toContainText('Lajur dikenali: Nama pelajar, Nama ibu bapa, No. telefon, Tingkatan, Sekolah, Sumber, Subjek');
    await expect(dialog).toContainText('Diabaikan: Lajur asing');
    await expect(dialog).toContainText('2 sedia diimport');
    await expect(dialog).toContainText('1 pendua');
    await expect(dialog).toContainText('1 ralat');
    await expect(dialog).toContainText('sudah ada (prospek LD-2026-001)');
    await expect(dialog).toContainText('Sumber "Radio" tidak dikenali');
    // the Excel row number: the heading is line 1, so the first data row is 2
    await expect(dialog.getByRole('row').filter({ hasText: 'Salah Sumber' }).getByRole('cell').first()).toHaveText('5');

    await dialog.getByRole('button', { name: 'Import 2 prospek' }).click();
    await expect(dialog).toContainText('2 prospek diimport.');
    const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: /Muat turun baris yang tidak diimport/ }).click()]);
    expect(download.suggestedFilename()).toBe('baris-tidak-diimport.csv');
    const left = (await (await import('node:fs/promises')).readFile(await download.path(), 'utf-8')).replace(/^﻿/, '');
    expect(left).toContain('Radio');
    expect(left).toContain('Pendua');
    await dialog.getByRole('button', { name: 'Selesai' }).click();

    // the imported prospects are on the board; the one with only a phone says it is incomplete
    await expect(cardIn(page, 'Enquiry', 'Aina Import')).toContainText('Fizik, Kimia');
    await expect(cardIn(page, 'Enquiry', shown(partial))).toContainText('Belum lengkap');

    // the same file again adds nothing
    await page.getByRole('button', { name: 'Import CSV' }).click();
    await upload(page, 'okt.csv', csv);
    const again = page.getByRole('dialog', { name: 'Import prospek daripada CSV' });
    await expect(again).toContainText('0 sedia diimport');
    await expect(again.getByRole('button', { name: 'Import 0 prospek' })).toBeDisabled();
  });

  test('a semicolon file with the zero Excel drops and a source chosen for the whole batch', async ({ page, request }) => {
    const digits = `1${Math.floor(10000000 + Math.random() * 89999999)}`; // 9 digits starting 1, the leading 0 lost
    await signInAs(page, 'ADMIN');
    await openLeads(page);
    await page.getByRole('button', { name: 'Import CSV' }).click();
    const dialog = page.getByRole('dialog', { name: 'Import prospek daripada CSV' });
    await upload(page, 'excel.csv', `Telefon;Nama\r\n${digits};Dari Excel\r\n`);

    await expect(dialog).toContainText('Sumber diperlukan'); // no source in the file or the batch yet
    await dialog.getByLabel('Sumber jika tiada dalam fail').selectOption({ label: 'WhatsApp Rasmi / Rujukan Rakan' });
    await dialog.getByLabel('Peringkat permulaan').selectOption({ label: 'Content 2' });
    await expect(dialog).toContainText('1 sedia diimport');
    await dialog.getByRole('button', { name: 'Import 1 prospek' }).click();
    await expect(dialog).toContainText('1 prospek diimport.');
    await dialog.getByRole('button', { name: 'Selesai' }).click();
    await expect(cardIn(page, 'Content 2', 'Dari Excel')).toBeVisible();
    // stored the way every number is kept: the 0 Excel dropped is back as the country code 60
    const saved = (await api(request, 'ADMIN', 'GET', '/students/leads/')).find((l) => l.student_name === 'Dari Excel');
    expect(saved.phone).toBe(`60${digits}`);
  });

  test('a file without a phone column is refused with the headings that are accepted', async ({ page }) => {
    await signInAs(page, 'ADMIN');
    await openLeads(page);
    await page.getByRole('button', { name: 'Import CSV' }).click();
    const dialog = page.getByRole('dialog', { name: 'Import prospek daripada CSV' });
    await upload(page, 'salah.csv', 'Nama,Sekolah\r\nAina,SMK Telipot\r\n');
    await expect(dialog.getByRole('alert')).toContainText('Tiada lajur no. telefon');
    await expect(dialog.getByRole('button', { name: /^Import \d+ prospek$/ })).toBeDisabled();
  });

  test('the template can be downloaded', async ({ page }) => {
    await signInAs(page, 'ADMIN');
    await openLeads(page);
    await page.getByRole('button', { name: 'Import CSV' }).click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Muat turun templat' }).click()]);
    expect(download.suggestedFilename()).toBe('templat-prospek.csv');
    const text = await (await import('node:fs/promises')).readFile(await download.path(), 'utf-8');
    expect(text).toContain('No. telefon');
    expect(text).toContain('Sumber');
  });
});
