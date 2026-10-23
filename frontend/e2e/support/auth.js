// Shared helpers: who the test users are and how a test signs in.
import { test } from '@playwright/test';

export const PASSWORD = 'E2e-Test-Pass-2026';

// The demo logins created by `seed_data`. admin2 is kept for the sign-out test, because signing out
// ends every session of that user and would break the other tests that reuse a token.
export const USERS = {
  ADMIN: { username: 'admin1', label: 'Admin' },
  ADMIN_SPARE: { username: 'admin2', label: 'Admin' },
  SUPERVISOR: { username: 'supervisor', label: 'Supervisor' },
  MANAGEMENT: { username: 'management', label: 'Management' },
};

const TOKEN_KEY = 'annur_auth_token';
const tokens = new Map();

async function tokenFor(request, who) {
  if (!tokens.has(who)) {
    const res = await request.post('/api/v1/auth/login/', { data: { username: USERS[who].username, password: PASSWORD } });
    if (!res.ok()) throw new Error(`Could not sign in as ${who}: ${res.status()} ${await res.text()}`);
    tokens.set(who, (await res.json()).token);
  }
  return tokens.get(who);
}

// Start a page already signed in (skips the login screen, which has its own tests)
export async function signInAs(page, who) {
  const token = await tokenFor(page.request, who);
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [TOKEN_KEY, token]);
}

// A second browser window for another user. It has its own storage, so two people can be signed in at once
// without one overwriting the other's session.
export async function openAs(browser, who) {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, timezoneId: 'Asia/Kuala_Lumpur' });
  const page = await context.newPage();
  await signInAs(page, who);
  return { page, close: () => context.close() };
}

// Call the API as a user and report what came back, for tests that check the server's refusals
export async function tryApi(request, who, method, url, data) {
  const token = await tokenFor(request, who);
  const res = await request.fetch(`/api/v1${url}`, { method, data, headers: { Authorization: `Token ${token}` } });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; } // a 404 page is HTML, not JSON
  return { status: res.status(), ok: res.ok(), body };
}

// Call the API as a user to prepare data a test needs (not the thing the test is checking)
export async function api(request, who, method, url, data) {
  const res = await tryApi(request, who, method, url, data);
  if (!res.ok) throw new Error(`${method} ${url} as ${who} failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

// A value that is different on every run, so records made by one run cannot be mistaken for another's
export const unique = (prefix) => `${prefix} ${Date.now().toString(36)}`;
