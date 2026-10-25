import { expect, test } from '@playwright/test';
import { signInAs } from './support/auth';

// Every student figure on Ringkasan opens the list behind it, and the list holds exactly that many students.
// (The rule is shared with the server: students/drilldown.py.)

const MONTHS = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogo', 'Sep', 'Okt', 'Nov', 'Dis'];
const bar = (page) => page.getByRole('region', { name: 'Penapis dari paparan' });

// The list has answered, and it agrees with the figure that opened it (the bar says so when it does not)
async function agrees(page) {
  await expect(bar(page)).not.toContainText('Memuatkan');
  await expect(bar(page)).not.toContainText('menunjukkan');
}

// The student rows on the list (not the header)
async function studentRows(page) {
  await expect(bar(page)).not.toContainText('Memuatkan');
  return page.locator('table tbody tr').count();
}

async function openDetailedDashboard(page, who) {
  await signInAs(page, who);
  await page.addInitScript(() => localStorage.setItem('annur-dashboard-view', 'detailed'));
  await page.goto('/#/dashboard');
  await expect(page.getByText('Jumlah pelajar', { exact: true }).first()).toBeVisible();
}

// The number a card shows, read from the link the card is
async function cardNumber(page, label) {
  const name = await page.getByRole('link', { name: new RegExp(`^${label}: \\d+$`) }).getAttribute('aria-label');
  return Number(name.split(': ')[1]);
}

