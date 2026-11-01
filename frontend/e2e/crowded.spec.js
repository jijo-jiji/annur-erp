import { expect, test } from '@playwright/test';
import { api, signInAs } from './support/auth';

// A class over its seat limit is allowed on purpose (the counter can still add a student). Ringkasan tells staff when a
// class has become crowded, how far over it is and how many are waiting, so they can decide to open a new class.

const bar = (page) => page.getByRole('region', { name: 'Penapis dari paparan' });

let prepared;
// A class with one seat, two students put in over the limit and one more waiting for a place
function prepareCrowdedClass(request) {
  prepared ??= (async () => {
    const students = (await api(request, 'ADMIN', 'GET', '/students/students/')).filter((s) => s.status === 'ACTIVE');
    const subjects = await api(request, 'ADMIN', 'GET', '/business-config/subjects/');
    const slots = await api(request, 'ADMIN', 'GET', '/academic/time-slots/');
    const room = (await api(request, 'ADMIN', 'GET', '/academic/classrooms/'))[0];
    const cls = await api(request, 'MANAGEMENT', 'POST', '/academic/timetable/', {
      slot: slots[0].id, subject: subjects.find((s) => s.code === 'SAINS_P').id, form_level: 'S6', section: 'D', max_seats: 1, classroom: room.id,
    });
    const enrol = (student, extra = {}) => api(request, 'SUPERVISOR', 'POST', `/students/students/${student.id}/enroll/`, { class_id: cls.id, ...extra });
    await enrol(students[0], { allow_over_capacity: true });
    await enrol(students[1], { allow_over_capacity: true }); // one over its single seat
    await enrol(students[2]); // no place left: waits
    return cls;
  })();
  return prepared;
}

test.describe('A crowded class', () => {
  test.beforeEach(async ({ request }) => { await prepareCrowdedClass(request); });

  test('the row says how far over the class is, who waits, and that a new class could be opened', async ({ page }) => {
    await signInAs(page, 'ADMIN');
    await page.addInitScript(() => localStorage.setItem('annur-dashboard-view', 'simple'));
    await page.goto('/#/dashboard');
    const row = page.getByRole('link', { name: /SAINS_P.*: 2 pelajar, 1 kerusi \(\+1\)/ });
    await expect(row).toBeVisible();
    await expect(row).toContainText('Kelas sesak');
    await expect(row).toContainText('pertimbang buka kelas baharu');
    await expect(row).toContainText('1 pelajar menunggu');

    // it opens that class in the timetable
    await row.click();
    await expect(page).toHaveURL(/#\/timetable\?/);
    await expect(bar(page)).toContainText('Satu kelas');
    await expect(bar(page)).toContainText('1 kelas');
    await expect(bar(page)).not.toContainText('menunjukkan');
  });

  test('the capacity card in the detailed view shows how many are waiting', async ({ page }) => {
    await signInAs(page, 'SUPERVISOR');
    await page.addInitScript(() => localStorage.setItem('annur-dashboard-view', 'detailed'));
    await page.goto('/#/dashboard');
    const card = page.getByRole('link').filter({ hasText: 'SAINS_P' }).filter({ hasText: 'Lebih 1' }); // the card, not the row in Perlu tindakan
    await expect(card).toContainText('1 menunggu');
  });

  test('the server sends the most crowded class first, with its waiting list', async ({ request }) => {
    const classes = (await api(request, 'SUPERVISOR', 'GET', '/dashboard/summary/')).classes;
    const gaps = classes.over.map((c) => c.available_seats);
    expect(gaps).toEqual([...gaps].sort((a, b) => a - b));
    const mine = classes.over.find((c) => c.class_code.includes('SAINS_P'));
    expect(mine).toMatchObject({ enrolled: 2, max_seats: 1, available_seats: -1, waiting: 1 });
  });
});
