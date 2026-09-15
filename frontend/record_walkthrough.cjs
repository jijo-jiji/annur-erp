const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

(async () => {
  const recordingsDir = path.join(__dirname, 'recordings');
  if (!fs.existsSync(recordingsDir)) {
    fs.mkdirSync(recordingsDir, { recursive: true });
  }

  console.log('Launching browser with 1280x720 video recording...');
  const browser = await chromium.launch({
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: {
      dir: recordingsDir,
      size: { width: 1280, height: 720 },
    },
  });

  const page = await context.newPage();

  // Auto-accept alert dialogs so they don't freeze the automation
  page.on('dialog', async (dialog) => {
    console.log('Dialog opened:', dialog.message());
    await sleep(1000);
    await dialog.accept();
  });

  console.log('Navigating to ERP application...');
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForLoadState('networkidle');

  // ==========================================
  // SCENE 1: LOGIN SCREEN (Figma Design)
  // ==========================================
  console.log('SCENE 1: Showcasing Login Screen...');
  await sleep(2500);

  // Hover over quick demo cards to show micro-interactions
  const quickCards = page.locator('.grid.grid-cols-2 button');
  if (await quickCards.count() >= 4) {
    await quickCards.nth(0).hover();
    await sleep(1000);
    await quickCards.nth(1).hover();
    await sleep(1000);
    await quickCards.nth(2).hover();
    await sleep(1000);
    await quickCards.nth(3).hover();
    await sleep(1000);
  }

  // ==========================================
  // SCENE 2: HOW STUDENT & PARENT SEES IT
  // ==========================================
  console.log('SCENE 2: Entering Student & Parent Portal...');
  // Click "Pelajar / Ibu Bapa" quick card
  await page.locator('text=Pelajar / Ibu Bapa').click();
  await sleep(2500);

  // Showcase Weekly Timetable
  console.log('Student: Viewing Enrolled Classes...');
  await page.evaluate(() => window.scrollBy({ top: 300, behavior: 'smooth' }));
  await sleep(2000);
  await page.evaluate(() => window.scrollBy({ top: -300, behavior: 'smooth' }));
  await sleep(1500);

  // Switch to Yuran & Resit Rasmi
  console.log('Student: Viewing Invoices & Receipts...');
  await page.locator('text=Yuran & Resit Rasmi').click();
  await sleep(2500);

  // Switch to Prestasi & Keputusan (SAPS)
  console.log('Student: Viewing Exam Results...');
  await page.locator('text=Prestasi & Keputusan (SAPS)').click();
  await sleep(2500);

  // Switch to Borang Pendaftaran Baru (QR)
  console.log('Student: Viewing Parent Self-Registration Form...');
  await page.locator('text=Borang Pendaftaran Baru (QR)').click();
  await sleep(2000);
  await page.evaluate(() => window.scrollBy({ top: 350, behavior: 'smooth' }));
  await sleep(2000);
  await page.evaluate(() => window.scrollBy({ top: -350, behavior: 'smooth' }));
  await sleep(1500);

  // Logout back to Login Screen
  console.log('Logging out of Student Portal...');
  await page.locator('text=Keluar').click();
  await sleep(2000);

  // ==========================================
  // SCENE 3: HOW ADMIN SEES IT (Kaunter & Operasi)
  // ==========================================
  console.log('SCENE 3: Entering Admin Portal...');
  await page.locator('text=Admin').first().click();
  await sleep(2500);

  // Dashboard Overview
  console.log('Admin: Inspecting Dashboard KPIs & Alerts...');
  await page.evaluate(() => window.scrollBy({ top: 300, behavior: 'smooth' }));
  await sleep(2500);
  await page.evaluate(() => window.scrollBy({ top: -300, behavior: 'smooth' }));
  await sleep(1500);

  // Student Directory & Checklist
  console.log('Admin: Navigating to Pendaftaran & Pelajar...');
  await page.locator('text=Pendaftaran & Pelajar').click();
  await sleep(2500);

  // Toggle checklist button (AT)
  const checklistBtn = page.locator('table button').first();
  if (await checklistBtn.isVisible()) {
    await checklistBtn.click();
    await sleep(1500);
  }

  // View New Registration Form
  console.log('Admin: Opening Registration Form...');
  await page.locator('text=+ Borang Pendaftaran Baru').click();
  await sleep(2000);
  await page.evaluate(() => window.scrollBy({ top: 400, behavior: 'smooth' }));
  await sleep(2500);
  await page.evaluate(() => window.scrollBy({ top: 400, behavior: 'smooth' }));
  await sleep(2500);
  await page.evaluate(() => window.scrollBy({ top: -800, behavior: 'smooth' }));
  await sleep(1500);

  // Master Timetable 2026
  console.log('Admin: Navigating to Jadual Master 2026...');
  await page.locator('text=Jadual Master 2026').click();
  await sleep(2500);
  // Filter by Saturday
  await page.getByRole('button', { name: 'SABTU', exact: true }).click();
  await sleep(2000);
  // Filter by Monday
  await page.getByRole('button', { name: 'ISNIN', exact: true }).click();
  await sleep(2000);
  // Filter back to All
  await page.getByRole('button', { name: 'Semua Hari', exact: true }).click();
  await sleep(2000);

  // Billing & Receipts
  console.log('Admin: Navigating to Yuran & Resit Rasmi...');
  await page.locator('aside >> text=Yuran & Resit Rasmi').click();
  await sleep(2500);

  // Test Calculator
  console.log('Admin: Testing Fee Calculator...');
  const calcSelect = page.locator('select').first();
  await calcSelect.selectOption('DARJAH_5');
  await sleep(2000);
  await calcSelect.selectOption('SECONDARY');
  await sleep(2000);

  // Click Pay with QR
  console.log('Admin: Opening DuitNow QR modal...');
  const payBtn = page.locator('text=Bayar Sekarang (QR)').first();
  if (await payBtn.isVisible()) {
    await payBtn.click();
    await sleep(2500);
    await page.locator('text=Sahkan Bayaran').click();
    await sleep(2000);
  }

  // Print Receipt modal
  console.log('Admin: Viewing Official Printable Receipt...');
  const printBtn = page.locator('text=Cetak Resit').first();
  if (await printBtn.isVisible()) {
    await printBtn.click();
    await sleep(2500);
    await page.locator('text=Tutup').click();
    await sleep(1500);
  }

  // Catatan Pembatalan & Gantian
  console.log('Admin: Navigating to Catatan Pembatalan & Ganti...');
  await page.locator('text=Catatan Pembatalan & Ganti').click();
  await sleep(2500);

  // Teachers Directory
  console.log('Admin: Navigating to Elaun & Guru 2026...');
  await page.locator('text=Elaun & Guru 2026').click();
  await sleep(2500);
  await page.getByRole('button', { name: /Cikgu Ganti Aktif/ }).click();
  await sleep(2000);
  await page.getByRole('button', { name: /Cikgu Permanent/ }).click();
  await sleep(2000);

  // ==========================================
  // SCENE 4: HOW MANAGER SEES IT (Directors & No-Code Hub)
  // ==========================================
  console.log('SCENE 4: Switching to Management Role...');
  await page.locator('header >> text=Management (Pengarah)').click();
  await sleep(2500);

  // Payment Vouchers (PV)
  console.log('Manager: Navigating to Baucar Bayaran (PV)...');
  await page.locator('text=Baucar Bayaran (PV)').click();
  await sleep(2500);

  // Management Configuration Hub (No-Code Self-Service Engine)
  console.log('Manager: Opening Tetapan Perniagaan (No-Code Hub)...');
  await page.locator('text=Tetapan Perniagaan').click();
  await sleep(2500);

  // Sub-tab: Kadar Yuran & Pakej
  console.log('Manager: Editing Pricing Packages...');
  await page.getByRole('button', { name: 'Kadar Yuran & Pakej' }).click();
  await sleep(2500);

  // Sub-tab: Polisi & Elaun Guru
  console.log('Manager: Editing Operational Policies & Teacher Rates...');
  await page.getByRole('button', { name: 'Polisi & Elaun Guru' }).click();
  await sleep(2500);

  // Final Scene: Logout back to Login Page
  console.log('Manager: Logging out to Login Screen...');
  await page.locator('text=Keluar').click();
  await sleep(3000);

  console.log('Finished walkthrough recording. Closing browser context...');
  await page.close();
  await context.close();
  await browser.close();

  console.log('Recording session successfully saved in recordings directory!');
})();