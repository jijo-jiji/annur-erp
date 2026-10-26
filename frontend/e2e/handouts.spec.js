import { expect, test } from '@playwright/test';
import { api, signInAs, unique } from './support/auth';

// Phase G: a handout belongs to a real class and the date it is handed out in. Copies start from the class's students;
// who has a copy comes from that class's attendance, and the counter records copies given later.

const DAYS = ['AHAD', 'ISNIN', 'SELASA', 'RABU', 'KHAMIS', 'JUMAAT', 'SABTU'];
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

test('a handout for a class: absent students wait for a copy until the counter gives one', async ({ page }) => {
  const classes = await api(page.request, 'ADMIN', 'GET', '/academic/timetable/');
  const students = await api(page.request, 'ADMIN', 'GET', '/students/students/');
  const closed = new Set((await api(page.request, 'ADMIN', 'GET', '/academic/closed-dates/')).map((c) => c.date));
  // a class with at least two active students, and the last day it met, with the centre open and no attendance yet
  const inClass = (c) => students.filter((s) => s.status === 'ACTIVE' && s.enrolled_classes.includes(c.id)).sort((a, b) => a.full_name.localeCompare(b.full_name));
  const cls = classes.find((c) => inClass(c).length >= 2);
  const kids = inClass(cls);
  const taken = new Set((await api(page.request, 'ADMIN', 'GET', `/attendance/sessions/?class_id=${cls.id}`)).map((s) => s.date));
  const day = new Date();
  do day.setDate(day.getDate() - 1); while (DAYS[day.getDay()] !== cls.day || closed.has(iso(day)) || taken.has(iso(day)));
  const title = unique('Nota E2E');

  await signInAs(page, 'ADMIN');
  await page.goto('/#/handouts');
  await page.getByRole('button', { name: 'Rekod handout' }).click();
  const form = page.getByRole('dialog', { name: 'Rekod handout kelas' });
  await form.getByLabel('Tajuk modul / nota').fill(title);
  await form.getByLabel(/^Kelas/).selectOption(String(cls.id));
  await expect(form.getByLabel('Bilangan salinan')).toHaveValue(String(kids.length)); // one for each active student
  await form.getByLabel('Tarikh kelas').fill(iso(day));
  await form.getByRole('button', { name: 'Simpan' }).click();
  const row = page.getByRole('row').filter({ hasText: title });
  await expect(row).toContainText(`0/${kids.length} terima`);
  await expect(row).toContainText(cls.class_code);

  // That day's attendance: the first student came, the second did not
  await api(page.request, 'ADMIN', 'POST', '/attendance/roster/', {
    class_id: cls.id, date: iso(day), marks: kids.map((k, i) => ({ student: k.id, present: i !== 1 })),
  });
  await page.reload();
  await expect(row).toContainText(`${kids.length - 1}/${kids.length} terima`);
  await expect(row).toContainText('1 belum');

  await row.getByRole('button', { name: /terima/ }).click(); // the tally opens the received list
  const list = page.getByRole('dialog', { name: `Senarai terima: ${title}` });
  const item = (k) => list.getByRole('listitem').filter({ hasText: k.full_name });
  await expect(item(kids[0])).toContainText('Terima di kelas');
  await expect(item(kids[1])).toContainText('Belum terima');
  await expect(item(kids[1])).toContainText('Tidak hadir');
  await item(kids[1]).getByRole('button', { name: 'Tandakan diterima' }).click(); // the parent collects it at the counter
  await expect(item(kids[1])).toContainText('Diberi kemudian');
  await list.getByRole('button', { name: 'Tutup' }).first().click();
  await expect(row).toContainText('Lengkap');

  // The student's profile shows the handouts of their classes
  await page.goto(`/#/students/${kids[1].student_id}?tab=classes`);
  const card = page.getByRole('listitem').filter({ hasText: title });
  await expect(card).toContainText('Diberi kemudian');
  await card.getByRole('button', { name: 'Batal' }).click(); // recorded by mistake
  await expect(card).toContainText('Tidak hadir');
  await expect(card.getByRole('button', { name: 'Tandakan diterima' })).toBeVisible();
});
