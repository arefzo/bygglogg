// Arbetsskyddsrund (skyddsrond) – genomförande, avvikelser och signering.

import {
  INSPECTION_RESULTS,
  actions,
  accessibleProjects,
  can,
  canSeeProject,
  currentUser,
  getState,
  getTemplate,
  inspectionProgress,
  projectName,
  scopedProjects,
  session,
  todayIso,
  userName,
  weekNumber,
  photosFor,
} from '../store.js';
import {
  badge,
  esc,
  formatDate,
  formatLongDate,
  groupBy,
  openDialog,
  toast,
} from '../ui.js';
import { icon } from '../icons.js';
import { mountPhotoRoll, openPhotoDialog } from '../components.js';

const openDeviations = (inspection) =>
  inspection.items.filter((item) => item.result === 'avvikelse' && !item.resolved);

function statusBadge(inspection) {
  return inspection.status === 'klar'
    ? badge('Signerad', 'ok')
    : badge('Pågår', 'steel');
}

function startDialog(preselectedTemplateId = null) {
  const state = getState();
  const user = currentUser();
  const projects = accessibleProjects(user);
  const templates = state.templates;
  if (!templates.length) {
    toast('Det finns inga mallar. Skapa en mall under Administration först.', 'bad');
    return;
  }
  if (!projects.length) {
    toast('Du har inte behörighet till något projekt.', 'bad');
    return;
  }

  const selectedTemplate = preselectedTemplateId ?? templates[0].id;
  const body = `
    <div class="form-grid">
      <div class="field span-2">
        <label for="si-template">Mall</label>
        <select id="si-template" class="select" name="templateId">
          ${templates
            .map(
              (template) =>
                `<option value="${template.id}"${template.id === selectedTemplate ? ' selected' : ''}>${esc(
                  template.name,
                )} · ${template.items.length} punkter</option>`,
            )
            .join('')}
        </select>
      </div>
      <div class="field span-2">
        <label for="si-project">Projekt</label>
        <select id="si-project" class="select" name="projectId">
          ${projects
            .map(
              (project) =>
                `<option value="${project.id}"${
                  project.id === (session.activeProjectId !== 'all' ? session.activeProjectId : projects[0].id)
                    ? ' selected'
                    : ''
                }>${esc(`${project.number} · ${project.name}`)}</option>`,
            )
            .join('')}
        </select>
      </div>
      <div class="field">
        <label for="si-date">Datum</label>
        <input id="si-date" type="date" class="input" name="date" value="${todayIso()}" />
      </div>
      <div class="field">
        <label for="si-inspector">Utförs av</label>
        <select id="si-inspector" class="select" name="inspectorId">
          ${state.users
            .filter((member) => member.active && member.role !== 'klient')
            .map(
              (member) =>
                `<option value="${member.id}"${member.id === user.id ? ' selected' : ''}>${esc(
                  member.name,
                )}</option>`,
            )
            .join('')}
        </select>
      </div>
      <div class="field span-2">
        <label for="si-title">Rubrik <span class="muted">(valfri)</span></label>
        <input id="si-title" class="input" name="title" placeholder="Skapas automatiskt från mall och vecka" />
      </div>
    </div>
    <p class="hint">Ronden skapas med alla kontrollpunkter. Du kan fylla i underlaget direkt efteråt.</p>
  `;

  openDialog({
    title: 'Starta skyddsrond',
    body,
    footer: `<div class="row">
      <button type="button" class="btn" data-close>Avbryt</button>
      <button type="submit" class="btn btn-primary">Skapa rond</button>
    </div>`,
    onSubmit: async (data) => {
      if (!data.projectId || !data.templateId) {
        toast('Välj projekt och mall.', 'bad');
        return false;
      }
      const template = getTemplate(data.templateId);
      const title =
        data.title?.trim() ||
        `${template?.name ?? 'Skyddsrond'} vecka ${weekNumber(new Date(`${data.date}T12:00:00`))}`;
      const inspection = await actions.createInspection({
        templateId: data.templateId,
        projectId: data.projectId,
        date: data.date,
        inspectorId: data.inspectorId,
        title,
      });
      toast('Skyddsrond skapad.', 'ok');
      window.location.hash = `#/skyddsrond/${inspection.id}`;
      return true;
    },
  });
}

