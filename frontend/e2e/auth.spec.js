import { expect, test } from '@playwright/test';
import { PASSWORD, USERS, signInAs } from './support/auth';

const menu = (page) => page.getByRole('navigation', { name: 'Menu utama' });
const currentPage = (page) => menu(page).locator('[aria-current="page"]');

async function signInThroughTheForm(page, who) {
  await page.goto('/');
  await page.getByLabel('Nama pengguna').fill(USERS[who].username);
  await page.getByLabel('Kata laluan').fill(PASSWORD);
  await page.getByRole('button', { name: 'Log masuk' }).click();
}

test.describe('Log masuk', () => {
  test('the login page names the centre and refuses a wrong password', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Log masuk' })).toBeVisible();
    await expect(page.getByText('Pusat Tuisyen An Nur').first()).toBeVisible();

    await page.getByLabel('Nama pengguna').fill('admin1');
    await page.getByLabel('Kata laluan').fill('not-the-password');
    await page.getByRole('button', { name: 'Log masuk' }).click();

    await expect(page.getByRole('alert')).toContainText('Nama pengguna atau kata laluan tidak betul');
    await expect(page.getByRole('heading', { name: 'Log masuk' })).toBeVisible();
  });

  for (const [who, roleName] of [['ADMIN', 'Admin Kaunter'], ['SUPERVISOR', 'Supervisor'], ['MANAGEMENT', 'Pengurusan']]) {
    test(`${USERS[who].label} signs in and lands on the dashboard`, async ({ page }) => {
      await signInThroughTheForm(page, who);
      await expect(currentPage(page)).toHaveText('Ringkasan');
      // the role is the last line of the signed-in box (a user can be called by the role's name)
      await expect(page.locator('aside').getByText(roleName, { exact: true }).last()).toBeVisible();
    });
  }

  test('signing out returns to the login page and the session is gone', async ({ page }) => {
    await signInThroughTheForm(page, 'ADMIN_SPARE');
    await expect(currentPage(page)).toHaveText('Ringkasan');

    await page.getByRole('button', { name: 'Log keluar' }).click();
    await expect(page.getByRole('heading', { name: 'Log masuk' })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Log masuk' })).toBeVisible();
  });
});

test.describe('What each role sees', () => {
  test('Admin has the counter screens but not reports or teacher pay', async ({ page }) => {
    await signInAs(page, 'ADMIN');
    await page.goto('/');
    for (const name of ['Pelajar', 'Yuran & resit', 'Baucar bayaran', 'Tetapan']) {
      await expect(menu(page).getByRole('link', { name, exact: true })).toBeVisible();
    }
    for (const name of ['Laporan', 'Gaji guru']) {
      await expect(menu(page).getByRole('link', { name, exact: true })).toHaveCount(0);
    }
  });

  for (const who of ['SUPERVISOR', 'MANAGEMENT']) {
    test(`${USERS[who].label} also sees reports and teacher pay`, async ({ page }) => {
      await signInAs(page, who);
      await page.goto('/');
      for (const name of ['Laporan', 'Gaji guru', 'Tetapan']) {
        await expect(menu(page).getByRole('link', { name, exact: true })).toBeVisible();
      }
    });
  }

  test('typing the address of a screen the role may not open falls back to the dashboard', async ({ page }) => {
    await signInAs(page, 'ADMIN');
    await page.goto('/#/payroll');
    await expect(currentPage(page)).toHaveText('Ringkasan');
  });

  test('the server refuses what the screen hides, even when asked directly', async ({ page }) => {
    await signInAs(page, 'ADMIN');
    await page.goto('/');
    const token = await page.evaluate(() => localStorage.getItem('annur_auth_token'));
    const headers = { Authorization: `Token ${token}` };
    const get = (url) => page.request.get(`/api/v1${url}`, { headers });
    expect((await get('/auth/accounts/')).status()).toBe(403); // logins are Management's
    expect((await get('/reports/summary/')).status()).toBe(403);
    // Admin reads the centre profile (receipts print the TIN) but only Management changes it
    expect((await get('/centre/profile/')).status()).toBe(200);
    const change = await page.request.put('/api/v1/centre/profile/', { headers, data: { tin: 'C1234567890' } });
    expect(change.status()).toBe(403);
  });
});
