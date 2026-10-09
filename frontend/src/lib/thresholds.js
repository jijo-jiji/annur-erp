import { useEffect, useState } from 'react';
import { request, tokenStore } from '../api/client';

// Voucher approval amounts and alert thresholds, set by Management in Settings and kept on the server.
// THRESHOLDS is one shared object updated in place; these values only show until the server answers.
export const THRESHOLDS = {
  voucher_tier1: 500,
  voucher_tier2: 3000,
  permit_warning_days: 60,
  contract_alert_days: 30,
  birthday_alert_days: 7,
  low_attendance_pct: 70,
  attendance_window_days: 30,
  nearly_full_seats: 2,
  follow_up_days: 7,
  // Upload size limits (MB)
  upload_photo_mb: 5,
  upload_document_mb: 10,
  upload_feedback_mb: 50,
  upload_handout_mb: 25,
  // Names of the lead stages
  lead_label_ENQUIRY: 'Enquiry',
  lead_label_CONTACTED: 'Contacted',
  lead_label_CONTENT_1: 'Content 1',
  lead_label_CONTENT_2: 'Content 2',
  lead_label_TRIAL: 'Free Trial',
  lead_label_WAITING_PAYMENT: 'Waiting Payment',
  lead_label_REGISTERED: 'Registered',
  lead_label_ACTIVE: 'Active',
};

const listeners = new Set();
const announce = () => listeners.forEach((bump) => bump((n) => n + 1));

export async function loadThresholds() {
  if (!tokenStore.get()) return;
  try {
    (await request('/thresholds/')).forEach((t) => { THRESHOLDS[t.name] = t.value; });
  } catch { /* keep the defaults */ }
  announce();
}

// Re-render when a limit changes
export function useThresholds() {
  const [, bump] = useState(0);
  useEffect(() => {
    listeners.add(bump);
    return () => { listeners.delete(bump); };
  }, []);
  return THRESHOLDS;
}

// "RM500", "RM3,000": whole ringgit as the centre writes them in its approval rules
export const ringgit = (value) => `RM${Number(value).toLocaleString('en-MY', { maximumFractionDigits: 2 })}`;
