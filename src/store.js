// Bygglogg – datalager som sparar på servern via API.
// Alla anrop går mot samma origin som appen körs på.

import { startOfDay } from './parser.js';

const DAY_MS = 86400000;
const API_BASE = '';

let state = null;
let authToken = null;
const listeners = new Set();

async function api(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(authToken ? { Authorization: authToken } : {}),
    ...(options.headers || {}),
  };
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });
  if (res.status === 401) {
    // Session utgången – rensa och ladda om till inloggning
    authToken = null;
    localStorage.removeItem('bygglogg.auth');
    if (window.location.pathname !== '/') {
      window.location.hash = '#/';
    }
    throw new Error('Inloggning krävs');
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Fel ${res.status}`);
  }
  return res.json();
}

export async function initStore() {
  // Läs befintlig token från localStorage
  try {
    const raw = localStorage.getItem('bygglogg.auth');
    if (raw) {
      const parsed = JSON.parse(raw);
      authToken = parsed.token;
    }
  } catch {
    /* ignorera */
  }

  // Läs in all data från servern
  const me = await api('/api/me').catch(() => null);
  if (me) {
    auth.token = authToken;
    auth.loggedIn = true;
    auth.currentUserId = me.id;
    auth.email = me.email;
    const [projects, users, templates, activities, entries, timeReports, inspections, drawings, fika, settings] = await Promise.all([
      api('/api/projects'),
      api('/api/users'),
      api('/api/templates'),
      api('/api/activities'),
      api('/api/entries'),
      api('/api/timeReports'),
      api('/api/inspections'),
      api('/api/drawings'),
      api('/api/fika'),
      api('/api/settings'),
    ]);
    state = { projects, users, templates, activities, entries, timeReports, inspections, drawings, fika, settings };
  } else {
    auth.token = null;
    auth.loggedIn = false;
    auth.currentUserId = null;
    auth.email = '';
    state = null;
  }

  if (!state) {
    // Inte inloggad – returnera tomt tillstånd
    state = {
      projects: [],
      users: [],
      templates: [],
      activities: [],
      entries: [],
      timeReports: [],
      inspections: [],
      drawings: [],
      fika: [],
      settings: {
        companyName: 'INCON AB',
        orgNumber: '',
        workdayHours: 8,
        lunchMinutes: 30,
        autoLunch: true,
        weekStart: 1,
        reportLimitDays: 7,
      },
    };
  }

  notifyListeners();
}

function notifyListeners() {
  listeners.forEach((listener) => listener(state));
}

export function getState() {
  return state || {};
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function mutate(fn) {
  if (!state) return;
  const old = JSON.parse(JSON.stringify(state));
  fn(state);
  notifyListeners();
  // Sparningen sker i respektive action-funktion via api()
}

/* ------------------------------------------------------------------ */
/* Auth                                                               */
/* ------------------------------------------------------------------ */

export const auth = {
  token: null,
  loggedIn: false,
  currentUserId: null,
  email: '',

  async login(email, password) {
    const res = await fetch(`${API_BASE}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Inloggning misslyckades' }));
      throw new Error(err.error || 'Inloggning misslyckades');
    }
    const data = await res.json();
    this.token = data.token;
    authToken = data.token;
    this.loggedIn = true;
    this.currentUserId = data.user.id;
    this.email = data.user.email;
    localStorage.setItem('bygglogg.auth', JSON.stringify({ token: data.token }));
    await initStore();
    return true;
  },

  logout() {
    this.token = null;
    authToken = null;
    this.loggedIn = false;
    this.currentUserId = null;
    this.email = '';
    localStorage.removeItem('bygglogg.auth');
    state = null;
    listeners.forEach((listener) => listener(state));
  },

  async setPassword(userId, password) {
    await api(`/api/users/${userId}/password`, {
      method: 'PUT',
      body: JSON.stringify({ password }),
    });
  },
};

/* ------------------------------------------------------------------ */
/* Hjälpare                                                           */
/* ------------------------------------------------------------------ */

export const getUser = (id) => state?.users.find((u) => u.id === id) ?? null;
export const getProject = (id) => state?.projects.find((p) => p.id === id) ?? null;
export const getTemplate = (id) => state?.templates.find((t) => t.id === id) ?? null;
export const getActivity = (id) => state?.activities.find((a) => a.id === id) ?? null;

export const currentUser = () => {
  if (!state || !auth.currentUserId) return null;
  return state.users.find((u) => u.id === auth.currentUserId) ?? null;
};

