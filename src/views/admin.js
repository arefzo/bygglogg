// Administration – projekt, användare, mallar, aktiviteter och inställningar.

import {
  ROLES,
  actions,
  auth,
  can,
  currentUser,
  getState,
  todayIso,
} from '../store.js';
import { badge, esc, formatDate, openDialog, toast } from '../ui.js';
import { icon } from '../icons.js';

const TABS = [
  { id: 'projekt', label: 'Projekt' },
  { id: 'anvandare', label: 'Användare' },
  { id: 'mallar', label: 'Ronds mallar' },
  { id: 'aktiviteter', label: 'Aktiviteter' },
  { id: 'installningar', label: 'Inställningar' },
];

function pageHead(activeTab, counts) {
  return `
    <header class="page-head">
      <div>
        <div class="eyebrow">Administration</div>
        <h1>Admin</h1>
        <p class="page-sub">${counts.projects} projekt · ${counts.users} användare · ${counts.templates} rondmallar. Allt sparas lokalt i webbläsaren.</p>
      </div>
      <div class="page-actions">${tabAction(activeTab)}</div>
    </header>
    <div class="tabs">
      ${TABS.map(
        (tab) =>
          `<a class="tab${tab.id === activeTab ? ' active' : ''}" href="#/admin/${tab.id}">${esc(
            tab.label,
          )}</a>`,
      ).join('')}
    </div>
  `;
}

function tabAction(tab) {
  switch (tab) {
    case 'projekt':
      return '<button class="btn btn-primary" data-new-project>Nytt projekt</button>';
    case 'anvandare':
      return '<button class="btn btn-primary" data-new-user>Ny användare</button>';
    case 'mallar':
      return '<button class="btn btn-primary" data-new-template>Ny mall</button>';
    case 'aktiviteter':
      return '<button class="btn btn-primary" data-new-activity>Ny aktivitet</button>';
    default:
      return '';
  }
}

/* ------------------------------- projekt ----------------------------- */

function projectDialog(project = null) {
  const body = `
    <div class="form-grid">
      <div class="field">
        <label for="pj-number">Projektnummer</label>
        <input id="pj-number" class="input" name="number" value="${esc(project?.number ?? '')}" placeholder="2404" />
      </div>
      <div class="field">
        <label for="pj-status">Status</label>
        <select id="pj-status" class="select" name="status">
          ${['aktiv', 'avslutad', 'arkiverad']
            .map(
              (status) =>
                `<option value="${status}"${(project?.status ?? 'aktiv') === status ? ' selected' : ''}>${status[0].toUpperCase() + status.slice(1)}</option>`,
            )
            .join('')}
        </select>
      </div>
      <div class="field span-2">
        <label for="pj-name">Projektnamn</label>
        <input id="pj-name" class="input" name="name" value="${esc(project?.name ?? '')}" placeholder="Storgatan 14 – Nybyggnad" />
      </div>
      <div class="field span-2">
        <label for="pj-client">Beställare</label>
        <input id="pj-client" class="input" name="client" value="${esc(project?.client ?? '')}" placeholder="Företag eller förening" />
      </div>
      <div class="field span-2">
        <label for="pj-address">Adress</label>
        <input id="pj-address" class="input" name="address" value="${esc(project?.address ?? '')}" placeholder="Gata, ort" />
      </div>
      <div class="field">
        <label for="pj-start">Startdatum</label>
        <input id="pj-start" type="date" class="input" name="startDate" value="${esc(project?.startDate ?? todayIso())}" />
      </div>
      <div class="field">
        <label for="pj-end">Slutdatum</label>
        <input id="pj-end" type="date" class="input" name="endDate" value="${esc(project?.endDate ?? '')}" />
      </div>
    </div>
  `;
  openDialog({
    title: project ? 'Redigera projekt' : 'Nytt projekt',
    body,
    footer: `<div class="row">
      <button type="button" class="btn" data-close>Avbryt</button>
      <button type="submit" class="btn btn-primary">${project ? 'Spara' : 'Skapa projekt'}</button>
    </div>`,
    onSubmit: async (data) => {
      if (!data.name?.trim()) {
        toast('Projektnamn krävs.', 'bad');
        return false;
      }
      await actions.upsertProject({
        ...(project ? { id: project.id } : {}),
        number: data.number?.trim() ?? '',
        name: data.name.trim(),
        client: data.client?.trim() ?? '',
        address: data.address?.trim() ?? '',
        status: data.status ?? 'aktiv',
        startDate: data.startDate ?? '',
        endDate: data.endDate ?? '',
      });
      toast(project ? 'Projektet uppdaterat.' : 'Projektet skapat.', 'ok');
      return true;
    },
  });
}

