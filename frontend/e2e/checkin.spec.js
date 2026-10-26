import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { signInAs } from './support/auth';

// Phase I: students check themselves in from the classroom's QR with the code on the whiteboard; the teacher's link
// shows the live list and confirms it; staff see who checked in and how on Kedatangan.
// Check-in depends on the clock, so e2e/support/checkin_class.py makes a class that started a few minutes ago.

const here = path.dirname(fileURLToPath(import.meta.url));
function classData(step) {
  const out = execFileSync(process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'),
    ['manage.py', 'shell', '-c', `exec(open(r'${path.join(here, 'support', 'checkin_class.py')}', encoding='utf-8').read())`], {
      cwd: path.resolve(here, '../../backend'),
      env: { ...process.env, ANNUR_ENV: 'development', ANNUR_DATA_DIR: process.env.ANNUR_E2E_DATA || path.join(os.tmpdir(), 'annur-e2e'), ANNUR_E2E_CHECKIN: step },
      encoding: 'utf-8',
    });
  return JSON.parse(out.split('[e2e-json]').pop());
}

let data;
test.beforeAll(() => { data = classData('setup'); });
test.afterAll(() => classData('teardown'));

test('students check in from the room QR, the teacher confirms the list and staff see how each was marked', async ({ page, browser }) => {
  test.skip(data.closed, 'The centre is closed today in the demo data');
  const [aisyah, badrul, chong] = data.students;

  // Supervisor prints the room's QR poster (Settings > Slot & bilik)
  await signInAs(page, 'SUPERVISOR');
  await page.goto('/#/settings?tab=schedule');
  await page.getByRole('row').filter({ hasText: data.room }).getByRole('button', { name: 'QR kehadiran' }).click();
  const poster = page.getByRole('dialog', { name: `QR kehadiran: ${data.room}` });
  await expect(poster.getByRole('img', { name: `Kod QR kehadiran ${data.room}` })).toBeVisible();
  const roomUrl = (await poster.locator('p.break-all').textContent()).trim();
  expect(roomUrl).toMatch(/#\/hadir\/[\w-]{10,}$/);
  await page.keyboard.press('Escape');

  // Staff open today's class on Kedatangan and open its code for the whiteboard
  await page.goto(`/#/attendance?class=${data.class_id}&date=${await page.evaluate(() => new Date().toLocaleDateString('en-CA'))}`);
  await page.getByRole('button', { name: 'Buka kod kelas' }).click();
  const code = (await page.locator('p.font-mono').textContent()).trim();
  expect(code).toMatch(/^\d{4}$/);
  await expect(page.getByRole('listitem').filter({ hasText: chong.name }).first()).toContainText('Belum direkod');

  // A student's phone: scan the room QR, type the code, tap their name, give the IC digits the first time
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Kuala_Lumpur' });
  const sp = await phone.newPage();
  await sp.goto(roomUrl);
  await expect(sp.getByText(`Kelas sekarang: ${data.subject}`, { exact: false })).toBeVisible();
  await sp.getByLabel('Kod kelas').fill(code === '0000' ? '0001' : '0000');
  await sp.getByRole('button', { name: 'Teruskan' }).click();
  await expect(sp.getByRole('alert')).toContainText('Kod kelas tidak sah');
  await sp.getByLabel('Kod kelas').fill(code);
  await sp.getByRole('button', { name: 'Teruskan' }).click();
  await expect(sp.getByRole('button', { name: chong.short })).toBeVisible(); // short names only
  await expect(sp.getByText(aisyah.name)).toHaveCount(0);
  await sp.getByRole('button', { name: aisyah.short }).click();
  await sp.getByLabel('4 digit akhir No. K/P').fill('9999');
  await sp.getByRole('button', { name: 'Rekod kehadiran' }).click();
  await expect(sp.getByRole('alert')).toContainText('tidak sepadan');
  await sp.getByLabel('4 digit akhir No. K/P').fill(aisyah.ic4);
  await sp.getByRole('button', { name: 'Rekod kehadiran' }).click();
  await expect(sp.getByText('Hadir', { exact: true })).toBeVisible();
  await expect(sp.getByText(aisyah.short)).toBeVisible();

  // The same phone again: no IC digits asked, and already recorded
  await sp.getByRole('button', { name: 'Pelajar lain' }).click();
  await sp.getByRole('button', { name: aisyah.short }).click();
  await expect(sp.getByText('Kedatangan anda sudah direkod tadi.')).toBeVisible();

  // The same phone for a second student: recorded, but flagged for the teacher
  await sp.getByRole('button', { name: 'Pelajar lain' }).click();
  await sp.getByRole('button', { name: badrul.short }).click();
  await sp.getByLabel('4 digit akhir No. K/P').fill(badrul.ic4);
  await sp.getByRole('button', { name: 'Rekod kehadiran' }).click();
  await expect(sp.getByText('Hadir', { exact: true })).toBeVisible();
  await phone.close();

  // The teacher's link: the code, the live list with the flag, a mark for the pupil without a phone, then confirm
  const tphone = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Kuala_Lumpur' });
  const tp = await tphone.newPage();
  await tp.goto(`/#/guru/${data.teacher_token}`);
  await expect(tp.getByText(code, { exact: true })).toBeVisible();
  const row = (name) => tp.getByRole('listitem').filter({ hasText: name });
  await expect(row(aisyah.name)).toContainText('Imbasan QR');
  await expect(row(badrul.name)).toContainText(`Telefon yang sama dengan ${aisyah.short}`);
  await expect(row(chong.name)).toContainText('Belum');
  await row(badrul.name).getByRole('button', { name: 'Hadir', exact: true }).click(); // the teacher has seen Badrul in class
  await expect(row(badrul.name)).not.toContainText('Telefon yang sama');
  await expect(row(badrul.name)).toContainText('Guru');
  tp.once('dialog', (d) => d.accept());
  await tp.getByRole('button', { name: 'Sahkan senarai' }).click();
  await expect(tp.getByText('Senarai disahkan', { exact: true })).toBeVisible();
  await expect(row(chong.name)).toContainText('Tidak hadir');
  await expect(row(chong.name)).toContainText('Senarai ditutup');
  await tphone.close();

  // Staff see how each student was marked, and that the list is confirmed
  await page.getByRole('button', { name: 'Muat semula' }).click();
  await expect(page.getByText(/Senarai disahkan oleh Cikgu Guru E2E QR/)).toBeVisible();
  const staffRow = (name) => page.getByRole('listitem').filter({ hasText: name }).first(); // the class list, before the parents' list
  await expect(staffRow(aisyah.name)).toContainText('Imbasan QR');
  await expect(staffRow(chong.name)).toContainText('Senarai ditutup');
  await expect(staffRow(chong.name).getByRole('radio', { name: 'Tidak hadir' })).toHaveAttribute('aria-checked', 'true');
  await expect(staffRow(aisyah.name).getByRole('radio', { name: 'Hadir', exact: true })).toHaveAttribute('aria-checked', 'true');
});