test.describe('Figures open the students they count', () => {
  for (const [label, chips] of [
    ['Jumlah pelajar', ['Berdaftar']],
    ['Aktif bulanan', ['Aktif', 'Bulanan']],
    ['Walk-in aktif', ['Aktif', 'Walk-in']],
    ['Ditangguh', ['Ditangguh']],
    ['Tidak aktif', ['Tidak aktif']],
  ]) {
    test(`"${label}" opens a list of exactly that many students`, async ({ page }) => {
      await openDetailedDashboard(page, 'MANAGEMENT');
      const shown = await cardNumber(page, label);
      await page.getByRole('link', { name: `${label}: ${shown}` }).click();

      await expect(page).toHaveURL(/#\/students\?/);
      await expect(bar(page)).toContainText('Dari Ringkasan');
      for (const chip of chips) await expect(bar(page)).toContainText(chip);
      await expect(bar(page)).toContainText(`${shown} pelajar`);
      await agrees(page); // the figure and the list agree
      if (shown === 0) await expect(page.getByText('Tiada pelajar ditemui')).toBeVisible();
      else expect(await studentRows(page)).toBe(shown);
    });
  }

  test('a slice of the tingkatan chart opens the active students of that tingkatan', async ({ page }) => {
    await openDetailedDashboard(page, 'ADMIN');
    const slice = page.locator('li a', { hasText: /^Tingkatan 5/ }).first(); // the chart's legend row for that slice
    const count = Number(await slice.locator('span').nth(2).textContent()); // colour, label, count, percentage
    await slice.click();
    await expect(bar(page)).toContainText('Aktif');
    await expect(bar(page)).toContainText('Tingkatan 5');
    await expect(bar(page)).toContainText(`${count} pelajar`);
    expect(await studentRows(page)).toBe(count);
    for (const cell of await page.locator('table tbody tr').allTextContents()) expect(cell).toContain('Tingkatan 5');
  });

  test('a bar of the monthly chart opens the students on the books on the last day of that month', async ({ page }) => {
    await openDetailedDashboard(page, 'SUPERVISOR');
    const year = new Date().getFullYear();
    const month = MONTHS[new Date().getMonth()];
    const link = page.getByRole('link', { name: new RegExp(`^${month} ${year}: \\d+$`) });
    await expect(link).toBeVisible();
    const value = Number((await link.getAttribute('aria-label')).split(': ')[1]);
    await link.click();
    await expect(bar(page)).toContainText('Pada');
    await expect(bar(page)).toContainText(`${value} pelajar`);
    await agrees(page);
    expect(await studentRows(page)).toBe(value);
  });

  test('the length-of-study bars and the status slices open their students too', async ({ page }) => {
    await openDetailedDashboard(page, 'MANAGEMENT');
    const stay = page.locator('a', { hasText: /^(< 3 bulan|3 - 6 bulan|6 - 12 bulan|1 - 2 tahun|> 2 tahun)/ }).filter({ hasText: /[1-9]\d*$/ }).first();
    const total = Number((await stay.textContent()).trim().match(/(\d+)$/)[1]);
    await stay.click();
    await expect(bar(page)).toContainText('Tempoh belajar');
    await expect(bar(page)).toContainText(`${total} pelajar`);
    expect(await studentRows(page)).toBe(total);

    await page.goBack();
    await expect(page.getByText('Status pelajar', { exact: true })).toBeVisible();
    await page.locator('a', { hasText: /^Aktif\s*\d+/ }).first().click();
    await expect(bar(page)).toContainText('Aktif');
    await agrees(page);
  });

  test('in the short view the active students and the two small figures under it open their lists', async ({ page }) => {
    await signInAs(page, 'SUPERVISOR');
    await page.addInitScript(() => localStorage.setItem('annur-dashboard-view', 'simple'));
    await page.goto('/#/dashboard');
    const card = page.getByRole('link', { name: /^Pelajar aktif: \d+$/ });
    const active = Number((await card.getAttribute('aria-label')).split(': ')[1]);
    await card.click();
    await expect(bar(page)).toContainText(`${active} pelajar`);
    await page.goBack();

    await page.getByRole('link', { name: /baharu bulan ini$/ }).click();
    await expect(bar(page)).toContainText(/Daftar/);
    await agrees(page);
    await page.goBack();

    await page.getByRole('link', { name: /ditangguh$/ }).click();
    await expect(bar(page)).toContainText('Ditangguh');
    await agrees(page);
  });

  test('"Perlu tindakan": students without this month\'s invoice open that very list', async ({ page }) => {
    await signInAs(page, 'SUPERVISOR');
    await page.goto('/#/dashboard');
    const row = page.getByRole('link', { name: /pelajar aktif belum ada invois/ });
    await expect(row).toBeVisible();
    const waiting = Number((await row.textContent()).match(/(\d+) pelajar aktif belum ada invois/)[1]);
    await row.click();
    await expect(bar(page)).toContainText('Belum ada invois');
    await expect(bar(page)).toContainText(`${waiting} pelajar`);
    expect(await studentRows(page)).toBe(waiting);
  });
});

test.describe('The filter bar', () => {
  test('says where the list came from, can be removed, and leads back to the dashboard', async ({ page }) => {
    await openDetailedDashboard(page, 'MANAGEMENT');
    await page.getByRole('link', { name: /^Aktif bulanan: \d+$/ }).click();
    await expect(bar(page)).toBeVisible();
    // while the figure's filter is on, the screen's own status and tingkatan filters step aside
    await expect(page.getByLabel('Tapis tingkatan')).toHaveCount(0);

    await bar(page).getByRole('button', { name: 'Buang penapis' }).click();
    await expect(bar(page)).toHaveCount(0);
    await expect(page.getByLabel('Tapis tingkatan')).toBeVisible();
    await expect(page).toHaveURL(/#\/students$/);

    await page.goBack();
    await bar(page).getByRole('link', { name: 'Kembali ke Ringkasan' }).click();
    await expect(page).toHaveURL(/#\/dashboard/);
  });

  test('says so when the figure and the list disagree, instead of hiding it', async ({ page }) => {
    await signInAs(page, 'ADMIN');
    await page.goto('/#/students?status=ACTIVE&src=ringkasan&expect=999');
    await expect(bar(page)).toContainText('Ringkasan menunjukkan 999');
  });

  test('a figure can be opened by keyboard', async ({ page }) => {
    await openDetailedDashboard(page, 'ADMIN');
    const card = page.getByRole('link', { name: /^Jumlah pelajar: \d+$/ });
    await card.focus();
    await page.keyboard.press('Enter');
    await expect(bar(page)).toContainText('Berdaftar');
  });
});