function projectsTab() {
  const state = getState();
  return `
    <section class="card">
      <div class="card-head">
        <h2>Projekt</h2>
        <span class="hint">${state.projects.filter((project) => project.status === 'aktiv').length} aktiva</span>
      </div>
      <div class="card-body tight">
        <div class="table-wrap">
          <table class="table">
            <thead><tr>
              <th>Nr</th><th>Projekt</th><th>Beställare</th><th>Period</th><th>Status</th><th></th>
            </tr></thead>
            <tbody>
              ${state.projects
                .map(
                  (project) => `<tr>
                    <td class="mono">${esc(project.number)}</td>
                    <td>
                      <div class="strong">${esc(project.name)}</div>
                      <div class="small muted">${esc(project.address)}</div>
                    </td>
                    <td class="small">${esc(project.client)}</td>
                    <td class="small muted nowrap">${esc(formatDate(project.startDate, { weekday: false }))} – ${esc(
                      project.endDate ? formatDate(project.endDate, { weekday: false }) : 'pågår',
                    )}</td>
                    <td>${
                      project.status === 'aktiv'
                        ? badge('Aktiv', 'ok')
                        : project.status === 'avslutad'
                          ? badge('Avslutad', 'muted')
                          : badge('Arkiverad', 'steel')
                    }</td>
                    <td>
                      <div class="table-actions">
                        <button class="btn btn-ghost btn-icon btn-sm" data-edit-project="${project.id}" title="Redigera" aria-label="Redigera projekt">${icon('edit', 14)}</button>
                      </div>
                    </td>
                  </tr>`,
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  `;
}

/* ------------------------------ användare ---------------------------- */

function userDialog(user = null) {
  const state = getState();
  const projects = state.projects.filter((project) => project.status !== 'arkiverad');
  const body = `
    <div class="form-grid">
      <div class="field span-2">
        <label for="us-name">Namn</label>
        <input id="us-name" class="input" name="name" value="${esc(user?.name ?? '')}" placeholder="För- och efternamn" />
      </div>
      <div class="field span-2">
        <label for="us-email">E-post</label>
        <input id="us-email" type="email" class="input" name="email" value="${esc(user?.email ?? '')}" placeholder="namn@foretag.se" />
      </div>
      <div class="field">
        <label for="us-password">Lösenord${
          user ? ' (lämna tomt för att behålla nuvarande)' : ''
        }</label>
        <input id="us-password" type="password" class="input" name="password" placeholder="••••••••" />
      </div>
      <div class="field">
        <label for="us-role">Roll</label>
        <select id="us-role" class="select" name="role">
          ${Object.entries(ROLES)
            .map(
              ([value, role]) =>
                `<option value="${value}"${(user?.role ?? 'hantverkare') === value ? ' selected' : ''}>${esc(
                  role.label,
                )}</option>`,
            )
            .join('')}
        </select>
      </div>
      <div class="field">
        <label for="us-active">Status</label>
        <select id="us-active" class="select" name="active">
          <option value="true"${user?.active !== false ? ' selected' : ''}>Aktiv</option>
          <option value="false"${user?.active === false ? ' selected' : ''}>Inaktiv</option>
        </select>
      </div>
    </div>
    <div class="field">
      <span class="field-label">Projektåtkomst</span>
      <div class="stack" style="gap:6px;max-height:220px;overflow:auto">
        ${projects
          .map(
            (project) => `<label class="check">
              <input type="checkbox" name="projectIds" value="${project.id}"${
                user?.projectIds?.includes(project.id) ? ' checked' : ''
              } />
              <span>${esc(`${project.number} · ${project.name}`)}</span>
            </label>`,
          )
          .join('')}
      </div>
      <span class="hint">Administratörer ser alla projekt oavsett val.</span>
    </div>
  `;
  openDialog({
    title: user ? 'Redigera användare' : 'Ny användare',
    body,
    footer: `<div class="row">
      <button type="button" class="btn" data-close>Avbryt</button>
      <button type="submit" class="btn btn-primary">${user ? 'Spara' : 'Skapa användare'}</button>
    </div>`,
    onSubmit: async (data, form) => {
      if (!data.name?.trim() || !data.email?.trim()) {
        toast('Namn och e-post krävs.', 'bad');
        return false;
      }
      if (!user && !data.password?.trim()) {
        toast('Lösenord krävs för en ny användare.', 'bad');
        return false;
      }
      const projectIds = [...form.querySelectorAll('input[name="projectIds"]:checked')].map(
        (input) => input.value,
      );
      const savedUser = await actions.upsertUser({
        ...(user ? { id: user.id } : {}),
        name: data.name.trim(),
        email: data.email.trim(),
        role: data.role ?? 'hantverkare',
        active: data.active !== 'false',
        projectIds,
      });
      if (data.password?.trim()) await auth.setPassword(savedUser.id, data.password.trim());
      toast(user ? 'Användaren uppdaterad.' : 'Användaren skapad.', 'ok');
      return true;
    },
  });
}

