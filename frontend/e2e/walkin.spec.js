import { expect, test } from '@playwright/test';
import { api, signInAs, unique } from './support/auth';

// A walk-in student's subjects: the list follows the student's tingkatan, grouped the way the centre groups subjects in
// Data induk, with the other levels folded away.

const newIc = () => `0${Math.floor(1 + Math.random() * 8)}0${Math.floor(1 + Math.random() * 8)}1${Math.floor(Math.random() * 9)}-03-${String(Math.floor(1000 + Math.random() * 8999))}`;

async function openWalkInForm(page) {
  await page.goto('/#/students?new');
  await expect(page.getByRole('heading', { name: 'Pendaftaran pelajar baharu' })).toBeVisible();
  // the school list has arrived: more than "Pilih sekolah" and "Lain-lain"
  await expect.poll(() => page.getByLabel(/^Sekolah/).locator('option').count()).toBeGreaterThan(2);
  await page.getByLabel('Jenis pelajar').selectOption('WALK_IN');
  return page.getByRole('group', { name: /^Subjek walk-in/ });
}

test.describe('Subjects for a walk-in student', () => {
  test('the subjects of the tingkatan come first in their groups; other levels are folded away; picks stay in view', async ({ page }) => {
    await signInAs(page, 'ADMIN');
    const picker = await openWalkInForm(page);

    // Tingkatan 5: the upper secondary subjects, in groups, and nothing from the other levels in sight
    await expect(picker).toContainText('· F5');
    await expect(picker.getByText('Sains', { exact: true })).toBeVisible();
    await expect(picker.getByRole('button', { name: 'FZ', exact: true })).toBeVisible();
    await expect(picker.getByRole('button', { name: 'MATH_P', exact: true })).toBeHidden();

    await picker.getByRole('button', { name: 'FZ', exact: true }).click();
    await expect(picker.getByLabel('Subjek dipilih')).toContainText('FZ');

    // a subject of another level is one click away, and what is picked there still shows at the top
    await picker.getByText(/^Subjek peringkat lain/).click();
    await picker.getByRole('button', { name: 'MATH_P', exact: true }).click();
    await expect(picker.getByLabel('Subjek dipilih')).toContainText('Dipilih (2)');
    await picker.getByLabel('Subjek dipilih').getByRole('button', { name: 'MATH_P' }).click(); // removed from the top
    await expect(picker.getByLabel('Subjek dipilih')).toContainText('Dipilih (1)');
  });

  test('changing the tingkatan clears the picks and shows that tingkatan\'s subjects', async ({ page }) => {
    await signInAs(page, 'ADMIN');
    const picker = await openWalkInForm(page);
    await picker.getByRole('button', { name: 'FZ', exact: true }).click();
    await expect(picker.getByLabel('Subjek dipilih')).toBeVisible();

    await page.getByLabel(/^Tingkatan \/ darjah/).selectOption('F2');
    await expect(picker).toContainText('· F2');
    await expect(picker.getByLabel('Subjek dipilih')).toHaveCount(0);
    await expect(picker.getByRole('button', { name: 'GEO_L', exact: true })).toBeVisible();
    await expect(picker.getByRole('button', { name: 'FZ', exact: true })).toBeHidden(); // upper secondary is folded away now
  });

  test('a walk-in student is registered with the subjects that were picked', async ({ page, request }) => {
    const name = unique('Ujian Walk-in');
    await signInAs(page, 'ADMIN');
    const picker = await openWalkInForm(page);
    await page.getByLabel('Nama penuh').fill(name);
    await page.getByLabel(/^No\. kad pengenalan/).fill(newIc());
    await page.getByLabel(/^Sekolah/).selectOption({ index: 1 });
    await page.getByLabel(/^Nama( \*)?$/).first().fill('Puan Ujian Walk-in');
    await page.getByLabel(/^No\. telefon \(WhatsApp\)/).first().fill('012-3456789');
    await page.getByLabel('Keterangan').fill('Hadir kelas intensif Sabtu sahaja');
    await picker.getByRole('button', { name: 'FZ', exact: true }).click();
    await picker.getByRole('button', { name: 'KIM', exact: true }).click();
    await page.getByRole('button', { name: 'Daftar pelajar' }).click();
    await expect(page.getByRole('heading', { name })).toBeVisible();

    const subjects = await api(request, 'ADMIN', 'GET', '/business-config/subjects/');
    const saved = (await api(request, 'ADMIN', 'GET', '/students/students/')).find((s) => s.full_name === name);
    expect(saved.student_type).toBe('WALK_IN');
    expect(saved.walk_in_subjects.slice().sort()).toEqual(subjects.filter((s) => ['FZ', 'KIM'].includes(s.code)).map((s) => s.id).sort());
  });
});
