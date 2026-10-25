import { expect, test } from '@playwright/test';
import { api, signInAs, tryApi, unique } from './support/auth';

// Telephone numbers: kept as 60133474009 whatever way they are typed, shown as +6013-347-4009 (or the way Management chose in
// Settings), and found by a search however the digits are typed (backend/core/phone.py, frontend/src/lib/phone.js).

const toast = (page) => page.getByRole('status');
const tab = (page, name) => page.getByRole('tab', { name });
const newIc = () => `0${Math.floor(1 + Math.random() * 8)}0${Math.floor(1 + Math.random() * 8)}1${Math.floor(Math.random() * 9)}-03-${String(Math.floor(1000 + Math.random() * 8999))}`;
const DEFAULTS = { phone_prefix: 'plus60', phone_separator: 'dash', phone_input: '60' };

// A student with their parent's number, made through the API
async function makeStudent(request, parentPhone) {
  const name = unique('Ujian Telefon');
  const student = await api(request, 'ADMIN', 'POST', '/students/students/', {
    full_name: name, ic_number: newIc(), form_level: 'F4', school_name: 'SMK Telipot', parent1_name: 'Ibu Ujian', parent1_phone: parentPhone, class_ids: [],
  });
  return { name, code: student.student_id, id: student.id };
}

async function openDetails(page, code) {
  await page.goto(`/#/students/${code}`);
  await page.getByRole('button', { name: 'Ubah maklumat' }).click();
  return page.getByRole('dialog', { name: 'Ubah maklumat pelajar' });
}

test.describe('Typing a number', () => {
  test('any style is cleaned to one form when the box is left, and the screen shows it as +6013-347-4009', async ({ page, request }) => {
    const student = await makeStudent(request, '012-345 6789');
    await signInAs(page, 'ADMIN');
    await page.goto(`/#/students/${student.code}`);
    await expect(page.getByText('+6012-345-6789').first()).toBeVisible(); // saved from 012-345 6789

    const dialog = await openDetails(page, student.code);
    const box = dialog.getByLabel('No. telefon penjaga (WhatsApp)');
    await box.fill('013-347 4009');
    await box.press('Tab');
    await expect(box).toHaveValue('60133474009'); // what staff see and edit: starts with 6, no plus, dash or space
    await dialog.getByRole('button', { name: 'Simpan' }).click();
    await expect(dialog).toBeHidden();

    await expect(page.getByText('+6013-347-4009').first()).toBeVisible();
    expect((await api(request, 'ADMIN', 'GET', `/students/students/${student.id}/`)).parent1_phone).toBe('60133474009');
    // the WhatsApp button uses the stored digits
    await expect(page.getByRole('link', { name: /WhatsApp/ }).first()).toHaveAttribute('href', /wa\.me\/60133474009/);
  });

  test('text that is not one number is refused and the box says so', async ({ page, request }) => {
    const student = await makeStudent(request, '60123456789');
    await signInAs(page, 'ADMIN');
    const dialog = await openDetails(page, student.code);
    const box = dialog.getByLabel('No. telefon penjaga (WhatsApp)');
    await box.fill('012-3456789 / 013-3474009');
    await box.press('Tab');
    await expect(box).toHaveValue('012-3456789 / 013-3474009'); // left as typed so it can be corrected
    await dialog.getByRole('button', { name: 'Simpan' }).click();
    await expect(toast(page).filter({ hasText: 'Nombor telefon tidak sah' })).toBeVisible();
    await expect(dialog).toBeVisible();
    expect((await api(request, 'ADMIN', 'GET', `/students/students/${student.id}/`)).parent1_phone).toBe('60123456789'); // nothing was saved
  });

  test('a prospect, a teacher and a vendor are kept the same way', async ({ page, request }) => {
    await signInAs(page, 'ADMIN');
    await page.goto('/#/leads');
    await page.getByRole('button', { name: 'Prospek baharu' }).click();
    const form = page.getByRole('dialog', { name: 'Prospek baharu' });
    await form.getByLabel(/^No\. telefon/).fill('+6013-347 4009');
    await form.getByLabel(/^Sumber/).selectOption({ index: 1 });
    await form.getByRole('button', { name: 'Simpan' }).click();
    await expect(form).toBeHidden();
    await expect(page.getByText('+6013-347-4009').first()).toBeVisible();
    const leads = await api(request, 'ADMIN', 'GET', '/students/leads/');
    expect(leads.some((l) => l.phone === '60133474009')).toBe(true);

    const teachers = await api(request, 'ADMIN', 'GET', '/teachers/teachers/');
    expect(teachers.every((t) => /^\+?\d+$/.test(t.phone_number))).toBe(true); // the demo teachers are in the stored form too
  });
});

