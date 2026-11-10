// Tidsrapportering – veckoöversikt, snabbregistrering och godkännande.

import {
  TIME_STATUS,
  actions,
  activityName,
  can,
  currentUser,
  getState,
  projectName,
  reportsForWeek,
  scopedProjects,
  session,
  setSession,
  sumMinutes,
  todayIso,
  weekDays,
  weekNumber,
  weekStart,
} from '../store.js';
import { badge, duration, esc, formatDate, toast } from '../ui.js';
import { mountQuickAdd, openTimeDialog, quickAddHtml } from '../components.js';

const pad = (n) => String(n).padStart(2, '0');
const hours = (minutes) =>
  (minutes / 60).toLocaleString('sv-SE', { maximumFractionDigits: 1 });

function shiftWeek(anchor, direction) {
  const date = new Date(`${anchor}T12:00:00`);
  date.setDate(date.getDate() + direction * 7);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function emptyWeek() {
  return `<div class="empty"><strong>Inga rapporter den här veckan</strong>Använd snabbregistreringen eller lägg till en rapport manuellt.</div>`;
}

export function renderTime() {
  const state = getState();
  const user = currentUser();

  if (user.role === 'klient') {
    return `
      <header class="page-head">
        <div>
          <div class="eyebrow">Tidsrapportering</div>
          <h1>Tidsrapportering</h1>
        </div>
      </header>
      <section class="card"><div class="empty">
        <strong>Roller och behörigheter</strong>
        Tidsrapportering är tillgänglig för hantverkare, arbetsledare och administratörer.
        Som klient ser du publicerade dagboksinlägg och skyddsronder.
        <div style="margin-top:12px"><a class="btn" href="#/dagbok">Till dagboken</a></div>
      </div></section>
    `;
  }

  const projects = scopedProjects(user);
  const projectIds = projects.map((project) => project.id);
  const anchor = `${weekStart(new Date(`${session.weekAnchor}T12:00:00`)).getFullYear()}-${pad(
    weekStart(new Date(`${session.weekAnchor}T12:00:00`)).getMonth() + 1,
  )}-${pad(weekStart(new Date(`${session.weekAnchor}T12:00:00`)).getDate())}`;
  const days = weekDays(new Date(`${anchor}T12:00:00`));
  const reports = reportsForWeek(anchor, projectIds);
  const ownReports = reports.filter((report) => report.userId === user.id);
  const teamMinutes = sumMinutes(reports);
  const ownMinutes = sumMinutes(ownReports);
  const manager = can('approveTime', user);
  const target = Math.max(1, Number(state.settings.workdayHours) * 5 * 60);
  const pending = reports.filter((report) => report.status === 'inskickad');
  const ownDrafts = ownReports.filter((report) => report.status === 'utkast');
  const filter = session.timeFilter ?? 'alla';
  const today = todayIso();
  const inThisWeek = days.some((day) => `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}` === today);

  const visible = reports
    .filter((report) => (manager ? true : report.userId === user.id))
    .filter((report) => {
      if (filter === 'mina') return report.userId === user.id;
      if (filter === 'utkast') return report.status === 'utkast';
      if (filter === 'godkanna') return report.status === 'inskickad';
      return true;
    })
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const weekLabel = `${formatDate(`${anchor}`, { weekday: false })} – ${formatDate(
    `${days[6].getFullYear()}-${pad(days[6].getMonth() + 1)}-${pad(days[6].getDate())}`,
    { weekday: false },
  )}`;

  const perProject = projects
    .map((project) => {
      const minutes = sumMinutes(reports.filter((report) => report.projectId === project.id));
      return { project, minutes };
    })
    .filter((row) => row.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes);
  const maxProjectMinutes = Math.max(1, ...perProject.map((row) => row.minutes));

  return `
    <header class="page-head">
      <div>
        <div class="eyebrow">Tidsrapportering · vecka ${weekNumber(new Date(`${anchor}T12:00:00`))}</div>
        <h1>Tid</h1>
        <p class="page-sub">${weekLabel}${
          projects.length === 1 ? ` · ${esc(projects[0].name)}` : ''
        }</p>
      </div>
      <div class="page-actions">
        ${
          ownDrafts.length
            ? `<button class="btn" data-submit-week>Skicka in ${ownDrafts.length} utkast</button>`
            : ''
        }
        <button class="btn btn-primary" data-new-report>Ny rapport</button>
      </div>
    </header>

    <div class="datebar" style="margin-bottom:16px">
      <div class="date-nav">
        <button class="btn btn-icon" data-week-prev aria-label="Föregående vecka">‹</button>
        <div class="date-title">Vecka ${weekNumber(new Date(`${anchor}T12:00:00`))}<span>${weekLabel}</span></div>
        <button class="btn btn-icon" data-week-next aria-label="Nästa vecka">›</button>
        <button class="btn btn-sm" data-week-now>Denna vecka</button>
      </div>
      <div class="chip-row">
        <button class="chip${filter === 'alla' ? ' active' : ''}" data-filter="alla">Alla</button>
        <button class="chip${filter === 'mina' ? ' active' : ''}" data-filter="mina">Mina</button>
        <button class="chip${filter === 'utkast' ? ' active' : ''}" data-filter="utkast">Utkast</button>
        ${
          manager
            ? `<button class="chip${filter === 'godkanna' ? ' active' : ''}" data-filter="godkanna">Att godkänna (${pending.length})</button>`
            : ''
        }
      </div>
    </div>

    <div class="grid grid-3" style="margin-bottom:16px">
      <div class="kpi">
        <span class="kpi-accent steel"></span>
        <div class="kpi-label">Dina timmar</div>
        <div class="kpi-value">${hours(ownMinutes)} <small>h</small></div>
        <div class="kpi-meta">${ownReports.length} rapporter · mål ${Math.round(target / 60)} h</div>
      </div>
      <div class="kpi">
        <span class="kpi-accent"></span>
        <div class="kpi-label">Projektets timmar</div>
        <div class="kpi-value">${hours(teamMinutes)} <small>h</small></div>
        <div class="kpi-meta">${reports.length} rapporter i veckan</div>
      </div>
      <div class="kpi">
        <span class="kpi-accent ${pending.length ? 'bad' : ''}"></span>
        <div class="kpi-label">Att godkänna</div>
        <div class="kpi-value">${manager ? pending.length : ownDrafts.length}</div>
        <div class="kpi-meta">${
          manager ? `${hours(sumMinutes(pending))} h inskickade` : `${ownDrafts.length} egna utkast`
        }</div>
      </div>
    </div>

    <section class="card" style="margin-bottom:16px">
      <div class="card-head">
        <h2>Veckoöversikt</h2>
        <span class="hint">Dina timmar · hela projektets timmar</span>
      </div>
      <div class="card-body tight">
        <div class="week-grid">
          ${days
            .map((day) => {
              const iso = `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
              const dayOwn = sumMinutes(reports.filter((report) => report.date === iso && report.userId === user.id));
              const dayTeam = sumMinutes(reports.filter((report) => report.date === iso));
              const weekend = day.getDay() === 0 || day.getDay() === 6;
              return `<button class="week-day${iso === today ? ' today' : ''}${weekend ? ' weekend' : ''}"
                  data-day-add="${iso}" title="Lägg till rapport ${esc(formatDate(iso))}">
                <div class="week-day-name">${day.toLocaleDateString('sv-SE', { weekday: 'short' }).replace('.', '')}</div>
                <div class="week-day-date">${day.getDate()}</div>
                <div class="week-day-hours"><strong>${dayOwn ? hours(dayOwn) : '–'}</strong>${
                  dayTeam ? ` / ${hours(dayTeam)} h` : ''
                }</div>
                <div class="time-bar"><span style="width:${Math.min(
                  100,
                  Math.round((dayOwn / (Number(state.settings.workdayHours) * 60)) * 100),
                )}%"></span></div>
              </button>`;
            })
            .join('')}
        </div>
      </div>
    </section>

    <div class="grid grid-main">
      <div class="stack">
        <section class="card">
          <div class="card-head">
            <h2>Snabbregistrering</h2>
            <span class="hint">Datum: ${esc(formatDate(inThisWeek ? today : anchor))}</span>
          </div>
          <div class="card-body">
            ${quickAddHtml({ defaultDate: inThisWeek ? today : anchor })}
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <h2>Rapporter</h2>
            <span class="hint">${visible.length} st · ${hours(sumMinutes(visible))} h</span>
          </div>
          <div class="card-body tight">
            ${
              visible.length
                ? visible
                    .map((report) => {
                      const status = TIME_STATUS[report.status] ?? TIME_STATUS.utkast;
                      const own = report.userId === user.id;
                      const canEdit = manager || (own && ['utkast', 'avvisad'].includes(report.status));
                      return `<div class="report-row">
                        <div class="report-date">${esc(formatDate(report.date))}</div>
                        <div class="report-main">
                          <strong>${esc(projectName(report.projectId))}</strong>
                          <span class="report-note">${esc(activityName(report.activity))}${
                            manager && !own ? ` · ${esc(userAvatarName(report.userId))}` : ''
                          }${report.note ? ` · ${esc(report.note)}` : ''}</span>
                        </div>
                        <div>${badge(status.label, status.tone)}</div>
                        <div class="report-mins">${hours(report.minutes)} h</div>
                        <div class="report-actions">
                          ${
                            manager && report.status === 'inskickad'
                              ? `<button class="btn btn-sm" data-approve="${report.id}">Godkänn</button>
                                 <button class="btn btn-sm btn-danger" data-reject="${report.id}">Avvisa</button>`
                              : ''
                          }
                          ${
                            own && report.status === 'utkast'
                              ? `<button class="btn btn-sm" data-submit="${report.id}">Skicka</button>`
                              : ''
                          }
                          ${
                            canEdit
                              ? `<button class="btn btn-ghost btn-icon btn-sm" data-edit-report="${report.id}" title="Redigera" aria-label="Redigera rapport">
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 20h4L20 8l-4-4L4 16z"/><path d="m14.5 5.5 4 4"/></svg>
                                </button>`
                              : ''
                          }
                        </div>
                      </div>`;
                    })
                    .join('')
                : emptyWeek()
            }
          </div>
          <div class="card-foot">
            <span>${manager ? 'Godkännande krävs för att låsa veckan' : 'Inskickade rapporter granskas av arbetsledare'}</span>
            <span>${duration(sumMinutes(visible))}</span>
          </div>
        </section>
      </div>

      <div class="stack">
        <section class="card">
          <div class="card-head"><h2>Fördelning per projekt</h2></div>
          <div class="card-body">
            ${
              perProject.length
                ? `<div class="stack" style="gap:14px">${perProject
                    .map(
                      (row) => `<div>
                        <div class="row-between small" style="margin-bottom:5px">
                          <span>${esc(row.project.name)}</span>
                          <strong>${hours(row.minutes)} h</strong>
                        </div>
                        <div class="progress"><span style="width:${Math.round(
                          (row.minutes / maxProjectMinutes) * 100,
                        )}%"></span></div>
                      </div>`,
                    )
                    .join('')}</div>`
                : `<p class="muted small">Ingen tid registrerad i veckan.</p>`
            }
          </div>
        </section>

        <section class="card">
          <div class="card-head"><h2>Status</h2></div>
          <div class="card-body">
            ${Object.entries(TIME_STATUS)
              .map(([key, status]) => {
                const count = reports.filter((report) => report.status === key).length;
                return `<div class="row-between" style="padding:5px 0">
                  <span class="row" style="gap:7px">${badge(status.label, status.tone)}</span>
                  <span class="small muted">${count} rapporter · ${hours(
                    sumMinutes(reports.filter((report) => report.status === key)),
                  )} h</span>
                </div>`;
              })
              .join('')}
          </div>
          <div class="card-foot">
            <span>Veckans mål</span>
            <strong>${hours(target)} h</strong>
          </div>
        </section>

        <section class="card">
          <div class="card-head"><h2>Lägg till manuellt</h2></div>
          <div class="card-body stack">
            <p class="small muted">Behöver du fylla i flera fält, välja annan utförare eller justera status?</p>
            <button class="btn btn-block" data-new-report>Ny tidsrapport</button>
          </div>
        </section>
      </div>
    </div>
  `;
}

function userAvatarName(userId) {
  const state = getState();
  return state.users.find((item) => item.id === userId)?.name ?? 'Okänd';
}

export function mountTime(root) {
  const user = currentUser();
  if (user.role === 'klient') return;

  const anchor = session.weekAnchor;
  const projects = scopedProjects(user);
  const projectIds = projects.map((project) => project.id);

  mountQuickAdd(root, {
    onSave: async (payload) => {
      try {
        await actions.addTimeReport(payload);
        toast(payload.status === 'utkast' ? 'Utkast sparat.' : 'Tidsrapport inskickad.', 'ok');
      } catch (e) {
        toast('Kunde inte spara tidsrapporten.', 'bad');
      }
    },
  });

  root.querySelector('[data-week-prev]')?.addEventListener('click', () =>
    setSession({ weekAnchor: shiftWeek(anchor, -1) }),
  );
  root.querySelector('[data-week-next]')?.addEventListener('click', () =>
    setSession({ weekAnchor: shiftWeek(anchor, 1) }),
  );
  root.querySelector('[data-week-now]')?.addEventListener('click', () =>
    setSession({ weekAnchor: todayIso() }),
  );

  root.querySelectorAll('[data-filter]').forEach((chip) => {
    chip.addEventListener('click', () =>
      setSession({ timeFilter: chip.dataset.filter }),
    );
  });

  root.querySelector('[data-submit-week]')?.addEventListener('click', async () => {
    try {
      await actions.submitWeek(user.id, anchor);
      toast('Veckans utkast skickades in.', 'ok');
    } catch (e) {
      toast('Kunde inte skicka in veckan.', 'bad');
    }
  });

  const newReport = (defaults = {}) =>
    openTimeDialog(null, {
      defaults,
      onSaved: () => {},
    });

  root.querySelectorAll('[data-new-report]').forEach((button) => {
    button.addEventListener('click', () => newReport());
  });

  root.querySelectorAll('[data-day-add]').forEach((button) => {
    button.addEventListener('click', () =>
      newReport({
        date: button.dataset.dayAdd,
        projectId: session.activeProjectId !== 'all' ? session.activeProjectId : projectIds[0],
      }),
    );
  });

  root.querySelectorAll('[data-edit-report]').forEach((button) => {
    button.addEventListener('click', () => {
      const report = getState().timeReports.find((item) => item.id === button.dataset.editReport);
      if (report) openTimeDialog(report, { onSaved: () => {} });
    });
  });

  root.querySelectorAll('[data-approve]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await actions.setTimeStatus(button.dataset.approve, 'godkand');
        toast('Rapporten godkänd.', 'ok');
      } catch (e) {
        toast('Kunde inte godkänna rapporten.', 'bad');
      }
    });
  });

  root.querySelectorAll('[data-reject]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await actions.setTimeStatus(button.dataset.reject, 'avvisad');
        toast('Rapporten avvisad.');
      } catch (e) {
        toast('Kunde inte avvisa rapporten.', 'bad');
      }
    });
  });

  root.querySelectorAll('[data-submit]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await actions.setTimeStatus(button.dataset.submit, 'inskickad');
        toast('Rapporten inskickad.', 'ok');
      } catch (e) {
        toast('Kunde inte skicka in rapporten.', 'bad');
      }
    });
  });
}
