import { useEffect, useState } from 'react';
import { request, tokenStore } from '../api/client';

// The centre's own details, edited by Management in Settings and read from the server.
// CENTRE is one shared object that is updated in place, so messages and printed headers
// built anywhere always use the latest details. These values only show until the server answers.
const PRIVATE = ['tin', 'bank_name', 'bank_account', 'bank_holder'];

export const CENTRE = {
  name: 'Pusat Tuisyen An Nur',
  branch: 'Telipot',
  address: 'Tingkat 1 & 2, PT 105, Seksyen 23, Jalan Telipot, 15150 Kota Bharu, Kelantan',
  phone: '013-983 8085',
  whatsapp: '60139838085',
  email: '',
  tin: '',
  bank_name: '',
  bank_account: '',
  bank_holder: '',
};

const listeners = new Set();
const announce = () => listeners.forEach((bump) => bump((n) => n + 1));

// Staff get the full profile (TIN and bank for receipts); the login page and parents' form get the public part
export async function loadCentre() {
  try {
    Object.assign(CENTRE, await request(tokenStore.get() ? '/centre/profile/' : '/centre/'));
  } catch {
    try {
      Object.assign(CENTRE, await request('/centre/'));
    } catch { /* keep what is shown */ }
  }
  announce();
}

// After logging out the private details must not stay in memory
export function resetCentre() {
  PRIVATE.forEach((key) => { CENTRE[key] = ''; });
  announce();
}

// Re-render when the details change
export function useCentre() {
  const [, bump] = useState(0);
  useEffect(() => {
    listeners.add(bump);
    return () => { listeners.delete(bump); };
  }, []);
  return CENTRE;
}

// "Bayaran boleh dibuat ke Maybank 5140..." for payment reminders, when the bank account has been entered
export function bankLine() {
  if (!CENTRE.bank_account) return '';
  const where = [CENTRE.bank_name, CENTRE.bank_account].filter(Boolean).join(' ');
  return ` Bayaran boleh dibuat ke ${where}${CENTRE.bank_holder ? ` (a/n ${CENTRE.bank_holder})` : ''}.`;
}
