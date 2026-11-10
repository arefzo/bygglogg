// Översikt – dagens läge och snabb registrering.

import {
  ENTRY_TYPES,
  actions,
  accessibleProjects,
  currentUser,
  getState,
  inspectionProgress,
  projectName,
  scopedProjects,
  sumMinutes,
  todayIso,
  weekNumber,
  reportsForWeek,
  userName,
} from '../store.js';
import { avatar, badge, esc, formatDate, formatLongDate, timeOf, toast } from '../ui.js';
import { mountQuickAdd, openTimeDialog, quickAddHtml } from '../components.js';
import { formatHours } from '../parser.js';

function greeting() {
  const hour = new Date().getHours();
  if (hour < 10) return 'God morgon';
  if (hour < 12) return 'God förmiddag';
  if (hour < 18) return 'God eftermiddag';
  return 'God kväll';
}

function entryRow(entry, { showProject = true } = {}) {
  const type = ENTRY_TYPES[entry.type] ?? ENTRY_TYPES.arbete;
  return `
    <div class="entry">
      <div class="entry-head">
        ${badge(type.label, type.tone)}
        ${showProject ? `<span class="small muted">${esc(projectName(entry.projectId))}</span>` : ''}
        <span class="entry-time">${timeOf(entry.createdAt)}</span>
        ${entry.published ? '' : badge('Ej publicerad', 'muted')}
        ${entry.locked ? badge('Låst', 'steel') : ''}
        <span class="entry-actions">
          <a class="btn btn-ghost btn-sm" href="#/dagbok?datum=${entry.date}">Öppna</a>
        </span>
      </div>
      <p class="entry-text clamp-3">${esc(entry.text)}</p>
      <div class="entry-foot">
        ${avatar(userName(entry.authorId))}
        <span>${esc(userName(entry.authorId))}</span>
        ${entry.weather ? `<span class="weather-pill">· ${esc(entry.weather)}</span>` : ''}
        ${entry.comments.length ? `<span>· ${entry.comments.length} kommentar${entry.comments.length === 1 ? '' : 'er'}</span>` : ''}
      </div>
    </div>
  `;
}