export function renderInspections() {
  const state = getState();
  const user = currentUser();
  const projects = scopedProjects(user);
  const projectIds = projects.map((project) => project.id);
  const inspections = state.inspections.filter((inspection) =>
    projectIds.includes(inspection.projectId),
  );
  const active = inspections.filter((inspection) => inspection.status === 'pagaende');
  const done = inspections.filter((inspection) => inspection.status === 'klar');
  const deviations = inspections
    .flatMap((inspection) =>
      inspection.items
        .filter((item) => item.result === 'avvikelse' && !item.resolved)
        .map((item) => ({ ...item, inspection })),
    )
    .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));

  const startButton = can('startInspection', user)
    ? `<button class="btn btn-primary" data-start>Starta skyddsrond</button>`
    : '';

  const rows = (list) =>
    list.length
      ? list
          .map((inspection) => {
            const progress = inspectionProgress(inspection);
            const open = openDeviations(inspection).length;
            return `<a class="admin-row" href="#/skyddsrond/${inspection.id}" style="text-decoration:none;color:inherit">
              <span class="dot ${inspection.status === 'klar' ? 'ok' : open ? 'bad' : 'warn'}"></span>
              <div class="admin-row-main">
                <strong>${esc(inspection.title)}</strong>
                <span>${esc(projectName(inspection.projectId))} · ${esc(
                  formatDate(inspection.date),
                )} · ${esc(userName(inspection.inspectorId))}</span>
              </div>
              <div class="row" style="gap:14px">
                ${
                  inspection.status === 'klar'
                    ? badge('Signerad', 'ok')
                    : open
                      ? badge(`${open} avvikelse${open === 1 ? '' : 'r'}`, 'bad')
                      : badge('Pågår', 'steel')
                }
                <span class="small muted nowrap">${progress.answered}/${progress.total}</span>
              </div>
            </a>`;
          })
          .join('')
      : `<div class="empty"><strong>Inget här ännu</strong>${
          can('startInspection', user) ? 'Starta en rond för att komma igång.' : 'Inga ronder att visa.'
        }</div>`;

  return `
    <header class="page-head">
      <div>
        <div class="eyebrow">Arbetsskydd · vecka ${weekNumber()}</div>
        <h1>Skyddsrond</h1>
        <p class="page-sub">Systematisk rundvandring enligt arbetsmiljöplan. Avvikelser får åtgärd, ansvarig och datum innan ronden signeras.</p>
      </div>
      <div class="page-actions">${startButton}</div>
    </header>

    <div class="grid grid-3" style="margin-bottom:16px">
      <div class="kpi">
        <span class="kpi-accent"></span>
        <div class="kpi-label">Pågående ronder</div>
        <div class="kpi-value">${active.length}</div>
        <div class="kpi-meta">${active.reduce((sum, item) => sum + inspectionProgress(item).answered, 0)} punkter ifyllda</div>
      </div>
      <div class="kpi">
        <span class="kpi-accent bad"></span>
        <div class="kpi-label">Öppna avvikelser</div>
        <div class="kpi-value">${deviations.length}</div>
        <div class="kpi-meta">${deviations.filter((item) => item.dueDate).length} med datum</div>
      </div>
      <div class="kpi">
        <span class="kpi-accent steel"></span>
        <div class="kpi-label">Signerade ronder</div>
        <div class="kpi-value">${done.length}</div>
        <div class="kpi-meta">${state.templates.length} mallar tillgängliga</div>
      </div>
    </div>

    <div class="grid grid-main">
      <div class="stack">
        <section class="card">
          <div class="card-head">
            <h2>Pågående</h2>
            <span class="hint">${active.length} ronder</span>
          </div>
          <div class="card-body">
            <div class="admin-list">${rows(active)}</div>
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <h2>Signerade</h2>
            <span class="hint">${done.length} ronder</span>
          </div>
          <div class="card-body">
            <div class="admin-list">${rows(done)}</div>
          </div>
        </section>
      </div>

      <div class="stack">
        <section class="card">
          <div class="card-head">
            <h2>Mallar</h2>
            ${can('admin', user) ? `<a class="btn btn-ghost btn-sm" href="#/admin/mallar">Hantera →</a>` : ''}
          </div>
          <div class="card-body">
            <div class="stack" style="gap:10px">
              ${state.templates
                .map(
                  (template) => `<div class="row-between">
                    <div>
                      <strong style="font-size:13px;font-weight:600">${esc(template.name)}</strong>
                      <div class="small muted">${template.items.length} punkter</div>
                    </div>
                    ${
                      can('startInspection', user)
                        ? `<button class="btn btn-sm" data-start-template="${template.id}">Starta</button>`
                        : ''
                    }
                  </div>`,
                )
                .join('')}
            </div>
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <h2>Öppna avvikelser</h2>
            <span class="hint">${deviations.length}</span>
          </div>
          <div class="card-body tight">
            ${
              deviations.length
                ? deviations
                    .slice(0, 5)
                    .map(
                      (item) => `<a class="entry" href="#/skyddsrond/${item.inspection.id}" style="display:block;text-decoration:none;color:inherit">
                        <div class="entry-head">
                          ${badge('Avvikelse', 'bad')}
                          <span class="small muted">${esc(formatDate(item.inspection.date))}</span>
                        </div>
                        <p class="entry-text" style="font-size:13px">${esc(item.label)}</p>
                        <div class="entry-foot">
                          <span>${esc(projectName(item.inspection.projectId))}</span>
                          ${item.dueDate ? `<span>· klart ${esc(formatDate(item.dueDate))}</span>` : ''}
                          ${item.responsible ? `<span>· ${esc(userName(item.responsible))}</span>` : ''}
                        </div>
                      </a>`,
                    )
                    .join('')
                : `<div class="empty"><strong>Inga öppna avvikelser</strong>Allt är omhändertaget.</div>`
            }
          </div>
        </section>
      </div>
    </div>
  `;
}

