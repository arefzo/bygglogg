// Byggdagboken – dagens inlägg, publicering och låsning.

import {
  ENTRY_TYPES,
  WEATHER,
  actions,
  can,
  currentUser,
  getState,
  projectName,
  scopedProjects,
  sessionPrefs,
  sumMinutes,
  todayIso,
  weekDays,
  weekNumber,
  weekStart,
  userName,
  photosFor,
} from '../store.js';
import { icon } from '../icons.js';
import { formatHours } from '../parser.js';
import {
  avatar,
  badge,
  esc,
  formatDate,
  formatLongDate,
  openDialog,
  timeOf,
  toast,
} from '../ui.js';
import { mountPhotoRoll, openPhotoDialog } from '../components.js';

const pad = (n) => String(n).padStart(2, '0');

function dayData(date, projectIds, isClient) {
  const state = getState();
  const entries = state.entries
    .filter((entry) => entry.date === date && projectIds.includes(entry.projectId))
    .filter((entry) => !isClient || entry.published)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const reports = state.timeReports.filter(
    (report) => report.date === date && projectIds.includes(report.projectId),
  );
  return {
    entries,
    reports,
    locked: entries.length > 0 && entries.every((entry) => entry.locked),
    published: entries.length > 0 && entries.every((entry) => entry.published),
  };
}

function typeChips(selected = ['arbete']) {
  const selectedTypes = new Set(Array.isArray(selected) ? selected : [selected]);
  return Object.entries(ENTRY_TYPES)
    .map(
      ([value, type]) => `
      <button type="button" class="chip${selectedTypes.has(value) ? ' active' : ''}" data-type="${value}" aria-pressed="${selectedTypes.has(value)}">
        ${esc(type.label)}
      </button>`,
    )
    .join('');
}

function mountTypeSelector(form) {
  const primaryInput = form.querySelector('[data-type-input]');
  const valuesHost = form.querySelector('[data-type-values]');
  if (!primaryInput || !valuesHost) return;

  form.querySelectorAll('[data-type]').forEach((chip) => {
    chip.addEventListener('click', () => {
      const selected = new Set(
        [...form.querySelectorAll('[data-type].active')].map((item) => item.dataset.type),
      );
      const value = chip.dataset.type;
      if (selected.has(value)) {
        if (selected.size === 1) return;
        selected.delete(value);
      } else {
        selected.add(value);
      }
      const types = [...selected];
      primaryInput.value = types[0];
      valuesHost.innerHTML = types
        .map((type) => `<input type="hidden" name="types" value="${type}" />`)
        .join('');
      form.querySelectorAll('[data-type]').forEach((item) => {
        const active = selected.has(item.dataset.type);
        item.classList.toggle('active', active);
        item.setAttribute('aria-pressed', String(active));
      });
    });
  });
}