export function renderDashboard() {
  const state = getState();
  const user = currentUser();
  const isClient = user.role === 'klient';
  const projects = scopedProjects(user);
  const projectIds = projects.map((project) => project.id);
  const allProjects = accessibleProjects(user);
  const today = todayIso();
  const weekReports = reportsForWeek(today, projectIds);
  const weekMinutes = sumMinutes(weekReports);
  const ownMinutes = sumMinutes(weekReports.filter((report) => report.userId === user.id));
  const target = Math.max(1, Number(state.settings.workdayHours) * 5 * 60);

  const todaysEntries = state.entries
    .filter(
      (entry) =>
        entry.date === today &&
        projectIds.includes(entry.projectId) &&
        (!isClient || entry.published),
    )
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const publishedToday = todaysEntries.filter((entry) => entry.published).length;
  const draftCount = todaysEntries.length - publishedToday;

  const scopedInspections = state.inspections.filter((inspection) =>
    projectIds.includes(inspection.projectId),
  );
  const activeInspections = scopedInspections.filter(
    (inspection) => inspection.status === 'pagaende',
  );
  const deviations = state.inspections
    .filter((inspection) => projectIds.includes(inspection.projectId))
    .flatMap((inspection) => inspection.items)
    .filter((item) => item.result === 'avvikelse' && !item.resolved);

  const draftReports = weekReports.filter(
    (report) => report.userId === user.id && report.status === 'utkast',
  );

  return `
    <header class="page-head">
      <div>
        <div class="eyebrow">Översikt · vecka ${weekNumber()}</div>
        <h1>${greeting()}, ${esc(user.name.split(' ')[0])}</h1>
        <p class="page-sub">${esc(formatLongDate(today))} · ${esc(state.settings.companyName)}${
          projects.length === 1 ? ` · ${esc(projects[0].name)}` : ''
        }</p>
      </div>
      <div class="page-actions">
        ${
          !isClient
            ? `<button class="btn" data-new-time>Ny tidsrapport</button>`
            : ''
        }
        <a class="btn btn-primary" href="#/dagbok?datum=${today}">Öppna dagboken</a>
      </div>
    </header>

    <div class="grid grid-3" style="margin-bottom:16px">
      <div class="kpi">
        <span class="kpi-accent steel"></span>
        <div class="kpi-label">${isClient ? 'Dina projekt' : 'Veckans tid'}</div>
        <div class="kpi-value">${
          isClient
            ? `${projects.length}`
            : `${(weekMinutes / 60).toLocaleString('sv-SE', { maximumFractionDigits: 1 })} <small>h</small>`
        }</div>
        <div class="kpi-meta">${
          isClient
            ? `${projects.filter((project) => project.status === 'aktiv').length} pågående`
            : `Varav dina ${formatHours(ownMinutes)} · mål ${Math.round(target / 60)} h`
        }</div>
      </div>
      <div class="kpi">
        <span class="kpi-accent"></span>
        <div class="kpi-label">Dagens dagbok</div>
        <div class="kpi-value">${publishedToday}<small> / ${todaysEntries.length}</small></div>
        <div class="kpi-meta">${
          draftCount > 0 ? `${draftCount} inlägg väntar på publicering` : 'Allt publicerat'
        }</div>
      </div>
      <div class="kpi">
        <span class="kpi-accent bad"></span>
        <div class="kpi-label">Öppna avvikelser</div>
        <div class="kpi-value">${deviations.length}</div>
        <div class="kpi-meta">${activeInspections.length} pågående skyddsrond${activeInspections.length === 1 ? '' : 'er'}</div>
      </div>
    </div>

    <div class="grid grid-main">
      <div class="stack">
        ${
          isClient
            ? ''
            : `<section class="card">
                <div class="card-head">
                  <h2>Snabbregistrering av tid</h2>
                  <span class="hint">Naturligt språk · dagens datum</span>
                </div>
                <div class="card-body">
                  ${quickAddHtml({ defaultDate: today })}
                </div>
              </section>`
        }

        <section class="card">
          <div class="card-head">
            <h2>Dagens dagbok</h2>
            <a class="btn btn-ghost btn-sm" href="#/dagbok?datum=${today}">Visa dagen →</a>
          </div>
          <div class="card-body tight">
            ${
              todaysEntries.length
                ? todaysEntries.slice(0, 4).map((entry) => entryRow(entry)).join('')
                : `<div class="empty"><strong>Inga inlägg idag</strong>Dagen är tom – börja med att beskriva vad som händer på plats.</div>`
            }
          </div>
        </section>
      </div>

      <div class="stack">
        <section class="card">
          <div class="card-head">
            <h2>Skyddsronder</h2>
            <a class="btn btn-ghost btn-sm" href="#/skyddsrond">Alla →</a>
          </div>
          <div class="card-body tight">
            ${
              activeInspections.length
                ? activeInspections
                    .slice(0, 3)
                    .map((inspection) => {
                      const progress = inspectionProgress(inspection);
                      const open = inspection.items.filter(
                        (item) => item.result === 'avvikelse' && !item.resolved,
                      ).length;
                      return `<a class="entry" href="#/skyddsrond/${inspection.id}" style="display:block;text-decoration:none;color:inherit">
                        <div class="entry-head">
                          <span class="dot ${open ? 'bad' : 'warn'}"></span>
                          <strong style="font-weight:600">${esc(inspection.title)}</strong>
                          ${open ? badge(`${open} avvikelse${open === 1 ? '' : 'r'}`, 'bad') : badge('Pågår', 'steel')}
                        </div>
                        <div class="small muted" style="margin-bottom:8px">${esc(projectName(inspection.projectId))} · ${esc(formatDate(inspection.date))}</div>
                        <div class="progress"><span style="width:${progress.percent}%"></span></div>
                        <div class="entry-foot"><span>${progress.answered} av ${progress.total} punkter</span></div>
                      </a>`;
                    })
                    .join('')
                : `<div class="empty"><strong>Inga pågående ronder</strong>Starta en ny skyddsrond från en mall.</div>`
            }
          </div>
          <div class="card-foot">
            <span>${allProjects.length} projekt</span>
            <a class="btn btn-sm" href="#/skyddsrond">Starta rond</a>
          </div>
        </section>

        ${
          isClient
            ? ''
            : `<section class="card">
                <div class="card-head">
                  <h2>Din tid denna vecka</h2>
                  <span class="hint">${draftReports.length} utkast</span>
                </div>
                <div class="card-body">
                  <div class="row-between" style="margin-bottom:10px">
                    <span class="muted small">${formatHours(ownMinutes)} registrerade</span>
                    <span class="muted small">mål ${Math.round(target / 60)} h</span>
                  </div>
                  <div class="progress"><span style="width:${Math.min(100, Math.round((ownMinutes / target) * 100))}%"></span></div>
                  <a class="btn btn-block" style="margin-top:14px" href="#/tid">Till tidsrapporteringen</a>
                </div>
              </section>`
        }
      </div>
    </div>
  `;
}

export function mountDashboard(root) {
  const user = currentUser();
  if (user.role === 'klient') return;

  mountQuickAdd(root, {
    onSave: async (payload) => {
      try {
        await actions.addTimeReport(payload);
        toast(
          payload.status === 'utkast' ? 'Utkast sparat.' : 'Tidsrapport inskickad.',
          'ok',
        );
      } catch (e) {
        toast('Kunde inte spara tidsrapporten.', 'bad');
      }
    },
  });

  root.querySelector('[data-new-time]')?.addEventListener('click', () => {
    openTimeDialog(null);
  });
}