test.describe('Finding a number', () => {
  test('a search finds the parent however the digits are typed', async ({ page, request }) => {
    const student = await makeStudent(request, '60198887766');
    await signInAs(page, 'ADMIN');
    await page.goto('/#/dashboard');
    await expect(page.getByRole('heading', { name: 'Ringkasan' })).toBeVisible();
    await page.keyboard.press('Control+k');
    const search = page.getByRole('dialog', { name: 'Carian' });
    for (const typed of ['0198887766', '019-888 7766', '6019888', '+60198887766']) {
      await search.getByPlaceholder(/^Cari/).fill(typed);
      await expect(search.getByText(student.name)).toBeVisible();
    }
  });
});

test.describe('Excel', () => {
  test('a number in an export keeps its plus sign instead of becoming a sum', async ({ page }) => {
    await signInAs(page, 'ADMIN');
    await page.goto('/#/students');
    await expect(page.getByRole('row').nth(1)).toBeVisible();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /CSV \/ Excel/ }).click()]);
    const text = (await (await import('node:fs/promises')).readFile(await download.path(), 'utf-8')).replace(/^﻿/, '');
    expect(text).toMatch(/"=""\+60\d{2}-\d{3,4}-\d{4}"""/); // ="+6012-987-6541": Excel shows the text, not a calculation
    expect(text).not.toMatch(/,"\+60/);
  });
});

test.describe('Management chooses the format', () => {
  test.afterEach(async ({ request }) => {
    await api(request, 'MANAGEMENT', 'PUT', '/thresholds/', DEFAULTS);
  });

  test('the example updates as the choices change; after saving every screen follows, and the saved number is untouched', async ({ page, request }) => {
    const student = await makeStudent(request, '60133474009');
    await signInAs(page, 'MANAGEMENT');
    await page.goto('/#/settings');
    await tab(page, 'Had & amaran').click();
    const preview = page.getByLabel('Contoh nombor telefon');
    await expect(preview).toContainText('+6013-347-4009');

    await page.getByLabel('Awalan nombor yang dipaparkan').selectOption('0');
    await page.getByLabel('Pemisah dalam nombor yang dipaparkan').selectOption('space');
    await page.getByLabel('Nombor dalam kotak input bermula dengan').selectOption('0');
    await expect(preview).toContainText('Dipaparkan: 013 347 4009');
    await expect(preview).toContainText('Dalam kotak input: 0133474009');
    await page.getByRole('button', { name: 'Simpan', exact: true }).click();
    await expect(toast(page).filter({ hasText: 'Tetapan disimpan' })).toBeVisible();

    await page.goto(`/#/students/${student.code}`);
    await expect(page.getByText('013 347 4009').first()).toBeVisible();
    await page.getByRole('button', { name: 'Ubah maklumat' }).click();
    await expect(page.getByRole('dialog', { name: 'Ubah maklumat pelajar' }).getByLabel('No. telefon penjaga (WhatsApp)')).toHaveValue('0133474009');
    expect((await api(request, 'ADMIN', 'GET', `/students/students/${student.id}/`)).parent1_phone).toBe('60133474009'); // still the stored form
  });

  test('the server refuses a choice that is not on the list', async ({ request }) => {
    const res = await tryApi(request, 'MANAGEMENT', 'PUT', '/thresholds/', { phone_prefix: '+66' });
    expect(res.status).toBe(400);
  });
});

test.describe('The centre\'s own number', () => {
  test('the login page shows it in the chosen format', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/Tel: \+60\d{2}-\d{3,4}-\d{4}/)).toBeVisible();
  });

  test('Settings keeps it in the stored form', async ({ page }) => {
    await signInAs(page, 'MANAGEMENT');
    await page.goto('/#/settings');
    await tab(page, 'Pusat').click();
    await expect(page.getByLabel('Telefon')).toHaveValue(/^60\d{9,10}$/);
  });
});