export const userName = (id) => getUser(id)?.name ?? 'Okänd';
export const projectName = (id) => getProject(id)?.name ?? 'Okänt projekt';
export const activityName = (id) => getActivity(id)?.name ?? '–';

export function accessibleProjects(user = currentUser()) {
  if (!user || !state) return [];
  const active = state.projects.filter((p) => p.status !== 'arkiverad');
  if (user.role === 'admin') return active;
  return active.filter((p) => user.projectIds.includes(p.id));
}

export function scopedProjects(user = currentUser()) {
  if (!state) return [];
  const list = accessibleProjects(user);
  // session lagras inte längre i store, så använd 'all' som default
  return list.filter((p) => p.id === 'all' || true); // alla projekt som användaren har tillgång till
}

export function can(action, user = currentUser()) {
  if (!user) return false;
  const ranks = { admin: 4, arbetsledare: 3, hantverkare: 2, klient: 1 };
  const rank = ranks[user.role] ?? 0;
  switch (action) {
    case 'admin': return rank >= 4;
    case 'writeDaybook': return rank >= 2;
    case 'publishDaybook':
    case 'lockDaybook':
    case 'approveTime':
    case 'signInspection':
    case 'manageProjects': return rank >= 3;
    case 'writeTime': return rank >= 2;
    case 'startInspection': return rank >= 2;
    default: return false;
  }
}

export function canSeeProject(projectId, user = currentUser()) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return user.projectIds?.includes(projectId);
}

export function reportsForWeek(anchorIso, projectIds = null, userId = null) {
  if (!state) return [];
  const start = weekStart(new Date(`${anchorIso}T12:00:00`));
  const end = addDays(start, 7);
  return state.timeReports.filter((report) => {
    const date = new Date(`${report.date}T12:00:00`);
    if (date < start || date >= end) return false;
    if (projectIds && !projectIds.includes(report.projectId)) return false;
    if (userId && report.userId !== userId) return false;
    return true;
  });
}

export function sumMinutes(reports) {
  return (reports || []).reduce((total, r) => total + Number(r.minutes || 0), 0);
}

export function daySummary(dateIso, projectIds) {
  if (!state) return { entries: [], reports: [], minutes: 0, published: false, locked: false };
  const entries = state.entries.filter(
    (e) => e.date === dateIso && projectIds.includes(e.projectId)
  );
  const reports = state.timeReports.filter(
    (r) => r.date === dateIso && projectIds.includes(r.projectId)
  );
  return {
    entries,
    reports,
    minutes: sumMinutes(reports),
    published: entries.length > 0 && entries.every((e) => e.published),
    locked: entries.length > 0 && entries.every((e) => e.locked),
  };
}

export function openDeviations(items = null) {
  if (!state) return [];
  const list = items ?? state.inspections.flatMap((i) => i.items);
  return list.filter((item) => item.result === 'avvikelse' && !item.resolved);
}

export function inspectionProgress(inspection) {
  if (!inspection) return { answered: 0, total: 0, percent: 0 };
  const total = inspection.items.length;
  const answered = inspection.items.filter((i) => i.result).length;
  return { answered, total, percent: total ? Math.round((answered / total) * 100) : 0 };
}

/* ------------------------------------------------------------------ */
/* Actions (alla skickar till servern via API)                        */
/* ------------------------------------------------------------------ */

const nowIso = () => new Date().toISOString();
const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};
export const weekStart = (date = new Date()) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const offset = (d.getDay() + 6) % 7;
  return addDays(d, -offset);
};
export const weekDays = (date = new Date()) => {
  const start = weekStart(date);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
};
const isoDate = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
};

