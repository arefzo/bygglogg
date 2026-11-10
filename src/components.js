// Återanvändbara gränssnittsdelar: snabbregistrering av tid och tidsdialog.

import { parseTimeInput, formatDuration } from './parser.js';
import { icon } from './icons.js';
import {
  actions,
  accessibleProjects,
  activityName,
  can,
  currentUser,
  getState,
  photosFor,
  projectName,
  sessionPrefs,
  userName,
} from './store.js';
import { esc, openDialog, toast } from './ui.js';

export function projectOptions(selectedId, { all = false, user = currentUser() } = {}) {
  const projects = accessibleProjects(user);
  const options = [];
  if (all) {
    options.push(`<option value="all"${selectedId === 'all' ? ' selected' : ''}>Alla projekt</option>`);
  }
  projects.forEach((project) => {
    options.push(
      `<option value="${project.id}"${project.id === selectedId ? ' selected' : ''}>${esc(
        `${project.number} · ${project.name}`,
      )}</option>`,
    );
  });
  return options.join('');
}

export function activityOptions(selectedId) {
  return getState()
    .activities.map(
      (activity) =>
        `<option value="${activity.id}"${activity.id === selectedId ? ' selected' : ''}>${esc(
          activity.name,
        )}</option>`,
    )
    .join('');
}

export function userOptions(selectedId) {
  return getState()
    .users.filter((user) => user.active)
    .map(
      (user) =>
        `<option value="${user.id}"${user.id === selectedId ? ' selected' : ''}>${esc(
          user.name,
        )}</option>`,
    )
    .join('');
}

/** Snabbregistrering med naturlig tidsbeskrivning. */
export function quickAddHtml({ defaultDate = sessionPrefs.daybookDate } = {}) {
  const state = getState();
  const user = currentUser();
  const projects = accessibleProjects(user);
  const defaultProject =
    sessionPrefs.activeProjectId !== 'all' &&
    projects.some((project) => project.id === sessionPrefs.activeProjectId)
      ? sessionPrefs.activeProjectId
      : projects[0]?.id ?? '';
  const today = defaultDate;

  return `
    <form data-quickadd class="stack" novalidate>
      <div class="field">
        <label class="field-label" for="nl-input">Beskriv arbetstiden med egna ord</label>
        <div class="nl-input-row">
          <input id="nl-input" class="input" data-nl-input autocomplete="off" spellcheck="false"
            placeholder='t.ex. "igår 7:30-16:00" eller "2h 30m"' />
          <button type="button" class="btn btn-dark" data-nl-apply>Tolka</button>
        </div>
      </div>
      <div class="nl-preview" data-nl-preview aria-live="polite">
        <span class="muted">Skriv en tid – datum, tider och minuter fylls i automatiskt.</span>
      </div>
      <div class="form-grid">
        <div class="field">
          <label>Datum</label>
          <input type="date" class="input" name="date" data-f-date value="${today}" required />
        </div>
        <div class="field">
          <label>Projekt</label>
          <select class="select" name="projectId" data-f-project required>
            ${projectOptions(defaultProject, { user })}
          </select>
        </div>
        <div class="field">
          <label>Aktivitet</label>
          <select class="select" name="activity" data-f-activity>
            ${activityOptions(state.activities[0]?.id)}
          </select>
        </div>
        <div class="field">
          <label>Minuter</label>
          <input type="number" class="input" name="minutes" data-f-minutes min="1" max="1440" step="5" required />
          <span class="hint" data-min-hint>–</span>
        </div>
        <div class="field span-2">
          <label>Anteckning <span class="muted">(valfri)</span></label>
          <input class="input" name="note" data-f-note maxlength="140" placeholder="T.ex. arbetsmoment eller avvikelse" />
        </div>
      </div>
      <label class="check" data-lunch-wrap hidden>
        <input type="checkbox" data-f-lunch />
        <span>Dra av ${state.settings.lunchMinutes} min lunch (intervallet passerar lunch)</span>
      </label>
      <div class="row-between">
        <div class="chip-row">
          <button type="button" class="chip" data-example="igår 7:30-16:00">igår 7:30–16:00</button>
          <button type="button" class="chip" data-example="2h 30m">2h 30m</button>
          <button type="button" class="chip" data-example="måndag 6 timmar">måndag 6 timmar</button>
          <button type="button" class="chip" data-example="45 min">45 min</button>
        </div>
        <div class="row">
          <button type="button" class="btn" data-save="utkast">Spara utkast</button>
          <button type="submit" class="btn btn-primary" data-save="inskickad">
            Spara &amp; skicka
          </button>
        </div>
      </div>
    </form>
  `;
}

