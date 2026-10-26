import { expect, test } from '@playwright/test';
import { api, signInAs, unique } from './support/auth';

// Phase F: Management sends a teacher a private link; the teacher fills in their own details on a phone without a
// login; it waits as a teacher request until Management approves it. A general link does the same for applicants.

const toast = (page) => page.getByRole('status');
const PHOTO = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

async function makeLink(page, kind, choose) {
  await page.goto('/#/teachers?tab=links');
  await page.getByRole('button', { name: kind === 'TEACHER' ? 'Pautan untuk guru' : 'Pautan pemohon' }).click();
  const form = page.getByRole('dialog', { name: kind === 'TEACHER' ? 'Pautan untuk guru' : 'Pautan pemohon' });
  await choose(form);
  await form.getByRole('button', { name: 'Buat pautan' }).click();
  const shown = page.getByRole('dialog', { name: /^Pautan / });
  const url = (await shown.locator('p.font-mono').textContent()).trim();
  await shown.getByRole('button', { name: 'Tutup' }).first().click();
  return url;
}

test('a teacher updates their details through a private link and Management approves them', async ({ page, browser }) => {
  const [teacher] = (await api(page.request, 'MANAGEMENT', 'GET', '/teachers/teachers/')).filter((t) => t.is_active);
  const bank = unique('Bank E2E');
  await signInAs(page, 'MANAGEMENT');
  const url = await makeLink(page, 'TEACHER', (form) => form.getByLabel('Guru').selectOption(String(teacher.id)));
  expect(url).toMatch(/#\/guru\/[\w-]{20,}$/);

  // The teacher, on their phone, not signed in
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const tp = await phone.newPage();
  await tp.goto(url);
  await expect(tp.getByRole('heading', { name: `Cikgu ${teacher.full_name.replace(/^Cikgu\s+/i, '')}` })).toBeVisible();
  await tp.getByRole('button', { name: 'Maklumat saya' }).click(); // the link opens on today's classes (Phase I)
  await expect(tp.getByLabel('Nama penuh')).toHaveValue(teacher.full_name);
  await tp.getByLabel('Bank', { exact: true }).fill(bank);
  await tp.getByLabel(/^Gambar diri/).setInputFiles({ name: 'cikgu.png', mimeType: 'image/png', buffer: PHOTO });
  await tp.getByRole('button', { name: 'Hantar untuk semakan' }).click();
  await expect(tp.getByRole('heading', { name: 'Maklumat dihantar' })).toBeVisible();
  await phone.close();

  // Nothing changes until Management approves; the photo waits with the request
  expect((await api(page.request, 'MANAGEMENT', 'GET', `/teachers/teachers/${teacher.id}/`)).bank_name).not.toBe(bank);
  await page.getByRole('tab', { name: /^Permohonan/ }).click();
  // the request itself, not the row of the file sent with it (which also names who sent it)
  const request = page.getByRole('listitem').filter({ hasText: `${teacher.full_name} (pautan guru)` }).filter({ has: page.getByRole('button', { name: 'Luluskan' }) });
  await expect(request).toContainText('Dokumen');
  await expect(request.getByText('cikgu.png')).toBeVisible();
  await request.getByRole('button', { name: 'Luluskan' }).click();
  await expect(toast(page).filter({ hasText: 'Permohonan diluluskan' })).toBeVisible();
  expect((await api(page.request, 'MANAGEMENT', 'GET', `/teachers/teachers/${teacher.id}/`)).bank_name).toBe(bank);
});

test('an applicant joins through a general link once Management gives the code and rate; a cancelled link closes', async ({ page, browser }) => {
  const name = unique('Pemohon E2E');
  const code = `Q${Date.now().toString(36).slice(-4).toUpperCase().replace(/[^A-Z0-9]/g, 'X')}`;
  await signInAs(page, 'MANAGEMENT');
  const url = await makeLink(page, 'APPLICANT', (form) => form.getByLabel('Nama pautan').fill(unique('Pengambilan')));

  const visitor = await browser.newContext();
  const vp = await visitor.newPage();
  await vp.goto(url);
  await vp.getByLabel('Nama penuh').fill(name);
  await vp.getByLabel(/^No\. telefon/).fill('012-777 8888');
  await vp.getByLabel(/^Pengalaman/).fill('3 tahun mengajar Sains');
  await vp.getByRole('button', { name: 'Hantar permohonan' }).click();
  await expect(vp.getByRole('heading', { name: 'Permohonan diterima' })).toBeVisible();

  await page.getByRole('tab', { name: /^Permohonan/ }).click();
  const request = page.getByRole('listitem').filter({ hasText: `Pemohon: ${name}` });
  await request.getByRole('button', { name: 'Luluskan' }).click();
  const approve = page.getByRole('dialog', { name: 'Luluskan permohonan' });
  await approve.getByLabel('Kod guru').fill(code);
  await approve.getByLabel(/^Kadar permulaan/).fill('55');
  await approve.getByRole('button', { name: 'Luluskan' }).click();
  await expect(toast(page).filter({ hasText: 'Permohonan diluluskan' })).toBeVisible();
  const teachers = await api(page.request, 'MANAGEMENT', 'GET', '/teachers/teachers/');
  expect(teachers.find((t) => t.teacher_code === code)?.full_name).toBe(name);

  // Management cancels the general link; it no longer opens
  await page.getByRole('tab', { name: 'Pautan guru' }).click();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('row').filter({ hasText: 'Pemohon' }).filter({ hasText: 'Aktif' }).first().getByRole('button', { name: 'Batalkan' }).click();
  await expect(toast(page).filter({ hasText: 'Pautan dibatalkan' })).toBeVisible();
  await vp.goto(url);
  await vp.reload();
  await expect(vp.getByRole('alert')).toContainText('tidak sah');
  await visitor.close();
});