function usersTab() {
  const state = getState();
  return `
    <div class="grid grid-main">
      <section class="card">
        <div class="card-head">
          <h2>Användare</h2>
          <span class="hint">${state.users.filter((user) => user.active).length} aktiva</span>
        </div>
        <div class="card-body tight">
          <div class="table-wrap">
            <table class="table">
              <thead><tr><th>Namn</th><th>Roll</th><th>Projekt</th><th>Status</th><th></th></tr></thead>
              <tbody>
                ${state.users
                  .map((user) => {
                    const visible = user.role === 'admin' ? state.projects : state.projects.filter((project) => user.projectIds.includes(project.id));
                    return `<tr>
                      <td>
                        <div class="strong">${esc(user.name)}</div>
                        <div class="small muted">${esc(user.email)}</div>
                      </td>
                      <td>
                        <select class="select input-sm" data-user-role="${user.id}" aria-label="Roll för ${esc(user.name)}">
                          ${Object.entries(ROLES)
                            .map(
                              ([value, role]) =>
                                `<option value="${value}"${user.role === value ? ' selected' : ''}>${esc(
                                  role.label,
                                )}</option>`,
                            )
                            .join('')}
                        </select>
                      </td>
                      <td class="small muted">${
                        user.role === 'admin'
                          ? 'Alla projekt'
                          : visible.length
                            ? esc(
                                visible
                                  .slice(0, 2)
                                  .map((project) => project.name.split('–')[0].trim())
                                  .join(', ') + (visible.length > 2 ? ` +${visible.length - 2}` : ''),
                              )
                            : '–'
                      }</td>
                      <td>${
                        user.active ? badge('Aktiv', 'ok') : badge('Inaktiv', 'muted')
                      }</td>
                      <td>
                        <div class="table-actions">
                          <button class="btn btn-ghost btn-icon btn-sm" data-edit-user="${user.id}" title="Redigera" aria-label="Redigera användare">${icon('edit', 14)}</button>
                          <button class="btn btn-danger btn-icon btn-sm" data-delete-user="${user.id}" title="Ta bort" aria-label="Ta bort användare">${icon('trash', 14)}</button>
                        </div>
                      </td>
                    </tr>`;
                  })
                  .join('')}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card-head"><h2>Roller</h2></div>
        <div class="card-body stack" style="gap:14px">
          ${Object.entries(ROLES)
            .map(
              ([key, role]) => `<div>
                <div class="row" style="gap:8px;margin-bottom:3px">
                  ${badge(role.label, key === 'admin' ? 'primary' : 'steel')}
                </div>
                <p class="small muted">${
                  key === 'admin'
                    ? 'Full åtkomst: projekt, användare, mallar och inställningar.'
                    : key === 'arbetsledare'
                      ? 'Publicerar och låser dagboken, godkänner tid och signerar ronder.'
                      : key === 'hantverkare'
                        ? 'Skriver dagbok och tid, genomför ronder men signerar inte.'
                        : 'Läser publicerade dagboksinlägg och ronder för sina projekt.'
                }</p>
              </div>`,
            )
            .join('')}
        </div>
      </section>
    </div>
  `;
}

/* ------------------------------- mallar ------------------------------ */

function templateRow(item = { group: '', label: '' }) {
  return `<div class="row" data-row style="gap:6px">
    <input class="input input-sm" data-group placeholder="Grupp" value="${esc(item.group)}" style="max-width:150px" />
    <input class="input input-sm" data-label placeholder="Kontrollpunkt" value="${esc(item.label)}" style="flex:1" />
    <button type="button" class="btn btn-ghost btn-icon btn-sm" data-remove-row title="Ta bort" aria-label="Ta bort punkt">${icon('x', 14)}</button>
  </div>`;
}