export function mountInspections(root) {
  root.querySelector('[data-start]')?.addEventListener('click', () => startDialog());
  root.querySelectorAll('[data-start-template]').forEach((button) => {
    button.addEventListener('click', () => startDialog(button.dataset.startTemplate));
  });
}

/* ------------------------------------------------------------------ */
/* Detaljvy                                                            */
/* ------------------------------------------------------------------ */

function deviationFields(item, inspection, readOnly) {
  const users = getState().users.filter((member) => member.active);
  return `
    <div class="deviation-box">
      <div class="field">
        <label class="field-label">Observation</label>
        ${
          readOnly
            ? `<span class="small">${esc(item.note || 'Ingen beskrivning.')}</span>`
            : `<input class="input input-sm" data-field="note" name="note" value="${esc(
                item.note ?? '',
              )}" placeholder="Vad observerades?" />`
        }
      </div>
      <div class="form-grid">
        <div class="field">
          <label class="field-label">Åtgärd</label>
          ${
            readOnly
              ? `<span class="small">${esc(item.action || 'Ej angiven.')}</span>`
              : `<input class="input input-sm" data-field="action" name="action" value="${esc(
                  item.action ?? '',
                )}" placeholder="Vad ska göras?" />`
          }
        </div>
        <div class="field">
          <label class="field-label">Ansvarig</label>
          ${
            readOnly
              ? `<span class="small">${esc(item.responsible ? userName(item.responsible) : 'Ej angiven')}</span>`
              : `<select class="select input-sm" data-field="responsible" name="responsible">
                  <option value="">Välj ansvarig</option>
                  ${users
                    .map(
                      (member) =>
                        `<option value="${member.id}"${
                          member.id === item.responsible ? ' selected' : ''
                        }>${esc(member.name)}</option>`,
                    )
                    .join('')}
                </select>`
          }
        </div>
        <div class="field">
          <label class="field-label">Klart senast</label>
          ${
            readOnly
              ? `<span class="small">${esc(item.dueDate ? formatDate(item.dueDate) : 'Ej angivet')}</span>`
              : `<input type="date" class="input input-sm" data-field="dueDate" name="dueDate" value="${esc(
                  item.dueDate ?? '',
                )}" />`
          }
        </div>
        <div class="field">
          <label class="field-label">Status</label>
          <div class="row" style="padding-top:4px">
            ${item.resolved ? badge('Åtgärdad', 'ok') : badge('Öppen', 'bad')}
          </div>
        </div>
      </div>
      <div class="entry-photos" style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
        ${photosFor('inspection-item', item.id)
          .map(
            (photo) => `<img class="entry-photo-img" src="${esc(
              photo.dataUrl,
            )}" alt="${esc(photo.name)}" title="${esc(photo.name)}" />`,
          )
          .join('')}
      </div>
      ${
        readOnly
          ? ''
          : `<button type="button" class="btn btn-ghost btn-sm" data-photo-item="${item.id}" title="Lägg till foto" aria-label="Lägg till foto">${icon('camera', 14)} Foto</button>`
      }
      ${
        readOnly
          ? ''
          : `<div class="row-between">
              <span class="hint">Spara åtgärden innan du signerar ronden.</span>
              <div class="row">
                ${
                  item.resolved
                    ? ''
                    : `<button type="button" class="btn btn-sm" data-resolve="${item.id}">Markera åtgärdad</button>`
                }
                <button type="button" class="btn btn-sm btn-primary" data-save-deviation="${item.id}">Spara åtgärd</button>
              </div>
            </div>`
      }
    </div>
  `;
}

function checklistHtml(inspection, { canEdit, canSign }) {
  const groups = groupBy(inspection.items, (item) => item.group);
  const readOnly = inspection.status === 'klar' || !canEdit;

  return [...groups.entries()]
    .map(
      ([group, items]) => `
      <div class="group-head">${esc(group)}</div>
      ${items
        .map((item) => {
          const deviation = item.result === 'avvikelse';
          return `<div class="inspection-item" data-item="${item.id}">
            <div class="inspection-item-head">
              <div class="inspection-label">${esc(item.label)}${
              item.ref
                ? `<div class="small muted" style="margin-top:2px">${esc(item.ref)}</div>`
                : ''
            }</div>
              ${
                readOnly
                  ? item.result
                    ? badge(
                        INSPECTION_RESULTS[item.result].label,
                        INSPECTION_RESULTS[item.result].tone,
                      )
                    : badge('Ej besvarad', 'muted')
                  : `<div class="segmented">
                      ${Object.entries(INSPECTION_RESULTS)
                        .map(
                          ([value, result]) =>
                            `<button type="button" data-result="${value}" data-tone="${
                              result.tone
                            }" class="${item.result === value ? 'active' : ''}">${esc(result.label)}</button>`,
                        )
                        .join('')}
                    </div>`
              }
            </div>
            ${deviation ? deviationFields(item, inspection, readOnly) : ''}
          </div>`;
        })
        .join('')}
    `,
    )
    .join('');
}

export function renderInspectionDetail(id) {
  const state = getState();
  const user = currentUser();
  const inspection = state.inspections.find((item) => item.id === id);

  if (!inspection) {
    return `<header class="page-head"><div>
      <div class="eyebrow">Skyddsrond</div><h1>Ronden hittades inte</h1>
      <p class="page-sub">Den kan ha tagits bort eller tillhöra ett annat projekt.</p>
    </div></header>
    <a class="btn" href="#/skyddsrond">Till alla ronder</a>`;
  }

  if (!canSeeProject(inspection.projectId, user)) {
    return `<header class="page-head"><div><h1>Åtkomst nekad</h1>
      <p class="page-sub">Du har inte behörighet till projektet.</p></div></header>
      <a class="btn" href="#/skyddsrond">Tillbaka</a>`;
  }

  const progress = inspectionProgress(inspection);
  const open = openDeviations(inspection);
  const deviationTotal = inspection.items.filter((item) => item.result === 'avvikelse').length;
  const canEdit = can('startInspection', user);
  const canSign = can('signInspection', user) && inspection.status === 'pagaende';
  const canDelete = can('signInspection', user);
  const finished = inspection.status === 'klar';

  return `
    <header class="page-head">
      <div>
        <div class="eyebrow">
          <a href="#/skyddsrond" style="color:inherit">Skyddsrond</a> · ${esc(
            projectName(inspection.projectId),
          )}
        </div>
        <h1>${esc(inspection.title)}</h1>
        <p class="page-sub">${esc(formatLongDate(inspection.date))} · ${esc(
          userName(inspection.inspectorId),
        )} · ${esc(inspection.templateName)}</p>
      </div>
      <div class="page-actions">
        <button class="btn" data-print>Skriv ut</button>
        ${
          canDelete && !finished
            ? `<button class="btn btn-danger" data-delete>Ta bort</button>`
            : ''
        }
        ${
          canSign
            ? `<button class="btn btn-primary" data-sign>Signera &amp; slutför</button>`
            : ''
        }
      </div>
    </header>

    <div class="grid grid-main">
      <section class="card">
        <div class="card-head">
          <h2>Kontrollpunkter</h2>
          <div class="row">
            ${finished ? badge('Signerad', 'ok') : open.length ? badge(`${open.length} öppna avvikelser`, 'bad') : badge('Pågår', 'steel')}
          </div>
        </div>
        <div class="card-body" style="padding-bottom:0">
          <div class="row-between" style="margin-bottom:8px">
            <span class="small muted">${progress.answered} av ${progress.total} punkter besvarade</span>
            <strong class="small">${progress.percent} %</strong>
          </div>
          <div class="progress ${progress.percent === 100 ? 'ok' : ''}" style="margin-bottom:4px">
            <span style="width:${progress.percent}%"></span>
          </div>
        </div>
        ${checklistHtml(inspection, { canEdit, canSign })}
        <div class="card-foot">
          <span>${deviationTotal} avvikelser · ${open.length} öppna</span>
          <span>${finished ? 'Låst efter signering' : 'Spara åtgärder löpande'}</span>
        </div>
      </section>

      <div class="stack">
        <section class="card">
          <div class="card-head"><h2>Sammanställning</h2></div>
          <div class="card-body">
            ${Object.entries(INSPECTION_RESULTS)
              .map(([key, result]) => {
                const count = inspection.items.filter((item) => item.result === key).length;
                return `<div class="row-between" style="padding:6px 0">
                  ${badge(result.label, result.tone)}
                  <strong>${count}</strong>
                </div>`;
              })
              .join('')}
            <hr class="divider" />
            <div class="row-between small">
              <span class="muted">Ej besvarade</span>
              <strong>${inspection.items.filter((item) => !item.result).length}</strong>
            </div>
          </div>
        </section>

        ${
          finished
            ? `<section class="card">
                <div class="card-head"><h2>Signering</h2></div>
                <div class="card-body">
                  <div class="signature">
                    ${icon('shield', 26)}
                    <div>
                      <strong>${esc(userName(inspection.signedBy))}</strong>
                      Signerad ${esc(
                        new Date(inspection.signedAt).toLocaleString('sv-SE', {
                          dateStyle: 'long',
                          timeStyle: 'short',
                        }),
                      )}
                    </div>
                  </div>
                  <p class="hint" style="margin-top:12px">Ronden är låst. Avvikelser kan följas upp men inte ändras.</p>
                </div>
              </section>`
            : `<section class="card">
                <div class="card-head"><h2>Innan signering</h2></div>
                <div class="card-body stack" style="gap:10px">
                  <div class="row"><span class="dot ${progress.answered === progress.total ? 'ok' : 'warn'}"></span><span class="small">Alla punkter besvarade</span></div>
                  <div class="row"><span class="dot ${open.length === 0 ? 'ok' : 'bad'}"></span><span class="small">Alla avvikelser har åtgärd och ansvarig</span></div>
                  <p class="hint">Signering låser ronden och sparar namn och tidpunkt.</p>
                  ${
                    canSign
                      ? `<button class="btn btn-primary btn-block" data-sign>Signera ronden</button>`
                      : `<p class="hint">Endast arbetsledare eller administratör kan signera.</p>`
                  }
                </div>
              </section>`
        }

        <section class="card">
          <div class="card-head"><h2>Detaljer</h2></div>
          <div class="card-body stack" style="gap:8px">
            <div class="row-between small"><span class="muted">Projekt</span><span>${esc(projectName(inspection.projectId))}</span></div>
            <div class="row-between small"><span class="muted">Mall</span><span>${esc(inspection.templateName)}</span></div>
            <div class="row-between small"><span class="muted">Utförd av</span><span>${esc(userName(inspection.inspectorId))}</span></div>
            <div class="row-between small"><span class="muted">Datum</span><span>${esc(formatDate(inspection.date, { year: true }))}</span></div>
            <div class="row-between small"><span class="muted">Skapad</span><span>${esc(formatDate(inspection.createdAt.slice(0, 10)))}</span></div>
          </div>
        </section>
      </div>
    </div>
  `;
}

function signDialog(inspection) {
  const counts = Object.entries(INSPECTION_RESULTS).map(([key, result]) => ({
    label: result.label,
    count: inspection.items.filter((item) => item.result === key).length,
  }));
  const missing = inspection.items.filter((item) => !item.result);
  const badDeviations = inspection.items.filter(
    (item) =>
      item.result === 'avvikelse' && (!item.note?.trim() || !item.action?.trim() || !item.responsible || !item.dueDate),
  );

  if (missing.length || badDeviations.length) {
    const parts = [];
    if (missing.length) parts.push(`${missing.length} punkter saknar svar`);
    if (badDeviations.length) parts.push(`${badDeviations.length} avvikelser saknar åtgärd eller ansvarig`);
    toast(`Kan inte signera: ${parts.join(' och ')}.`, 'bad');
    return;
  }

  openDialog({
    title: 'Signera skyddsrond',
    body: `
      <p class="small">Du signerar <strong>${esc(inspection.title)}</strong> för ${esc(
        projectName(inspection.projectId),
      )}.</p>
      <div class="row" style="gap:8px">
        ${counts.map((row) => badge(`${row.label}: ${row.count}`, 'steel')).join('')}
      </div>
      <label class="check">
        <input type="checkbox" name="confirm" />
        <span>Jag intygar att rundan är genomförd och att avvikelser har dokumenterade åtgärder.</span>
      </label>
    `,
    footer: `<div class="row">
      <button type="button" class="btn" data-close>Avbryt</button>
      <button type="submit" class="btn btn-primary">Signera</button>
    </div>`,
    onSubmit: async (data) => {
      if (data.confirm !== 'on') {
        toast('Markera intyget för att signera.', 'bad');
        return false;
      }
      await actions.signInspection(inspection.id);
      toast('Skyddsronden är signerad.', 'ok');
      return true;
    },
  });
}

export function mountInspectionDetail(root, id) {
  const inspection = getState().inspections.find((item) => item.id === id);
  if (!inspection) return;

  root.querySelector('[data-print]')?.addEventListener('click', () => window.print());
  root.querySelector('[data-sign]')?.addEventListener('click', () => signDialog(inspection));

  root.querySelector('[data-delete]')?.addEventListener('click', async () => {
    if (!window.confirm('Ta bort skyddsronden och alla svar?')) return;
    try {
      await actions.deleteInspection(inspection.id);
      toast('Skyddsronden borttagen.');
      window.location.hash = '#/skyddsrond';
    } catch (e) {
      toast('Kunde inte ta bort skyddsronden.', 'bad');
    }
  });

  root.querySelectorAll('[data-result]').forEach((button) => {
    button.addEventListener('click', async () => {
      const itemEl = button.closest('[data-item]');
      if (!itemEl) return;
      try {
        await actions.setInspectionItem(inspection.id, itemEl.dataset.item, {
          result: button.dataset.result,
        });
      } catch (e) {
        toast('Kunde inte uppdatera resultat.', 'bad');
      }
    });
  });

  root.querySelectorAll('[data-save-deviation]').forEach((button) => {
    button.addEventListener('click', async () => {
      const itemEl = button.closest('[data-item]');
      if (!itemEl) return;
      const get = (field) => itemEl.querySelector(`[data-field="${field}"]`)?.value ?? '';
      try {
        await actions.setInspectionItem(inspection.id, itemEl.dataset.item, {
          note: get('note').trim(),
          action: get('action').trim(),
          responsible: get('responsible'),
          dueDate: get('dueDate'),
        });
        toast('Åtgärden sparad.', 'ok');
      } catch (e) {
        toast('Kunde inte spara åtgärden.', 'bad');
      }
    });
  });

  root.querySelectorAll('[data-resolve]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await actions.resolveDeviation(inspection.id, button.dataset.resolve);
        toast('Avvikelsen markerad som åtgärdad.', 'ok');
      } catch (e) {
        toast('Kunde inte markera avvikelsen.', 'bad');
      }
    });
  });

  root.querySelectorAll('[data-photo-item]').forEach((button) => {
    button.addEventListener('click', () => {
      openPhotoDialog('inspection-item', button.dataset.photoItem, { title: 'Foton – avvikelse' });
    });
  });
}