function editorFields({ entry = null, projects, canPublish }) {
  const projectId = entry?.projectId ?? projects[0]?.id ?? '';
  const prefix = entry ? 'edit' : 'new';
  const selectedTypes = entry?.types?.length ? entry.types : [entry?.type ?? 'arbete'];
  return `
    <input type="hidden" name="type" value="${esc(selectedTypes[0])}" data-type-input />
    <div data-type-values>${selectedTypes.map((type) => `<input type="hidden" name="types" value="${esc(type)}" />`).join('')}</div>
    <div class="chip-row" data-type-chips role="group" aria-label="Kategorier, välj en eller flera">
      ${typeChips(selectedTypes)}
    </div>
    <div class="field">
      <label for="${prefix}-entry-text">Vad har hänt på plats?</label>
      <textarea id="${prefix}-entry-text" class="textarea" name="text" rows="5" required
        placeholder="Beskriv arbetet, hinder, material eller besök. Skriv kort och konkret.">${esc(
          entry?.text ?? '',
        )}</textarea>
    </div>
    <div class="form-grid">
      <div class="field">
        <label for="${prefix}-entry-project">Projekt</label>
        <select id="${prefix}-entry-project" class="select" name="projectId"${entry ? ' disabled' : ''}>
          ${projects
            .map(
              (project) =>
                `<option value="${project.id}"${project.id === projectId ? ' selected' : ''}>${esc(
                  `${project.number} · ${project.name}`,
                )}</option>`,
            )
            .join('')}
        </select>
      </div>
      <div class="field">
        <label for="${prefix}-entry-weather">Väder</label>
        <select id="${prefix}-entry-weather" class="select" name="weather">
          <option value="">Inget väder</option>
          ${WEATHER.map(
            (weather) =>
              `<option value="${weather}"${entry?.weather === weather ? ' selected' : ''}>${weather}</option>`,
          ).join('')}
        </select>
      </div>
      <div class="field">
        <label for="${prefix}-entry-temp">Temperatur (°C)</label>
        <input id="${prefix}-entry-temp" type="number" class="input" name="temperature" min="-50" max="50" step="0.5"
          value="${entry?.temperature ?? ''}" placeholder="t.ex. 18" />
      </div>
    </div>
    ${
      entry || !canPublish
        ? ''
        : `<label class="check">
            <input type="checkbox" name="publish" checked />
            <span>Publicera inlägget direkt för beställaren</span>
          </label>`
    }
  `;
}

function editorHtml({ entry = null, projects, canPublish }) {
  return `
    <form data-entry-form class="stack" novalidate>
      ${editorFields({ entry, projects, canPublish })}
      <div class="row-between">
        <span class="hint">${esc(formatLongDate(entry?.date ?? sessionPrefs.daybookDate))}</span>
        <button type="submit" class="btn btn-primary">${entry ? 'Spara ändringar' : 'Lägg till inlägg'}</button>
      </div>
    </form>
  `;
}