export const actions = {
  addEntry({ projectId, type, text, weather, date, publish = false }) {
    return api('/api/entries', {
      method: 'POST',
      body: JSON.stringify({ projectId, type, text, weather, date, publish }),
    });
  },

  updateEntry(id, patch) {
    return api(`/api/entries/${id}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    });
  },

  deleteEntry(id) {
    return api(`/api/entries/${id}`, { method: 'DELETE' });
  },

  addComment(entryId, text) {
    return api(`/api/entries/${entryId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
  },

  publishDay(projectIds, date) {
    return api('/api/entries/publish', {
      method: 'POST',
      body: JSON.stringify({ projectIds, date }),
    });
  },

  unpublishDay(projectIds, date) {
    return api('/api/entries/unpublish', {
      method: 'POST',
      body: JSON.stringify({ projectIds, date }),
    });
  },

  lockDay(projectIds, date) {
    return api('/api/entries/lock', {
      method: 'POST',
      body: JSON.stringify({ projectIds, date }),
    });
  },

  unlockDay(projectIds, date) {
    return api('/api/entries/unlock', {
      method: 'POST',
      body: JSON.stringify({ projectIds, date }),
    });
  },

  addTimeReport({ projectId, userId, date, minutes, activity, note, status = 'utkast', source = null }) {
    return api('/api/timeReports', {
      method: 'POST',
      body: JSON.stringify({ projectId, userId: userId ?? auth.currentUserId, date, minutes, activity, note, status, source }),
    });
  },

  updateTimeReport(id, patch) {
    return api(`/api/timeReports/${id}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    });
  },

  deleteTimeReport(id) {
    return api(`/api/timeReports/${id}`, { method: 'DELETE' });
  },

  setTimeStatus(id, status) {
    return api(`/api/timeReports/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
  },

  submitWeek(userId, anchorIso) {
    return api('/api/timeReports/submit-week', {
      method: 'POST',
      body: JSON.stringify({ userId, anchorIso }),
    });
  },

  createInspection({ templateId, projectId, date, title, inspectorId }) {
    return api('/api/inspections', {
      method: 'POST',
      body: JSON.stringify({ templateId, projectId, date, title, inspectorId: inspectorId ?? auth.currentUserId }),
    });
  },

  setInspectionItem(inspectionId, itemId, patch) {
    return api(`/api/inspections/${inspectionId}/items/${itemId}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    });
  },

  resolveDeviation(inspectionId, itemId) {
    return api(`/api/inspections/${inspectionId}/items/${itemId}/resolve`, {
      method: 'POST',
    });
  },

  signInspection(id) {
    return api(`/api/inspections/${id}/sign`, {
      method: 'POST',
    });
  },

  deleteInspection(id) {
    return api(`/api/inspections/${id}`, { method: 'DELETE' });
  },

  upsertProject(data) {
    return data.id
      ? api(`/api/projects/${data.id}`, { method: 'PUT', body: JSON.stringify(data) })
      : api('/api/projects', { method: 'POST', body: JSON.stringify(data) });
  },

  upsertUser(data) {
    return data.id
      ? api(`/api/users/${data.id}`, { method: 'PUT', body: JSON.stringify(data) })
      : api('/api/users', { method: 'POST', body: JSON.stringify(data) });
  },

  upsertTemplate(data) {
    return data.id
      ? api(`/api/templates/${data.id}`, { method: 'PUT', body: JSON.stringify(data) })
      : api('/api/templates', { method: 'POST', body: JSON.stringify(data) });
  },

  deleteTemplate(id) {
    return api(`/api/templates/${id}`, { method: 'DELETE' });
  },

  upsertActivity(data) {
    return data.id
      ? api(`/api/activities/${data.id}`, { method: 'PUT', body: JSON.stringify(data) })
      : api('/api/activities', { method: 'POST', body: JSON.stringify(data) });
  },

  deleteActivity(id) {
    return api(`/api/activities/${id}`, { method: 'DELETE' });
  },

  updateSettings(patch) {
    return api('/api/settings', { method: 'PUT', body: JSON.stringify(patch) });
  },

  addPhoto(entityType, entityId, file) {
    return api(`/api/photos/${entityType}/${entityId}`, {
      method: 'POST',
      body: JSON.stringify(file),
    });
  },

  removePhoto(entityType, entityId, photoId) {
    return api(`/api/photos/${entityType}/${entityId}/${photoId}`, { method: 'DELETE' });
  },

  addDrawing(file) {
    return api('/api/drawings', { method: 'POST', body: JSON.stringify(file) });
  },

  deleteDrawing(id) {
    return api(`/api/drawings/${id}`, { method: 'DELETE' });
  },

  addFika(data) {
    return api('/api/fika', { method: 'POST', body: JSON.stringify(data) });
  },

  updateFika(id, patch) {
    return api(`/api/fika/${id}`, { method: 'PUT', body: JSON.stringify(patch) });
  },

  toggleFika(id) {
    return api(`/api/fika/${id}/toggle`, { method: 'POST' });
  },

  deleteFika(id) {
    return api(`/api/fika/${id}`, { method: 'DELETE' });
  },
};

export const photosFor = (entityType, entityId) => {
  if (!state) return [];
  const key = `${entityType}:${entityId}`;
  return state.photos?.[key] ?? [];
};

export const drawingsFor = (projectId = null) => {
  if (!state) return [];
  const list = state.drawings ?? [];
  if (!projectId || projectId === 'all') return list;
  return list.filter((d) => d.projectId === projectId);
};

export const fikaItems = () => state?.fika ?? [];
export const todayIso = () => isoDate(new Date());
export { addDays, isoDate };

export function weekNumber(date = new Date()) {
  const d = startOfDay(date);
  const target = new Date(d.valueOf());
  const dayNr = (d.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const diff = target.valueOf() - firstThursday.valueOf();
  return 1 + Math.round(diff / (7 * DAY_MS));
}

/* ------------------------------------------------------------------ */
/* Konstanter                                                         */
/* ------------------------------------------------------------------ */

export const ENTRY_TYPES = {
  arbete: { label: 'Arbete', tone: 'steel' },
  hinder: { label: 'Hinder', tone: 'bad' },
  material: { label: 'Material', tone: 'primary' },
  besok: { label: 'Besök', tone: 'ok' },
  anteckning: { label: 'Anteckning', tone: 'muted' },
};

export const TIME_STATUS = {
  utkast: { label: 'Utkast', tone: 'muted' },
  inskickad: { label: 'Inskickad', tone: 'steel' },
  godkand: { label: 'Godkänd', tone: 'ok' },
  avvisad: { label: 'Avvisad', tone: 'bad' },
};

export const INSPECTION_RESULTS = {
  godkand: { label: 'Godkänd', tone: 'ok' },
  ej_lamnad: { label: 'Ej lämnad', tone: 'muted' },
  avvikelse: { label: 'Avvikelse', tone: 'bad' },
};

export const WEATHER = ['Sol', 'Halvklart', 'Molnigt', 'Regn', 'Snö', 'Blåst', 'Frost'];

export const ROLES = {
  admin: { label: 'Administratör' },
  arbetsledare: { label: 'Arbetsledare' },
  hantverkare: { label: 'Hantverkare' },
  klient: { label: 'Klient' },
};

/* ------------------------------------------------------------------ */
/* Session preferences (stored in localStorage)                       */
/* ------------------------------------------------------------------ */

export const sessionPrefs = {
  get activeProjectId() {
    try {
      return JSON.parse(localStorage.getItem('bygglogg.sessionPrefs') ?? '{}').activeProjectId ?? 'all';
    } catch { return 'all'; }
  },
  set activeProjectId(v) {
    try {
      const cur = JSON.parse(localStorage.getItem('bygglogg.sessionPrefs') ?? '{}');
      localStorage.setItem('bygglogg.sessionPrefs', JSON.stringify({ ...cur, activeProjectId: v }));
    } catch { /* ignore */ }
  },
  get daybookDate() {
    try {
      return JSON.parse(localStorage.getItem('bygglogg.sessionPrefs') ?? '{}').daybookDate ?? todayIso();
    } catch { return todayIso(); }
  },
  set daybookDate(v) {
    try {
      const cur = JSON.parse(localStorage.getItem('bygglogg.sessionPrefs') ?? '{}');
      localStorage.setItem('bygglogg.sessionPrefs', JSON.stringify({ ...cur, daybookDate: v }));
    } catch { /* ignore */ }
  },
  get weekAnchor() {
    try {
      return JSON.parse(localStorage.getItem('bygglogg.sessionPrefs') ?? '{}').weekAnchor ?? todayIso();
    } catch { return todayIso(); }
  },
  set weekAnchor(v) {
    try {
      const cur = JSON.parse(localStorage.getItem('bygglogg.sessionPrefs') ?? '{}');
      localStorage.setItem('bygglogg.sessionPrefs', JSON.stringify({ ...cur, weekAnchor: v }));
    } catch { /* ignore */ }
  },
  get timeFilter() {
    try {
      return JSON.parse(localStorage.getItem('bygglogg.sessionPrefs') ?? '{}').timeFilter ?? 'alla';
    } catch { return 'alla'; }
  },
  set timeFilter(v) {
    try {
      const cur = JSON.parse(localStorage.getItem('bygglogg.sessionPrefs') ?? '{}');
      localStorage.setItem('bygglogg.sessionPrefs', JSON.stringify({ ...cur, timeFilter: v }));
    } catch { /* ignore */ }
  },
};

export const session = sessionPrefs;
export function setSession(patch) {
  for (const [key, value] of Object.entries(patch)) {
    if (key in sessionPrefs) sessionPrefs[key] = value;
  }
}