function templateDialog(template = null) {
  const items = template?.items?.length ? template.items : [{ group: '', label: '' }];
  const body = `
    <div class="field">
      <label for="tp-name">Namn</label>
      <input id="tp-name" class="input" name="name" value="${esc(template?.name ?? '')}" placeholder="Skyddsrond – Bas" />
    </div>
    <div class="field">
      <label for="tp-desc">Beskrivning</label>
      <input id="tp-desc" class="input" name="description" value="${esc(template?.description ?? '')}" placeholder="När och hur ronden används" />
    </div>
    <div class="field">
      <span class="field-label">Kontrollpunkter</span>
      <div class="stack" style="gap:6px" data-rows>
        ${items.map((item) => templateRow(item)).join('')}
      </div>
      <button type="button" class="btn btn-sm" data-add-row style="margin-top:8px;align-self:flex-start">+ Lägg till punkt</button>
      <span class="hint">Grupperar du punkter med samma gruppnamn visas de tillsammans i ronden.</span>
    </div>
  `;

  const dialog = openDialog({
    title: template ? 'Redigera mall' : 'Ny rondmall',
    body,
    footer: `<div class="row">
      <button type="button" class="btn" data-close>Avbryt</button>
      <button type="submit" class="btn btn-primary">${template ? 'Spara mall' : 'Skapa mall'}</button>
    </div>`,
    onSubmit: async (data, form) => {
      const rows = [...form.querySelectorAll('[data-row]')]
        .map((row) => ({
          group: row.querySelector('[data-group]').value.trim(),
          label: row.querySelector('[data-label]').value.trim(),
        }))
        .filter((row) => row.label);
      if (!data.name?.trim()) {
        toast('Mallen behöver ett namn.', 'bad');
        return false;
      }
      if (!rows.length) {
        toast('Lägg till minst en kontrollpunkt.', 'bad');
        return false;
      }
      await actions.upsertTemplate({
        ...(template ? { id: template.id } : {}),
        name: data.name.trim(),
        description: data.description?.trim() ?? '',
        safety: true,
        items: rows,
      });
      toast(template ? 'Mallen uppdaterad.' : 'Mallen skapad.', 'ok');
      return true;
    },
  });

  const rows = dialog.querySelector('[data-rows]');
  dialog.querySelector('[data-add-row]').addEventListener('click', () => {
    rows.insertAdjacentHTML('beforeend', templateRow());
    rows.lastElementChild.querySelector('[data-label]').focus();
  });
  dialog.addEventListener('click', (event) => {
    const remove = event.target.closest('[data-remove-row]');
    if (!remove) return;
    if (rows.querySelectorAll('[data-row]').length > 1) remove.closest('[data-row]').remove();
  });
}

function templatesTab() {
  const state = getState();
  return `
    <section class="card">
      <div class="card-head">
        <h2>Rondmallar</h2>
        <span class="hint">${state.templates.length} mallar</span>
      </div>
      <div class="card-body">
        <div class="admin-list">
          ${state.templates
            .map((template) => {
              const groups = new Set(template.items.map((item) => item.group));
              return `<div class="admin-row">
                <span class="dot ${template.safety ? 'warn' : 'steel'}"></span>
                <div class="admin-row-main">
                  <strong>${esc(template.name)}</strong>
                  <span>${esc(template.description || 'Ingen beskrivning')} · ${template.items.length} punkter · ${groups.size} grupper</span>
                </div>
                <div class="table-actions">
                  <button class="btn btn-sm" data-edit-template="${template.id}">Redigera</button>
                  <button class="btn btn-danger btn-icon btn-sm" data-delete-template="${template.id}" title="Ta bort" aria-label="Ta bort mall">${icon('trash', 14)}</button>
                </div>
              </div>`;
            })
            .join('')}
        </div>
      </div>
      <div class="card-foot">
        <span>Mallar används när en ny skyddsrond startas.</span>
      </div>
    </section>
  `;
}

/* ---------------------------- aktiviteter ---------------------------- */