export function mountQuickAdd(root, { onSave } = {}) {
  const form = root.matches?.('[data-quickadd]') ? root : root.querySelector('[data-quickadd]');
  if (!form) return;

  const input = form.querySelector('[data-nl-input]');
  const dateInput = form.querySelector('[data-f-date]');
  const minutesInput = form.querySelector('[data-f-minutes]');
  const preview = form.querySelector('[data-nl-preview]');
  const minHint = form.querySelector('[data-min-hint]');
  const lunchWrap = form.querySelector('[data-lunch-wrap]');
  const lunchCheck = form.querySelector('[data-f-lunch]');
  const projectSelect = form.querySelector('[data-f-project]');
  const activitySelect = form.querySelector('[data-f-activity]');
  const noteInput = form.querySelector('[data-f-note]');

  const state = getState();
  const lunchMinutes = Number(state.settings.lunchMinutes) || 30;
  let parsed = null;
  let lastRangeMinutes = null;
  let manualEdit = false;

  const updateHint = () => {
    const minutes = Number(minutesInput.value);
    minHint.textContent = Number.isFinite(minutes) && minutes > 0 ? formatDuration(minutes) : '–';
  };

  const applyLunch = () => {
    if (!parsed) return;
    const base = parsed.minutes;
    const deduction = lunchCheck.checked && !lunchWrap.hidden ? lunchMinutes : 0;
    minutesInput.value = Math.max(0, base - deduction);
    lastRangeMinutes = base - deduction;
    manualEdit = false;
    updateHint();
    renderPreview();
  };

  const renderPreview = () => {
    if (!parsed) {
      preview.innerHTML = `<span class="muted">Skriv en tid – datum, tider och minuter fylls i automatiskt.</span>`;
      return;
    }
    if (!parsed.ok) {
      preview.innerHTML = `<span class="parsed bad">Tolkning misslyckades</span><span class="muted">${esc(
        parsed.summary,
      )}</span>`;
      return;
    }
    const deduction =
      lunchCheck.checked && !lunchWrap.hidden ? ` · lunch ${lunchMinutes} min dragen` : '';
    const manual = manualEdit ? ' · minuter justerade manuellt' : '';
    preview.innerHTML = `
      <span class="parsed">✓ ${esc(parsed.summary)}</span>
      <span class="muted">${deduction || manual ? esc(deduction + manual) : 'Tolkat från fritext'}</span>
    `;
  };

  const parseInput = () => {
    parsed = parseTimeInput(input.value);
    manualEdit = false;
    if (parsed.ok) {
      dateInput.value = parsed.date;
      lunchWrap.hidden = !parsed.lunchHint;
      lunchCheck.disabled = !parsed.lunchHint;
      lunchCheck.checked = Boolean(parsed.lunchHint && state.settings.autoLunch);
      lastRangeMinutes = parsed.minutes;
      applyLunch();
    } else {
      lunchWrap.hidden = true;
      lunchCheck.checked = false;
      lastRangeMinutes = null;
      updateHint();
      renderPreview();
    }
  };

  input.addEventListener('input', parseInput);
  form.querySelector('[data-nl-apply]')?.addEventListener('click', () => {
    parseInput();
    if (!parsed?.ok) toast('Kunde inte tolka tiden – prova ett annat format.', 'bad');
  });

  lunchCheck.addEventListener('change', applyLunch);
  minutesInput.addEventListener('input', () => {
    lastRangeMinutes = null;
    manualEdit = true;
    updateHint();
    renderPreview();
  });

  form.querySelectorAll('[data-example]').forEach((chip) => {
    chip.addEventListener('click', () => {
      input.value = chip.dataset.example;
      parseInput();
      input.focus();
    });
  });

  form.querySelectorAll('[data-save]').forEach((button) => {
    if (button.type !== 'submit') {
      button.addEventListener('click', () => {
        form.dataset.status = button.dataset.save;
        form.requestSubmit();
      });
    } else {
      button.addEventListener('click', () => {
        form.dataset.status = button.dataset.save;
      });
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const minutes = Number(minutesInput.value);
    if (!dateInput.value) return toast('Välj datum.', 'bad');
    if (!projectSelect.value) return toast('Välj projekt.', 'bad');
    if (!Number.isFinite(minutes) || minutes <= 0) {
      return toast('Ange antal minuter, eller beskriv tiden i fritext.', 'bad');
    }
    const status = form.dataset.status === 'utkast' ? 'utkast' : 'inskickad';
    const payload = {
      date: dateInput.value,
      projectId: projectSelect.value,
      activity: activitySelect.value,
      minutes,
      note: noteInput.value.trim(),
      status,
      source: input.value.trim() || null,
    };
    if (onSave) {
      onSave(payload);
    } else {
      try {
        await actions.addTimeReport(payload);
        toast(status === 'utkast' ? 'Utkast sparat.' : 'Tidsrapport inskickad.', 'ok');
      } catch (e) {
        toast('Kunde inte spara tidsrapporten.', 'bad');
      }
    }
    input.value = '';
    noteInput.value = '';
    minutesInput.value = '';
    parsed = null;
    lunchWrap.hidden = true;
    preview.innerHTML = `<span class="muted">Skriv en tid – datum, tider och minuter fylls i automatiskt.</span>`;
    updateHint();
  });

  updateHint();
}

/** Dialog för att skapa eller redigera en tidsrapport. */
export function openTimeDialog(report = null, { onSaved, defaults = {} } = {}) {
  const state = getState();
  const user = currentUser();
  const manager = can('approveTime', user);
  const projects = accessibleProjects(user);
  const selectedProject =
    report?.projectId ?? defaults.projectId ?? projects[0]?.id ?? '';
  const selectedUser = report?.userId ?? user.id;
  const today = report?.date ?? defaults.date ?? sessionPrefs.daybookDate;

  const body = `
    <div class="form-grid">
      <div class="field">
        <label for="td-date">Datum</label>
        <input id="td-date" type="date" class="input" name="date" value="${esc(today)}" required />
      </div>
      <div class="field">
        <label for="td-minutes">Minuter</label>
        <input id="td-minutes" type="number" class="input" name="minutes" min="1" max="1440" step="5"
          value="${report?.minutes ?? defaults.minutes ?? 480}" required />
      </div>
      <div class="field span-2">
        <label for="td-project">Projekt</label>
        <select id="td-project" class="select" name="projectId">${projectOptions(selectedProject, { user })}</select>
      </div>
      <div class="field">
        <label for="td-activity">Aktivitet</label>
        <select id="td-activity" class="select" name="activity">${activityOptions(
          report?.activity ?? defaults.activity,
        )}</select>
      </div>
      ${
        manager
          ? `<div class="field">
              <label for="td-user">Utförare</label>
              <select id="td-user" class="select" name="userId">${userOptions(selectedUser)}</select>
            </div>`
          : `<input type="hidden" name="userId" value="${selectedUser}" />`
      }
      ${
        manager
          ? `<div class="field span-2">
              <label for="td-status">Status</label>
              <select id="td-status" class="select" name="status">
                ${Object.entries({ utkast: 'Utkast', inskickad: 'Inskickad', godkand: 'Godkänd', avvisad: 'Avvisad' })
                  .map(
                    ([value, label]) =>
                      `<option value="${value}"${(report?.status ?? 'inskickad') === value ? ' selected' : ''}>${label}</option>`,
                  )
                  .join('')}
              </select>
            </div>`
          : `<input type="hidden" name="status" value="${report?.status ?? 'inskickad'}" />`
      }
      <div class="field span-2">
        <label for="td-note">Anteckning</label>
        <textarea id="td-note" class="textarea" name="note" rows="3" maxlength="300">${esc(
          report?.note ?? '',
        )}</textarea>
      </div>
    </div>
  `;

  const footer = `
    ${report ? `<button type="button" class="btn btn-danger" data-delete>Ta bort</button>` : '<span></span>'}
    <div class="row">
      <button type="button" class="btn" data-close>Avbryt</button>
      <button type="submit" class="btn btn-primary">${report ? 'Spara ändringar' : 'Lägg till rapport'}</button>
    </div>
  `;

  const dialog = openDialog({
    title: report ? 'Redigera tidsrapport' : 'Ny tidsrapport',
    body,
    footer,
    onSubmit: async (data) => {
      const minutes = Number(data.minutes);
      if (!Number.isFinite(minutes) || minutes <= 0) {
        toast('Ange minuter större än noll.', 'bad');
        return false;
      }
      const payload = {
        date: data.date,
        projectId: data.projectId,
        userId: data.userId ?? selectedUser,
        activity: data.activity,
        minutes,
        note: data.note ?? '',
        status: data.status ?? 'utkast',
      };
      if (report) {
        try {
          await actions.updateTimeReport(report.id, payload);
          toast('Tidsrapporten uppdaterad.', 'ok');
        } catch (e) {
          toast('Kunde inte uppdatera tidsrapporten.', 'bad');
          return false;
        }
      } else {
        try {
          await actions.addTimeReport({ ...payload, source: null });
          toast('Tidsrapport tillagd.', 'ok');
        } catch (e) {
          toast('Kunde inte lägga till tidsrapporten.', 'bad');
          return false;
        }
      }
      onSaved?.();
      return true;
    },
  });

  dialog.querySelector('[data-delete]')?.addEventListener('click', async () => {
    if (!report) return;
    if (!window.confirm('Ta bort tidsrapporten?')) return;
    try {
      await actions.deleteTimeReport(report.id);
      dialog.remove();
      toast('Tidsrapport borttagen.');
      onSaved?.();
    } catch (e) {
      toast('Kunde inte ta bort tidsrapporten.', 'bad');
    }
  });

  return dialog;
}

export function reportDescription(report) {
  return `${projectName(report.projectId)} · ${activityName(report.activity)}`;
}

export function reportOwner(report) {
  return userName(report.userId);
}

/* ------------------------------------------------------------------ */
/* Foto / kameraroll                                                  */
/* ------------------------------------------------------------------ */

const MAX_IMAGE_MB = 5;

export function photoRollHtml(entityType, entityId) {
  const photos = photosFor(entityType, entityId);
  const empty = photos.length
    ? ''
    : '<div class="empty small" style="padding:10px">Inga foton ännu. Ta ett foto eller välj en fil.</div>';
  return `
    <div class="photo-roll" data-photo-roll>
      <div class="field" style="grid-column:1/-1">
        <label class="field-label">Foton – kamera eller fil</label>
        <div class="row" style="gap:8px;align-items:center">
          <input type="file" class="input" accept="image/*" capture="environment"
            multiple data-photo-input style="width:auto;flex:0 1 auto" />
          <span class="hint">Max ${MAX_IMAGE_MB} MB per bild. Foton sparas lokalt i webbläsaren.</span>
        </div>
      </div>
      <div class="photo-grid" style="grid-column:1/-1">
        ${photos.length ? photos.map((photo) => photoCard(photo, entityType, entityId)).join('') : empty}
      </div>
    </div>
  `;
}

function photoCard(photo, entityType, entityId) {
  return `
    <div class="photo-card" data-photo="${photo.id}">
      <img src="${esc(photo.dataUrl)}" alt="${esc(photo.name)}" loading="lazy" />
      <div class="photo-foot">
        <span class="photo-name" title="${esc(photo.name)}">${esc(photo.name)}</span>
        <button type="button" class="btn btn-ghost btn-icon btn-sm" data-remove-photo="${photo.id}"
          title="Ta bort foto" aria-label="Ta bort foto">
          ${icon('trash', 14)}
        </button>
      </div>
    </div>
  `;
}

export function mountPhotoRoll(root, entityType, entityId) {
  const roll = root.matches?.('[data-photo-roll]')
    ? root
    : root.querySelector('[data-photo-roll]');
  if (!roll) return;

  const input = roll.querySelector('[data-photo-input]');
  input.addEventListener('change', async (event) => {
    const files = [...(event.target.files ?? [])];
    for (const file of files) {
      if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
        toast(`${file.name} är för stor (max ${MAX_IMAGE_MB} MB).`, 'bad');
        continue;
      }
      try {
        const dataUrl = await readAsDataUrl(file);
        actions.addPhoto(entityType, entityId, { dataUrl, name: file.name, type: file.type, size: file.size });
        toast('Foto tillagt.', 'ok');
      } catch {
        toast('Kunde inte läsa filen.', 'bad');
      }
    }
    input.value = '';
    renderPhotoRoll(root, entityType, entityId);
  });

  roll.addEventListener('click', (event) => {
    const remove = event.target.closest('[data-remove-photo]');
    if (remove) {
      actions.removePhoto(entityType, entityId, remove.dataset.removePhoto);
      toast('Foto borttaget.');
      renderPhotoRoll(root, entityType, entityId);
      return;
    }
    const card = event.target.closest('[data-photo]');
    if (card) openLightbox(card.querySelector('img').src, card.querySelector('.photo-name').textContent);
  });
}

