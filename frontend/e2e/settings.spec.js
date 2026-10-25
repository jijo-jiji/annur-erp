import { expect, test } from '@playwright/test';
import { api, openAs, signInAs, tryApi, unique } from './support/auth';

// Management's customisation: the centre changes its own rules without the developer, and every
// change keeps the maker-checker order (Admin asks, Supervisor decides, Management has the last word).

const tab = (page, name) => page.getByRole('tab', { name });
const toast = (page) => page.getByRole('status');
const row = (page, text) => page.getByRole('row').filter({ hasText: text });

test.describe('Approval requests', () => {
  test('Admin asks for a new subject; it exists only after the Supervisor approves', async ({ page, browser }) => {
    const name = unique('Ekonomi E2E');
    const code = `E${Math.random().toString(36).replace(/[^a-z]/g, '').slice(0, 4).toUpperCase().padEnd(4, 'Q')}`;

    // Admin asks
    await signInAs(page, 'ADMIN');
    await page.goto('/#/settings');
    await page.getByRole('button', { name: 'Mohon subjek baharu' }).click();
    const form = page.getByRole('dialog', { name: /subjek/i });
    await form.getByLabel('Kod').fill(code);
    await form.getByLabel('Nama subjek').fill(name);
    await form.getByLabel('Peringkat').selectOption({ index: 1 });
    await form.getByLabel('Aliran').selectOption({ index: 1 });
    await form.getByLabel(/^Kategori/).selectOption('TERAS');
    await form.getByLabel('Sebab permohonan').fill('Kelas baharu bermula bulan depan');
    await form.locator('button[type="submit"]').click();
    await expect(toast(page).filter({ hasText: 'Permohonan dihantar' })).toBeVisible();
    await expect(row(page, name)).toHaveCount(0); // not in the subject list yet
    await expect(page.getByText(name).first()).toBeVisible(); // but visible as a waiting request

    // The server does not list it as a live subject
    const subjects = await api(page.request, 'ADMIN', 'GET', '/business-config/subjects/');
    expect(subjects.some((s) => s.code === code)).toBe(false);

    // Admin cannot approve their own request
    const requests = await api(page.request, 'ADMIN', 'GET', '/change-requests/?kind=SUBJECT');
    const mine = requests.find((r) => r.payload?.name === name);
    expect(mine.can_decide).toBe(false);
    const own = await tryApi(page.request, 'ADMIN', 'POST', `/change-requests/${mine.id}/approve/`, {});
    expect(own.status).toBe(403);

    // Supervisor decides, in their own window
    const supervisor = await openAs(browser, 'SUPERVISOR');
    await supervisor.page.goto('/#/settings');
    await expect(supervisor.page.getByText(name).first()).toBeVisible();
    await supervisor.page.getByRole('button', { name: 'Luluskan' }).first().click();
    await expect(toast(supervisor.page).filter({ hasText: 'Permohonan diluluskan' })).toBeVisible();
    await expect(row(supervisor.page, name)).toContainText('Aktif');
    await supervisor.close();

    const after = await api(page.request, 'ADMIN', 'GET', '/business-config/subjects/');
    expect(after.some((s) => s.code === code && s.name === name)).toBe(true);
  });

  test('a rejected request says why and changes nothing', async ({ page, request }) => {
    const name = unique('Subjek ditolak');
    const code = `R${Math.random().toString(36).replace(/[^a-z]/g, '').slice(0, 4).toUpperCase().padEnd(4, 'Q')}`;
    await api(request, 'ADMIN', 'POST', '/change-requests/', {
      kind: 'SUBJECT', action: 'CREATE', payload: { code, name, level_category: 'LOWER_SEC', stream: 'TERAS' }, note: 'Cubaan',
    });
    await signInAs(page, 'SUPERVISOR');
    await page.goto('/#/settings');
    const waiting = page.getByText(name).first();
    await expect(waiting).toBeVisible();
    await page.getByRole('button', { name: 'Tolak' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Tolak permohonan' });
    await dialog.getByLabel('Sebab penolakan').fill('Subjek ini tidak ditawarkan');
    await dialog.locator('button[type="submit"]').click();
    await expect(toast(page).filter({ hasText: /ditolak/i })).toBeVisible();

    const subjects = await api(request, 'ADMIN', 'GET', '/business-config/subjects/');
    expect(subjects.some((s) => s.code === code)).toBe(false);
  });
});

test.describe('Policy set by Management', () => {
  // These tests change a setting that the voucher tests rely on, so every test puts it back
  test.afterEach(async ({ request }) => {
    await api(request, 'MANAGEMENT', 'PUT', '/thresholds/', { voucher_tier1: 500, voucher_tier2: 3000 });
  });

  test('lowering the counter limit sends a RM300 voucher to the Supervisor instead of the counter', async ({ page, request, browser }) => {
    await signInAs(page, 'MANAGEMENT');
    await page.goto('/#/settings');
    await tab(page, 'Had & amaran').click();
    await page.getByLabel('Baucar di bawah amaun ini disahkan oleh Admin').fill('200');
    await page.getByRole('button', { name: 'Simpan', exact: true }).click();
    await expect(toast(page).filter({ hasText: 'Tetapan disimpan' })).toBeVisible();

    const description = unique('E2E had baharu');
    const [vendor] = await api(request, 'ADMIN', 'GET', '/expenses/vendors/');
    await api(request, 'ADMIN', 'POST', '/expenses/vouchers/', {
      vendor: vendor.id, category: 'Utiliti', amount: 300, items_description: description, payment_method: 'CASH',
    });

    const admin = await openAs(browser, 'ADMIN');
    await admin.page.goto('/#/vouchers');
    await expect(row(admin.page, description)).toContainText('Menunggu supervisor');
    await admin.close();
  });

  test('a limit that would break the order of approvals is refused', async ({ page }) => {
    await signInAs(page, 'MANAGEMENT');
    await page.goto('/#/settings');
    await tab(page, 'Had & amaran').click();
    await page.getByLabel('Baucar di bawah amaun ini disahkan oleh Admin').fill('9000');
    await page.getByRole('button', { name: 'Simpan', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'mesti lebih tinggi' })).toBeVisible();
  });

  test('Admin and Supervisor can read the limits but not change them', async ({ request }) => {
    for (const who of ['ADMIN', 'SUPERVISOR']) {
      const read = await tryApi(request, who, 'GET', '/thresholds/');
      expect(read.status).toBe(200);
      const write = await tryApi(request, who, 'PUT', '/thresholds/', { voucher_tier1: 100 });
      expect(write.status).toBe(403);
    }
  });
});

test.describe('Centre details', () => {
  test('Management saves the TIN and bank details; they survive a reload and Admin has no tab for them', async ({ page, browser }) => {
    await signInAs(page, 'MANAGEMENT');
    await page.goto('/#/settings');
    await tab(page, 'Pusat').click();
    await expect(page.getByLabel('Nama pusat')).toHaveValue('Pusat Tuisyen An Nur'); // the saved details have loaded
    await page.getByLabel('No. TIN').fill('C 2345678901');
    await page.getByLabel('Bank', { exact: true }).fill('Bank Islam');
    await page.getByLabel('No. akaun bank').fill('1234 5678 9012');
    await page.getByLabel('Nama pemegang akaun').fill('Pusat Tuisyen An Nur');
    await page.getByRole('button', { name: 'Simpan', exact: true }).click();
    await expect(toast(page).filter({ hasText: /disimpan/i })).toBeVisible();

    await page.reload();
    await tab(page, 'Pusat').click();
    await expect(page.getByLabel('No. TIN')).toHaveValue('C 2345678901');
    await expect(page.getByLabel('No. akaun bank')).toHaveValue('1234 5678 9012');
    await expect(page.getByText('C 2345678901').first()).toBeVisible(); // the change history names it

    // Admin has no tab to change these
    const admin = await openAs(browser, 'ADMIN');
    await admin.page.goto('/#/settings');
    await expect(tab(admin.page, 'Subjek')).toBeVisible();
    await expect(tab(admin.page, 'Pusat')).toHaveCount(0);
    await admin.close();
  });
});

test.describe('Logins', () => {
  test('Management creates a login; the person must choose their own password at first sign-in', async ({ page, browser }) => {
    const username = `e2e.${Date.now().toString(36)}`.slice(0, 30);
    await signInAs(page, 'MANAGEMENT');
    await page.goto('/#/settings');
    await tab(page, 'Pengguna').click();
    await page.getByRole('button', { name: 'Akaun baharu' }).click();
    const form = page.getByRole('dialog', { name: 'Akaun baharu' });
    await form.getByLabel('Nama pengguna').fill(username);
    await form.getByLabel('Nama penuh').fill('Penguji Satu');
    await form.getByLabel('Peranan').selectOption({ label: 'Admin' });
    await form.locator('button[type="submit"]').click();

    // The temporary password is shown once
    const shown = page.getByRole('dialog', { name: 'Kata laluan sementara' });
    await expect(shown).toBeVisible();
    const temporary = (await shown.locator('p.font-mono').nth(1).textContent()).trim();
    expect(temporary.length).toBeGreaterThanOrEqual(10);
    await shown.getByRole('button', { name: 'Selesai' }).click();
    await expect(row(page, username)).toContainText('Kata laluan sementara');

    // The new person signs in with it and is stopped at the choose-a-password screen
    const person = await browser.newContext({ baseURL: test.info().project.use.baseURL });
    const fresh = await person.newPage();
    await fresh.goto('/');
    await fresh.getByLabel('Nama pengguna').fill(username);
    await fresh.getByLabel('Kata laluan').fill(temporary);
    await fresh.getByRole('button', { name: 'Log masuk' }).click();
    await expect(fresh.getByRole('heading', { name: 'Pilih kata laluan baharu' })).toBeVisible();
    await expect(fresh.getByRole('navigation', { name: 'Menu utama' })).toHaveCount(0);

    const chosen = `Pilihan-Sendiri-${Date.now().toString(36)}`;
    await fresh.getByLabel('Kata laluan semasa').fill(temporary);
    await fresh.getByLabel(/^Kata laluan baharu/).fill(chosen);
    await fresh.getByLabel('Ulang kata laluan baharu').fill(chosen);
    await fresh.getByRole('button', { name: 'Tukar kata laluan' }).click();
    await expect(fresh.getByRole('navigation', { name: 'Menu utama' })).toBeVisible();
    await expect(fresh.getByRole('link', { name: 'Gaji guru', exact: true })).toHaveCount(0); // an Admin login
    await person.close();

    // And the old temporary password no longer works
    const stale = await tryApi(page.request, 'MANAGEMENT', 'POST', '/auth/login/', { username, password: temporary });
    expect(stale.status).toBe(400);
  });
});