function activityDialog() {
  openDialog({
    title: 'Ny aktivitet',
    body: `
      <div class="field">
        <label for="ac-name">Namn</label>
        <input id="ac-name" class="input" name="name" placeholder="T.ex. Ställningsbygge" />
      </div>
      <label class="check">
        <input type="checkbox" name="billable" checked />
        <span>Debiterbar mot beställare</span>
      </label>
    `,
    footer: `<div class="row">
      <button type="button" class="btn" data-close>Avbryt</button>
      <button type="submit" class="btn btn-primary">Skapa</button>
    </div>`,
    onSubmit: async (data) => {
      if (!data.name?.trim()) {
        toast('Namn krävs.', 'bad');
        return false;
      }
      await actions.upsertActivity({ name: data.name.trim(), billable: data.billable === 'on' });
      toast('Aktiviteten skapad.', 'ok');
      return true;
    },
  });
}

function activitiesTab() {
  const state = getState();
  return `
    <section class="card">
      <div class="card-head">
        <h2>Aktiviteter</h2>
        <span class="hint">Används i tidsrapporteringen</span>
      </div>
      <div class="card-body tight">
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Aktivitet</th><th>Debiterbar</th><th></th></tr></thead>
            <tbody>
              ${state.activities
                .map(
                  (activity) => `<tr>
                    <td class="strong">${esc(activity.name)}</td>
                    <td>${
                      activity.billable
                        ? badge('Debiterbar', 'primary')
                        : badge('Intern', 'muted')
                    }</td>
                    <td><div class="table-actions">
                      <button class="btn btn-ghost btn-icon btn-sm" data-toggle-activity="${activity.id}" title="Växla debiterbarhet" aria-label="Växla debiterbarhet">${icon(
                        'refresh',
                        14,
                      )}</button>
                      <button class="btn btn-ghost btn-icon btn-sm" data-delete-activity="${activity.id}" title="Ta bort" aria-label="Ta bort aktivitet">${icon('trash', 14)}</button>
                    </div></td>
                  </tr>`,
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  `;
}

/* --------------------------- inställningar --------------------------- */

function settingsTab() {
  const state = getState();
  return `
    <div class="grid grid-main">
      <section class="card">
        <div class="card-head"><h2>Företagsinställningar</h2></div>
        <form class="card-body stack" data-settings-form>
          <div class="form-grid">
            <div class="field span-2">
              <label for="se-company">Företag</label>
              <input id="se-company" class="input" name="companyName" value="${esc(state.settings.companyName)}" />
            </div>
            <div class="field">
              <label for="se-org">Organisationsnummer</label>
              <input id="se-org" class="input" name="orgNumber" value="${esc(state.settings.orgNumber)}" />
            </div>
            <div class="field">
              <label for="se-workday">Normal arbetsdag (timmar)</label>
              <input id="se-workday" type="number" class="input" name="workdayHours" min="1" max="24" step="0.5" value="${state.settings.workdayHours}" />
            </div>
            <div class="field">
              <label for="se-lunch">Lunchavdrag (minuter)</label>
              <input id="se-lunch" type="number" class="input" name="lunchMinutes" min="0" max="120" step="5" value="${state.settings.lunchMinutes}" />
            </div>
            <div class="field">
              <label for="se-limit">Rapporteringsgräns (dagar)</label>
              <input id="se-limit" type="number" class="input" name="reportLimitDays" min="1" max="31" value="${state.settings.reportLimitDays}" />
            </div>
          </div>
          <label class="check">
            <input type="checkbox" name="autoLunch" ${state.settings.autoLunch ? 'checked' : ''} />
            <span>Föreslå lunchavdrag automatiskt när tidsintervallet passerar lunch</span>
          </label>
          <div class="row-between">
            <span class="hint">Ändringar slår igenom direkt i gränssnittet.</span>
            <button type="submit" class="btn btn-primary">Spara inställningar</button>
          </div>
        </form>
      </section>

      </div>
    </div>
  `;
}

/* ------------------------------- vy ---------------------------------- */

export function renderAdmin(tab = 'projekt') {
  const user = currentUser();
  if (!can('admin', user)) {
    return `<header class="page-head"><div>
      <div class="eyebrow">Administration</div><h1>Åtkomst nekad</h1>
      <p class="page-sub">Administration kräver rollen administratör. Byt roll i toppmenyn för att prova.</p>
    </div></header>
    <a class="btn" href="#/oversikt">Till översikten</a>`;
  }

  const state = getState();
  const activeTab = TABS.some((item) => item.id === tab) ? tab : 'projekt';
  const counts = {
    projects: state.projects.length,
    users: state.users.length,
    templates: state.templates.length,
  };

  let content = '';
  if (activeTab === 'projekt') content = projectsTab();
  else if (activeTab === 'anvandare') content = usersTab();
  else if (activeTab === 'mallar') content = templatesTab();
  else if (activeTab === 'aktiviteter') content = activitiesTab();
  else content = settingsTab();

  return `${pageHead(activeTab, counts)}${content}`;
}