function entryHtml(entry, { canWrite, canPublish, canComment }) {
  const types = Array.isArray(entry.types) && entry.types.length ? entry.types : [entry.type ?? 'arbete'];
  const typeBadges = types.map((value) => ENTRY_TYPES[value]).filter(Boolean);
  const comments = entry.comments ?? [];
  return `
    <article class="entry${types.includes('hinder') ? ' obstruction' : ''}">
      <div class="entry-head">
        ${typeBadges.map((type) => badge(type.label, type.tone)).join('')}
        <span class="entry-time">${timeOf(entry.createdAt)}</span>
        <span class="small muted">${esc(projectName(entry.projectId))}</span>
        ${entry.published ? '' : badge('Utkast', 'muted')}
        ${entry.locked ? badge('Låst', 'steel') : ''}
        ${
          canWrite && !entry.locked
            ? `<span class="entry-actions">
                <button class="btn btn-ghost btn-icon btn-sm" data-edit="${entry.id}" title="Redigera" aria-label="Redigera inlägg">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 20h4L20 8l-4-4L4 16z"/><path d="m14.5 5.5 4 4"/></svg>
                </button>
                <button class="btn btn-ghost btn-icon btn-sm" data-delete="${entry.id}" title="Ta bort" aria-label="Ta bort inlägg">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 7h16M9 7V4h6v3M6.5 7l1 14h9l1-14"/></svg>
                </button>
              </span>`
            : ''
        }
      </div>
      <p class="entry-text">${esc(entry.text)}</p>
      <div class="entry-foot">
        ${avatar(userName(entry.authorId))}
        <span>${esc(userName(entry.authorId))}</span>
        ${entry.weather ? `<span class="weather-pill">· ${esc(entry.weather)}</span>` : ''}
        ${entry.temperature != null ? `<span class="weather-pill">· ${esc(entry.temperature)}°C</span>` : ''}
      </div>
      ${
        comments.length
          ? `<div class="entry-comments">${comments
              .map(
                (comment) => `<div class="comment"><b>${esc(userName(comment.userId))}</b> ${esc(
                  timeOf(comment.createdAt),
                )}<br />${esc(comment.text)}</div>`,
              )
              .join('')}</div>`
          : ''
      }
      ${
        canComment
          ? `<form class="comment-form" data-comment-form="${entry.id}">
              <input class="input" name="comment" placeholder="Skriv en kommentar…" maxlength="240" aria-label="Kommentar" />
              <button class="btn btn-sm" type="submit">Skicka</button>
            </form>`
          : ''
      }
      <div class="entry-photos" style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
        ${photosFor('entry', entry.id)
          .map(
            (photo) => `<img class="entry-photo-img" src="${esc(
              photo.dataUrl,
            )}" alt="${esc(photo.name)}" title="${esc(photo.name)}" />`,
          )
          .join('')}
      </div>
      ${
        canWrite && !entry.locked
          ? `<button type="button" class="btn btn-ghost btn-sm" data-photo-entry="${entry.id}" title="Lägg till foto" aria-label="Lägg till foto">${icon('camera', 14)} Foto</button>`
          : ''
      }
    </article>
  `;
}

export function renderDaybook() {
  const state = getState();
  const user = currentUser();
  const isClient = user.role === 'klient';
  const projects = scopedProjects(user);
  const projectIds = projects.map((project) => project.id);
  const date = sessionPrefs.daybookDate;
  const data = dayData(date, projectIds, isClient);
  const week = weekDays(weekStart(new Date(`${date}T12:00:00`)));
  const canWrite = can('writeDaybook', user) && !isClient;
  const canPublish = can('publishDaybook', user) && !isClient;
  const canComment = canWrite || isClient;
  const reports = data.reports;

  return `
    <header class="page-head">
      <div>
        <div class="eyebrow">Byggdagbok · vecka ${weekNumber(new Date(`${date}T12:00:00`))}</div>
        <h1>Dagboken</h1>
        <p class="page-sub">${esc(formatLongDate(date))}${
          projects.length === 1 ? ` · ${esc(projects[0].name)}` : ''
        }</p>
      </div>
      <div class="page-actions">
        <button class="btn" data-print>Skriv ut</button>
        ${
          canPublish
            ? data.locked
              ? `<button class="btn" data-unlock>Lås upp dagen</button>`
              : `<button class="btn" data-lock ${data.entries.length ? '' : 'disabled'}>Lås dagen</button>`
            : ''
        }
        ${
          canPublish
            ? `<button class="btn btn-primary" data-publish ${
                data.locked || data.published || !data.entries.length ? 'disabled' : ''
              }>Publicera dagen</button>`
            : ''
        }
      </div>
    </header>

    <div class="datebar" style="margin-bottom:16px">
      <div class="date-nav">
        <button class="btn btn-icon" data-day-prev aria-label="Föregående dag">‹</button>
        <div class="date-title">
          ${esc(formatDate(date))}
          <span>${data.locked ? 'Låst dag' : data.published ? 'Publicerad' : 'Utkast'}</span>
        </div>
        <button class="btn btn-icon" data-day-next aria-label="Nästa dag">›</button>
        <button class="btn btn-sm" data-day-today>Idag</button>
      </div>
      <div class="chip-row">
        ${week
          .map((day) => {
            const iso = `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
            const summary = dayData(iso, projectIds, isClient);
            const active = iso === date;
            return `<button class="chip${active ? ' active' : ''}" data-day="${iso}"
              title="${esc(formatLongDate(iso))}">${day.toLocaleDateString('sv-SE', { weekday: 'short' }).replace('.', '')}
              ${day.getDate()}${summary.entries.length ? '<span class="day-dot"></span>' : ''}</button>`;
          })
          .join('')}
      </div>
      <div class="row">
        ${data.locked ? badge('Låst', 'steel') : data.published ? badge('Publicerad', 'ok') : badge('Ej publicerad', 'muted')}
        <span class="hint">${data.entries.length} inlägg · ${sumMinutes(reports) ? `${formatHours(sumMinutes(reports))} tid` : 'ingen tid'}</span>
      </div>
    </div>

    <div class="grid grid-main">
      <section class="card">
        <div class="card-head">
          <h2>Inlägg ${esc(formatDate(date))}</h2>
          <span class="hint">${data.entries.length} st</span>
        </div>
        <div class="card-body tight">
          ${
            data.entries.length
              ? data.entries
                  .map((entry) =>
                    entryHtml(entry, {
                      canWrite: can('writeDaybook', user) && !isClient,
                      canPublish,
                      canComment,
                    }),
                  )
                  .join('')
              : `<div class="empty"><strong>Inga inlägg den här dagen</strong>${
                  data.locked ? 'Dagen är låst.' : 'Skriv det första inlägget till höger.'
                }</div>`
          }
        </div>
        ${
          data.locked
            ? `<div class="card-foot">Dagen är låst och kan inte ändras. Lås upp för att redigera.</div>`
            : ''
        }
      </section>

      <div class="stack">
        ${
          data.locked
            ? `<div class="locked-note">${icon('lock', 16)} Dagen är låst. Kontakta en arbetsledare för att låsa upp.</div>`
            : canWrite
              ? `<section class="card">
                  <div class="card-head">
                    <h2>Nytt inlägg</h2>
                    <span class="hint">${esc(formatDate(date))}</span>
                  </div>
                  <div class="card-body">
                    ${editorHtml({ projects, canPublish })}
                  </div>
                </section>`
              : `<section class="card"><div class="card-body">
                  <p class="muted small">Du har läsbehörighet i dagboken. Kontakta en arbetsledare för att skriva inlägg.</p>
                </div></section>`
        }

        <section class="card">
          <div class="card-head">
            <h2>Dagens tider</h2>
            <a class="btn btn-ghost btn-sm" href="#/tid">Öppna →</a>
          </div>
          <div class="card-body">
            <div class="row-between" style="margin-bottom:${reports.length ? '12px' : '0'}">
              <span class="muted small">${reports.length} rapporter</span>
              <strong style="font-size:18px">${formatHours(sumMinutes(reports))}</strong>
            </div>
            ${
              reports.length
                ? `<div class="stack" style="gap:8px">${reports
                    .map(
                      (report) => `<div class="row-between small">
                        <span>${esc(userName(report.userId))}</span>
                        <span class="muted">${formatHours(report.minutes)}</span>
                      </div>`,
                    )
                    .join('')}</div>`
                : `<p class="muted small">Ingen tid registrerad för dagen.</p>`
            }
          </div>
        </section>
      </div>
    </div>
  `;
}

export function mountDaybook(root) {
  const user = currentUser();
  const projects = scopedProjects(user);
  const projectIds = projects.map((project) => project.id);
  const date = sessionPrefs.daybookDate;

  const shiftDay = (days) => {
    const next = new Date(`${date}T12:00:00`);
    next.setDate(next.getDate() + days);
    sessionPrefs.daybookDate = `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
  };

  root.querySelector('[data-day-prev]')?.addEventListener('click', () => shiftDay(-1));
  root.querySelector('[data-day-next]')?.addEventListener('click', () => shiftDay(1));
  root.querySelector('[data-day-today]')?.addEventListener('click', () =>
    sessionPrefs.daybookDate = todayIso(),
  );
  root.querySelectorAll('[data-day]').forEach((button) => {
    button.addEventListener('click', () => sessionPrefs.daybookDate = button.dataset.day);
  });

  root.querySelector('[data-print]')?.addEventListener('click', () => window.print());

  root.querySelector('[data-publish]')?.addEventListener('click', async () => {
    try {
      await actions.publishDay(projectIds, date);
      toast('Dagen publicerad.', 'ok');
    } catch (e) {
      toast('Kunde inte publicera dagen.', 'bad');
    }
  });

  root.querySelector('[data-lock]')?.addEventListener('click', async () => {
    if (!window.confirm('Låsa dagen? Inläggen kan inte längre ändras.')) return;
    try {
      await actions.lockDay(projectIds, date);
      toast('Dagen är låst.', 'ok');
    } catch (e) {
      toast('Kunde inte låsa dagen.', 'bad');
    }
  });

  root.querySelector('[data-unlock]')?.addEventListener('click', async () => {
    try {
      await actions.unlockDay(projectIds, date);
      toast('Dagen är upplåst.');
    } catch (e) {
      toast('Kunde inte låsa upp dagen.', 'bad');
    }
  });

  // Typval i editorn
  const composer = root.querySelector('[data-entry-form]');
  if (composer) {
    mountTypeSelector(composer);

    composer.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = new FormData(composer);
      const text = String(data.get('text') ?? '').trim();
      if (text.length < 3) {
        toast('Skriv minst några ord om vad som hänt.', 'bad');
        return;
      }
      try {
        await actions.addEntry({
          projectId: data.get('projectId') || projectIds[0],
          type: data.get('type') || 'arbete',
          types: data.getAll('types'),
          text,
          weather: data.get('weather') || '',
          temperature: data.get('temperature') ? Number(data.get('temperature')) : null,
          date,
          publish: data.get('publish') === 'on',
        });
        toast('Inlägget sparat.', 'ok');
        composer.reset();
      } catch (e) {
        toast('Kunde inte spara inlägget.', 'bad');
      }
    });
  }

  // Redigera
  root.querySelectorAll('[data-edit]').forEach((button) => {
    button.addEventListener('click', () => {
      const entry = getState().entries.find((item) => item.id === button.dataset.edit);
      if (!entry) return;
      const dialog = openDialog({
        title: 'Redigera inlägg',
        body: `<div class="stack">${editorFields({
          entry,
          projects,
          canPublish: can('publishDaybook', user),
        })}</div>`,
        footer: `<div class="row">
          <button type="button" class="btn" data-close>Avbryt</button>
          <button type="submit" class="btn btn-primary">Spara</button>
        </div>`,
        onSubmit: async (data, form) => {
          const text = String(data.text ?? '').trim();
          if (text.length < 3) {
            toast('Texten är för kort.', 'bad');
            return false;
          }
          try {
            await actions.updateEntry(entry.id, {
              type: data.type || entry.type,
              types: new FormData(form).getAll('types'),
              text,
              weather: data.weather ?? '',
              temperature: data.temperature ? Number(data.temperature) : null,
            });
            toast('Inlägget uppdaterat.', 'ok');
            return true;
          } catch (e) {
            toast('Kunde inte uppdatera inlägget.', 'bad');
            return false;
          }
        },
      });

      const form = dialog.querySelector('form');
      mountTypeSelector(form);
    });
  });

  // Ta bort
  root.querySelectorAll('[data-delete]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!window.confirm('Ta bort inlägget?')) return;
      try {
        await actions.deleteEntry(button.dataset.delete);
        toast('Inlägget borttaget.');
      } catch (e) {
        toast('Kunde inte ta bort inlägget.', 'bad');
      }
    });
  });

  // Kommentarer
  root.querySelectorAll('[data-comment-form]').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const input = form.querySelector('input[name="comment"]');
      const text = input.value.trim();
      if (!text) return;
      try {
        await actions.addComment(form.dataset.commentForm, text);
        toast('Kommentar tillagd.', 'ok');
        input.value = '';
      } catch (e) {
        toast('Kunde inte lägga till kommentar.', 'bad');
      }
    });
  });

  // Foton / kameraroll per inlägg
  root.querySelectorAll('[data-photo-entry]').forEach((button) => {
    button.addEventListener('click', () => {
      openPhotoDialog('entry', button.dataset.photoEntry, { title: 'Foton – inlägg' });
    });
  });
}
