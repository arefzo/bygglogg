// Bygglogg – appens skal, navigation och routing.

import { icon, inconLogo } from './icons.js';
import {
  ROLES,
  accessibleProjects,
  can,
  currentUser,
  getState,
  initStore,
  scopedProjects,
  sessionPrefs,
  subscribe,
  todayIso,
  weekNumber,
} from './store.js';
import { closeDialogs, formatDate, formatLongDate, esc } from './ui.js';
import { renderDashboard, mountDashboard } from './views/dashboard.js';
import { renderDaybook, mountDaybook } from './views/daybook.js';
import { renderTime, mountTime } from './views/time.js';
import {
  renderInspections,
  mountInspections,
  renderInspectionDetail,
  mountInspectionDetail,
} from './views/inspections.js';
import { renderAdmin, mountAdmin } from './views/admin.js';
import { renderDrawings, mountDrawings } from './views/drawings.js';
import { renderFika, mountFika } from './views/fika.js';
import { renderLogin, mountLogin } from './views/login.js';
import { auth } from './store.js';

const app = document.querySelector('#app');

const NAV = [
  { section: 'oversikt', label: 'Översikt', href: '#/oversikt', iconName: 'home' },
  { section: 'dagbok', label: 'Byggdagbok', href: '#/dagbok', iconName: 'book' },
  { section: 'tid', label: 'Tidsrapportering', href: '#/tid', iconName: 'clock' },
  { section: 'skyddsrond', label: 'Skyddsrond', href: '#/skyddsrond', iconName: 'shield' },
  { section: 'fika', label: 'Fika / Att göra', href: '#/fika', iconName: 'check' },
  { section: 'ritningar', label: 'Ritningar', href: '#/ritningar', iconName: 'download' },
  { section: 'admin', label: 'Administration', href: '#/admin/projekt', iconName: 'sliders', admin: true },
];

let lastRouteKey = null;

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, queryString = ''] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  return {
    section: parts[0] ?? 'oversikt',
    param: parts[1] ?? null,
    query: new URLSearchParams(queryString),
    key: `${parts[0] ?? 'oversikt'}/${parts[1] ?? ''}`,
  };
}

function routeTitle(route) {
  switch (route.section) {
    case 'dagbok':
      return 'Dagbok';
    case 'tid':
      return 'Tid';
    case 'skyddsrond':
      return route.param ? 'Skyddsrond' : 'Skyddsronder';
    case 'fika':
      return 'Fika';
    case 'ritningar':
      return 'Ritningar';
    case 'admin':
      return 'Admin';
    default:
      return 'Översikt';
  }
}

function shell(route, viewHtml) {
  const state = getState();
  const user = currentUser();
  const projects = accessibleProjects(user);
  const scoped = scopedProjects(user);
  const today = todayIso();
  const draftsToday = state.entries.filter(
    (entry) =>
      entry.date === today &&
      scoped.some((project) => project.id === entry.projectId) &&
      !entry.published,
  ).length;
  const deviations = state.inspections
    .filter((inspection) => scoped.some((project) => project.id === inspection.projectId))
    .flatMap((inspection) => inspection.items)
    .filter((item) => item.result === 'avvikelse' && !item.resolved).length;

  const badges = {
    dagbok: draftsToday,
    skyddsrond: deviations,
  };

  const navItems = NAV.filter((item) => {
    if (item.admin && !can('admin', user)) return false;
    if (item.section === 'tid' && user.role === 'klient') return false;
    return true;
  });

  return `
    <div class="shell">
      <header class="topbar">
        <a class="brand" href="#/oversikt" aria-label="Bygglogg – översikt">
          <span class="brand-mark">${inconLogo({ width: 60, height: 32 })}</span>
          <span>
            <span class="brand-name">Bygglogg</span>
            <span class="brand-sub">Dagbok · Tid · Skydd</span>
          </span>
        </a>
        <div class="topbar-spacer"></div>
        ${
          projects.length > 1
            ? `<label class="topbar-field">
                <span>Projekt</span>
                <select class="select-quiet" data-project-select aria-label="Filtrera på projekt">
                  <option value="all"${sessionPrefs.activeProjectId === 'all' ? ' selected' : ''}>Alla projekt</option>
                  ${projects
                    .map(
                      (project) =>
                        `<option value="${project.id}"${
                          sessionPrefs.activeProjectId === project.id ? ' selected' : ''
                        }>${esc(`${project.number} · ${project.name}`)}</option>`,
                    )
                    .join('')}
                </select>
              </label>`
            : ''
        }
        <span class="topbar-date">${esc(formatDate(today))} · v.${weekNumber()}</span>
        <div class="topbar-user">
          <span class="muted nowrap">${esc(user.name)}</span>
          <button class="btn btn-ghost btn-sm" data-logout title="Logga ut" aria-label="Logga ut">
            ${icon('logout', 14)}
          </button>
        </div>
      </header>

      <div class="layout">
        <aside class="sidebar">
          <div class="nav-label">Arbetsyta</div>
          ${navItems
            .map(
              (item) => `<a class="nav-link${
                route.section === item.section ? ' active' : ''
              }" href="${item.href}">
                ${icon(item.iconName, 17)}
                <span>${esc(item.label)}</span>
                ${
                  badges[item.section]
                    ? `<span class="nav-badge${item.section === 'skyddsrond' ? ' alert' : ''}">${badges[item.section]}</span>`
                    : ''
                }
              </a>`,
            )
            .join('')}
          <div class="sidebar-foot">
            <strong>${esc(state.settings.companyName)}</strong>
            <span>${esc(user.name)} · ${esc(ROLES[user.role]?.label ?? user.role)}</span>
            <span style="margin-top:8px">Data sparas säkert på servern</span>
          </div>
        </aside>

        <main class="main">
          <div class="page">${viewHtml}</div>
        </main>
      </div>
    </div>
    <div class="toasts" role="status" aria-live="polite"></div>
  `;
}