export function renderPhotoRoll(root, entityType, entityId) {
  const roll = root.matches?.('[data-photo-roll]')
    ? root
    : root.querySelector('[data-photo-roll]');
  if (!roll) return;
  const grid = roll.querySelector('.photo-grid');
  const photos = photosFor(entityType, entityId);
  grid.innerHTML = photos.length
    ? photos.map((photo) => photoCard(photo, entityType, entityId)).join('')
    : `<div class=\"empty small\" style=\"padding:10px\">Inga foton ännu. Ta ett foto eller välj en fil.</div>`;
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function openLightbox(src, title) {
  closeDialogs();
  const dialog = document.createElement('dialog');
  dialog.dataset.appDialog = 'true';
  dialog.style.width = 'min(90vw, 90vh)';
  dialog.style.height = 'min(90vh, 700px)';
  dialog.innerHTML = `\n    <form method=\"dialog\" novalidate>\n      <div class=\"dialog-head\">\n        <h2>${esc(title)}</h2>\n        <button type=\"button\" class=\"btn btn-ghost btn-icon\" data-close aria-label=\"Stäng\">\n          <svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\"><path d=\"m6 6 12 12M18 6 6 18\"/></svg>\n        </button>\n      </div>\n      <div class=\"dialog-body\" style=\"padding:0;display:flex;align-items:center;justify-content:center\">\n        <img src=\"${esc(src)}\" style=\"max-width:100%;max-height:100%;object-fit:contain;background:#000\" />\n      </div>\n      <div class=\"dialog-foot\"><button type=\"submit\" class=\"btn\">Stäng</button></div>\n    </form>\n  `;
  document.body.append(dialog);
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.remove());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.remove(); });
  dialog.showModal();
}

/**
 * Öppnar en dialog med kameraroll för en entitet (entry eller inspection-item).
 * @param {string} entityType 'entry' | 'inspection-item'
 * @param {string} entityId
 * @param {{title?: string}} opts
 */
export function openPhotoDialog(entityType, entityId, { title = 'Foton' } = {}) {
  const dialog = openDialog({
    title,
    body: photoRollHtml(entityType, entityId),
    footer: `<div class=\"row\"><button type=\"button\" class=\"btn\" data-close>Stäng</button></div>`,
    size: 'min(560px, 92vw)',
  });
  mountPhotoRoll(dialog, entityType, entityId);
  renderPhotoRoll(dialog, entityType, entityId);
  return dialog;
}
