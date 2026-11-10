// Små UI-hjälpare: escaping, datum, dialoger och notiser.

import { formatDuration } from './parser.js';

const ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ESCAPES[ch]);

export function parseIso(iso) {
  return new Date(`${iso}T12:00:00`);
}

export function formatDate(iso, { weekday = true, year = false } = {}) {
  if (!iso) return '–';
  const date = parseIso(iso);
  return date
    .toLocaleDateString('sv-SE', {
      ...(weekday ? { weekday: 'short' } : {}),
      day: 'numeric',
      month: 'short',
      ...(year ? { year: 'numeric' } : {}),
    })
    .replace('.', '');
}

export function formatLongDate(iso) {
  if (!iso) return '–';
  const value = parseIso(iso).toLocaleDateString('sv-SE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function formatDateTime(isoDateTime) {
  if (!isoDateTime) return '–';
  const date = new Date(isoDateTime);
  return `${date.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })} ${date
    .toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}`;
}

export function timeOf(isoDateTime) {
  if (!isoDateTime) return '';
  return new Date(isoDateTime).toLocaleTimeString('sv-SE', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function avatar(name, large = false) {
  return `<span class="avatar${large ? ' lg' : ''}" title="${esc(name)}">${esc(initials(name))}</span>`;
}

export function badge(label, tone = 'muted') {
  return `<span class="badge badge-${tone}">${esc(label)}</span>`;
}

export function duration(minutes) {
  return formatDuration(minutes);
}

export function toast(message, tone = '') {
  let host = document.querySelector('.toasts');
  if (!host) {
    host = document.createElement('div');
    host.className = 'toasts';
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    document.body.append(host);
  }
  const node = document.createElement('div');
  node.className = `toast ${tone}`;
  node.textContent = message;
  host.append(node);
  window.setTimeout(() => node.remove(), 3200);
}

export function closeDialogs() {
  document.querySelectorAll('dialog[data-app-dialog]').forEach((dialog) => dialog.remove());
}

/**
 * Öppnar en modal med given HTML. Submit i formuläret skickas till onSubmit.
 * @returns {HTMLDialogElement}
 */
export function openDialog({ title, body, footer = '', onSubmit = null, size = '' }) {
  closeDialogs();
  const dialog = document.createElement('dialog');
  dialog.dataset.appDialog = 'true';
  if (size) dialog.style.width = size;
  dialog.innerHTML = `
    <form method="dialog" novalidate>
      <div class="dialog-head">
        <h2>${esc(title)}</h2>
        <button type="button" class="btn btn-ghost btn-icon" data-close aria-label="Stäng">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg>
        </button>
      </div>
      <div class="dialog-body">${body}</div>
      ${footer ? `<div class="dialog-foot">${footer}</div>` : ''}
    </form>
  `;
  document.body.append(dialog);

  dialog.querySelectorAll('[data-close]').forEach((button) => {
    button.addEventListener('click', () => dialog.remove());
  });
  let backdropPointerDown = false;
  dialog.addEventListener('pointerdown', (event) => {
    backdropPointerDown = event.target === dialog;
  });
  dialog.addEventListener('click', (event) => {
    const intentionalBackdropClick = event.target === dialog && backdropPointerDown;
    backdropPointerDown = false;
    if (intentionalBackdropClick) dialog.remove();
  });
  dialog.addEventListener('close', () => dialog.remove());

  const form = dialog.querySelector('form');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!onSubmit) {
      dialog.close();
      return;
    }
    const data = Object.fromEntries(new FormData(form).entries());
    const submit = form.querySelector('button[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      const keepOpen = await onSubmit(data, form, dialog);
      if (keepOpen !== false) dialog.close();
    } catch (error) {
      toast(error?.message || 'Kunde inte spara ändringen.', 'bad');
    } finally {
      if (dialog.open && submit) submit.disabled = false;
    }
  });

  dialog.showModal();
  const firstField = dialog.querySelector('input:not([type="hidden"]), select, textarea');
  if (firstField) firstField.focus();
  return dialog;
}

/** Läser ett formulär som objekt, med trimning av strängar. */
export function formValues(form) {
  const data = {};
  for (const [key, value] of new FormData(form).entries()) {
    data[key] = typeof value === 'string' ? value.trim() : value;
  }
  return data;
}

export function debounce(fn, wait = 120) {
  let timer = null;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait);
  };
}

export function groupBy(items, keyFn) {
  const map = new Map();
  items.forEach((item) => {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  });
  return map;
}