function notFound() {
  return `<header class="page-head">
    <div>
      <div class="eyebrow">404</div>
      <h1>Sidan hittades inte</h1>
      <p class="page-sub">Adressen finns inte i appen.</p>
    </div>
  </header>
  <a class="btn btn-primary" href="#/oversikt">Till översikten</a>`;
}

function render() {
  if (!auth.loggedIn) {
    closeDialogs();
    app.innerHTML = renderLogin();
    mountLogin(app);
    document.title = 'Inloggning · Bygglogg';
    if (lastRouteKey !== 'login') {
      window.scrollTo({ top: 0, behavior: 'auto' });
      lastRouteKey = 'login';
    }
    return;
  }

  const route = parseHash();

  // Djuplänk till dagbok: #/dagbok?datum=2026-10-28
  if (route.section === 'dagbok') {
    const datum = route.query.get('datum');
    if (datum && /^\d{4}-\d{2}-\d{2}$/.test(datum) && datum !== sessionPrefs.daybookDate) {
      sessionPrefs.daybookDate = datum;
    }
  }

  let viewHtml = '';
  let mount = null;

  switch (route.section) {
    case 'dagbok':
      viewHtml = renderDaybook();
      mount = () => mountDaybook(app);
      break;
    case 'tid':
      viewHtml = renderTime();
      mount = () => mountTime(app);
      break;
    case 'skyddsrond':
      if (route.param) {
        viewHtml = renderInspectionDetail(route.param);
        mount = () => mountInspectionDetail(app, route.param);
      } else {
        viewHtml = renderInspections();
        mount = () => mountInspections(app);
      }
      break;
    case 'admin':
      viewHtml = renderAdmin(route.param ?? 'projekt');
      mount = () => mountAdmin(app, route.param ?? 'projekt');
      break;
    case 'fika':
      viewHtml = renderFika();
      mount = () => mountFika(app);
      break;
    case 'ritningar':
      viewHtml = renderDrawings();
      mount = () => mountDrawings(app);
      break;
    case 'oversikt':
      viewHtml = renderDashboard();
      mount = () => mountDashboard(app);
      break;
    default:
      viewHtml = notFound();
  }

  closeDialogs();
  app.innerHTML = shell(route, viewHtml);

  // Gemensamma kontroller i toppmenyn
  app.querySelector('[data-project-select]')?.addEventListener('change', (event) => {
    sessionPrefs.activeProjectId = event.target.value;
  });

  app.querySelector('[data-logout]')?.addEventListener('click', async () => {
    try {
      await auth.logout();
    } catch {
      // ignore logout errors
    }
    toast('Du är utloggad.');
    window.dispatchEvent(new Event('hashchange'));
  });

  mount?.();

  document.title = `${routeTitle(route)} · Bygglogg`;

  if (lastRouteKey !== route.key) {
    window.scrollTo({ top: 0, behavior: 'auto' });
    lastRouteKey = route.key;
  }
}

async function initApp() {
  await initStore();
  
  subscribe(() => render());
  window.addEventListener('hashchange', render);

  if (!location.hash) {
    window.location.hash = '#/oversikt';
  } else {
    render();
  }

  // Liten välkomstnotis första gången i sessionen.
  if (auth.loggedIn && !sessionStorage.getItem('bygglogg.welcome')) {
    sessionStorage.setItem('bygglogg.welcome', '1');
    window.setTimeout(() => {
      const toastHost = document.querySelector('.toasts');
      if (!toastHost) return;
      const node = document.createElement('div');
      node.className = 'toast';
      node.textContent = `Välkommen, ${currentUser().name} (${ROLES[currentUser().role]?.label ?? currentUser().role}).`;
      toastHost.append(node);
      window.setTimeout(() => node.remove(), 4200);
    }, 500);
  }

  console.info(
    `Bygglogg · ${formatLongDate(todayIso())} · ${getState().projects.length} projekt`,
  );
}

initApp();