export function mountAdmin(root, tab = 'projekt') {
  const user = currentUser();
  if (!can('admin', user)) return;

  root.querySelector('[data-new-project]')?.addEventListener('click', () => projectDialog());
  root.querySelectorAll('[data-edit-project]').forEach((button) => {
    button.addEventListener('click', () => {
      const project = getState().projects.find((item) => item.id === button.dataset.editProject);
      if (project) projectDialog(project);
    });
  });

  root.querySelector('[data-new-user]')?.addEventListener('click', () => userDialog());
  root.querySelectorAll('[data-edit-user]').forEach((button) => {
    button.addEventListener('click', () => {
      const member = getState().users.find((item) => item.id === button.dataset.editUser);
      if (member) userDialog(member);
    });
  });
  root.querySelectorAll('[data-delete-user]').forEach((button) => {
    button.addEventListener('click', async () => {
      const member = getState().users.find((item) => item.id === button.dataset.deleteUser);
      if (!member) return;
      if (!window.confirm(`Ta bort användaren ${member.name}?`)) return;
      try {
        await actions.deleteUser(member.id);
        toast('Användaren borttagen.');
        if (!auth.loggedIn) {
          window.location.hash = '#/';
          window.dispatchEvent(new Event('hashchange'));
        }
      } catch (e) {
        toast('Kunde inte ta bort användaren.', 'bad');
      }
    });
  });
  root.querySelectorAll('[data-user-role]').forEach((select) => {
    select.addEventListener('change', async () => {
      try {
        await actions.upsertUser({ id: select.dataset.userRole, role: select.value });
        toast('Roll uppdaterad.', 'ok');
      } catch (e) {
        toast('Kunde inte uppdatera rollen.', 'bad');
      }
    });
  });

  root.querySelector('[data-new-template]')?.addEventListener('click', () => templateDialog());
  root.querySelectorAll('[data-edit-template]').forEach((button) => {
    button.addEventListener('click', () => {
      const template = getState().templates.find(
        (item) => item.id === button.dataset.editTemplate,
      );
      if (template) templateDialog(template);
    });
  });
  root.querySelectorAll('[data-delete-template]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!window.confirm('Ta bort mallen? Redan skapade ronder påverkas inte.')) return;
      try {
        await actions.deleteTemplate(button.dataset.deleteTemplate);
        toast('Mallen borttagen.');
      } catch (e) {
        toast('Kunde inte ta bort mallen.', 'bad');
      }
    });
  });

  root.querySelector('[data-new-activity]')?.addEventListener('click', activityDialog);
  root.querySelectorAll('[data-toggle-activity]').forEach((button) => {
    button.addEventListener('click', async () => {
      const activity = getState().activities.find(
        (item) => item.id === button.dataset.toggleActivity,
      );
      if (activity) {
        try {
          await actions.upsertActivity({ id: activity.id, billable: !activity.billable });
          toast('Aktiviteten uppdaterad.', 'ok');
        } catch (e) {
          toast('Kunde inte uppdatera aktiviteten.', 'bad');
        }
      }
    });
  });
  root.querySelectorAll('[data-delete-activity]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!window.confirm('Ta bort aktiviteten? Befintliga rapporter behåller sitt värde.')) return;
      try {
        await actions.deleteActivity(button.dataset.deleteActivity);
        toast('Aktiviteten borttagen.');
      } catch (e) {
        toast('Kunde inte ta bort aktiviteten.', 'bad');
      }
    });
  });

  const settingsForm = root.querySelector('[data-settings-form]');
  settingsForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(settingsForm);
    try {
      await actions.updateSettings({
        companyName: String(data.get('companyName') ?? '').trim(),
        orgNumber: String(data.get('orgNumber') ?? '').trim(),
        workdayHours: Number(data.get('workdayHours')) || 8,
        lunchMinutes: Number(data.get('lunchMinutes')) || 0,
        reportLimitDays: Number(data.get('reportLimitDays')) || 7,
        autoLunch: data.get('autoLunch') === 'on',
      });
      toast('Inställningarna sparade.', 'ok');
    } catch (e) {
      toast('Kunde inte spara inställningarna.', 'bad');
    }
  });

}
