import { useEffect, useState } from 'react';
import { request, tokenStore } from '../api/client';

// The wording of the WhatsApp messages staff send, edited by Management in Settings and kept on the server.
// The screen fills in the {placeholders}; the program only opens WhatsApp, staff press send.
const TEXTS = {};
const listeners = new Set();
const announce = () => listeners.forEach((bump) => bump((n) => n + 1));

export async function loadMessages() {
  try {
    if (tokenStore.get()) {
      (await request('/messages/')).forEach((m) => { TEXTS[m.key] = m.text; });
    } else {
      Object.assign(TEXTS, await request('/messages/public/'));
    }
  } catch {
    try {
      Object.assign(TEXTS, await request('/messages/public/'));
    } catch { /* keep what is loaded */ }
  }
  announce();
}

export function resetMessages() {
  Object.keys(TEXTS).forEach((k) => { delete TEXTS[k]; });
  announce();
}

// Re-render when the wording changes
export function useMessages() {
  const [, bump] = useState(0);
  useEffect(() => {
    listeners.add(bump);
    return () => { listeners.delete(bump); };
  }, []);
}

// The message for `key` with each {placeholder} replaced by its value; a placeholder with no value is left as written
export function fillMessage(key, values = {}) {
  return String(TEXTS[key] ?? '').replace(/\{(\w+)\}/g, (match, name) => (name in values ? String(values[name] ?? '') : match));
}
