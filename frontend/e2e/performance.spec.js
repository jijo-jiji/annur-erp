import { expect, test } from '@playwright/test';
import { api, signInAs, unique } from './support/auth';

// Phase H: Prestasi pelajar lists students failing or falling, by teacher and class, with likely reasons; a teacher's
// report about a student is written from there or the profile and followed up; a parent's report about a teacher is a
// complaint linked to the student. Staff enter both.

const toast = (page) => page.getByRole('status');

test('a failing student on Prestasi pelajar gets a teacher report, followed up on the profile', async ({ page }) => {
  const data = await api(page.request, 'SUPERVISOR', 'GET', '/students/performance/');
  const row = data.rows.find((r) => r.failing && r.class_code);
  expect(row, 'the demo data has a failing student in a tuition class').toBeTruthy();
  const details = unique('Tidak siap latihan');

  await signInAs(page, 'SUPERVISOR');
  await page.goto('/#/students');
  await page.getByRole('link', { name: 'Prestasi pelajar' }).click(); // in the menu for Supervisor and Management
  await expect(page.getByRole('heading', { name: 'Prestasi pelajar' })).toBeVisible();
  const item = page.getByRole('region', { name: row.class_code }).getByRole('listitem').filter({ hasText: row.name }).filter({ hasText: row.subject });
  await expect(item).toContainText('Gagal');
  await expect(item).toContainText(String(row.mark));
  await item.getByRole('button', { name: 'Laporan guru' }).click();
  const form = page.getByRole('dialog', { name: `Laporan guru: ${row.name}` });
  await form.getByLabel(/^Butiran/).fill(details);
  await form.getByRole('button', { name: 'Simpan laporan' }).click();
  await expect(toast(page).filter({ hasText: 'Laporan guru disimpan' })).toBeVisible();
  await expect(item).toContainText('Laporan guru: Akademik');
  await expect(item).toContainText(details);

  // On the student's profile: comment, then close it with the action taken
  await page.goto(`/#/students/${row.code}?tab=reports`);
  const report = page.getByRole('listitem').filter({ hasText: details });
  await expect(report).toContainText('Akademik');
  await expect(report).toContainText('Baru');
  await report.getByRole('button', { name: /^Komen/ }).click();
  await report.getByLabel('Komen baharu').fill('Ibu bapa dimaklumkan');
  await report.getByRole('button', { name: 'Hantar' }).click();
  await expect(report).toContainText('Ibu bapa dimaklumkan');
  await expect(report.getByRole('button', { name: 'Komen (1)' })).toBeVisible();
  await report.getByRole('button', { name: 'Kemas kini' }).click();
  const action = page.getByRole('dialog', { name: 'Kemas kini tindakan laporan' });
  await action.getByLabel('Status').selectOption('RESOLVED');
  await action.getByLabel('Tindakan diambil').fill('Kelas tambahan dua minggu');
  await action.getByRole('button', { name: 'Simpan' }).click();
  await expect(report).toContainText('Selesai');
  await expect(report).toContainText('Kelas tambahan dua minggu');

  // A resolved report is no longer a reason on Prestasi pelajar
  await page.goto('/#/performance');
  await expect(item).toBeVisible();
  await expect(item).not.toContainText(details);
});

test('a parent\'s report about a teacher is a complaint linked to the student, with comments', async ({ page }) => {
  const students = await api(page.request, 'SUPERVISOR', 'GET', '/students/students/');
  const teachers = await api(page.request, 'SUPERVISOR', 'GET', '/teachers/teachers/');
  const student = students.find((s) => s.status === 'ACTIVE');
  const teacher = teachers.find((t) => t.is_active);
  const what = unique('Kerja rumah tidak disemak');

  await signInAs(page, 'SUPERVISOR');
  await page.goto('/#/teachers?tab=complaints');
  await page.getByRole('button', { name: 'Rekod aduan' }).click();
  const form = page.getByRole('dialog', { name: 'Rekod aduan guru' });
  await form.getByLabel(/^Guru/).selectOption(String(teacher.id));
  await form.getByLabel(/^Daripada/).selectOption('PARENT');
  await form.getByLabel(/^Nama pengadu/).fill('Puan Rohani');
  await form.getByLabel(/^Pelajar berkaitan/).selectOption(String(student.id));
  await form.getByLabel(/^Keterangan/).fill(what);
  await form.getByRole('button', { name: 'Simpan' }).click();
  const row = page.getByRole('row').filter({ hasText: what });
  await expect(row).toContainText('Ibu bapa: Puan Rohani');
  await expect(row).toContainText(student.full_name);

  await row.getByRole('button', { name: 'Komen (0)' }).click();
  const box = page.getByRole('dialog', { name: /^Aduan: Cikgu/ });
  await box.getByRole('button', { name: /^Komen/ }).click();
  await box.getByLabel('Komen baharu').fill('Guru sudah diberi teguran');
  await box.getByRole('button', { name: 'Hantar' }).click();
  await expect(box).toContainText('Guru sudah diberi teguran');
  await box.getByRole('button', { name: 'Tutup' }).last().click();
  await expect(row.getByRole('button', { name: 'Komen (1)' })).toBeVisible();

  // The student's profile lists it beside the teacher reports
  await page.goto(`/#/students/${student.student_id}?tab=reports`);
  await expect(page.getByRole('listitem').filter({ hasText: what })).toContainText('Ibu bapa: Puan Rohani');
});

test('Admin records teacher reports but does not see complaints or Prestasi pelajar', async ({ page }) => {
  const students = await api(page.request, 'ADMIN', 'GET', '/students/students/');
  const student = students.find((s) => s.status === 'ACTIVE');
  await signInAs(page, 'ADMIN');
  await page.goto(`/#/students/${student.student_id}?tab=reports`);
  await expect(page.getByRole('heading', { name: 'Laporan guru tentang pelajar' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Aduan pelajar/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Prestasi pelajar' })).toHaveCount(0);
});
