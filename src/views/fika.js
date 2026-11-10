// Fika / att-göra-lista – uppgifter med ansvarig, bild, beskrivning och deadline.

import {
  actions,
  can,
  currentUser,
  fikaItems,
  getState,
  projectName,
  scopedProjects,
  session,
  setSession,
  userName,
} from '../store.js';
import { badge, esc, formatDate, formatDateTime, openDialog, toast } from '../ui.js';
import { icon } from '../icons.js';

export function renderFika() {
  const state = getState();
  const user = currentUser();
  const projects = scopedProjects(user);
  const projectIds = projects.map((project) => project.id);
  const items = fikaItems().filter(
    (item) => !item.projectId || projectIds.includes(item.projectId),
  );
  const canManage = can('admin', user) || can('writeDaybook', user);

  const active = items.filter((item) => !item.done);
  const done = items.filter((item) => item.done);

  return `
    <header class="page-head">
      <div>
        <div class="eyebrow">Att-göra-lista · Fika</div>
        <h1>Fika</h1>
        <p class="page-sub">Håll koll på uppgifter på arbetsplatsen. Lägg till vad som ska göras, vem som ansvarar, deadline och bifoga en bild.</p>
      </div>
      <div class="page-actions">
        ${canManage ? `<button class="btn btn-primary" data-new-fika>Ny uppgift</button>` : ''}
      </div>
    </header>

    <div class="grid grid-3" style="margin-bottom:16px">
      <div class="kpi">
        <span class="kpi-accent steel"></span>
        <div class="kpi-label">Aktiva uppgifter</div>
        <div class="kpi-value">${active.length}</div>
        <div class="kpi-meta">${items.length} totalt</div>
      </div>
      <div class="kpi">
        <span class="kpi-accent ok"></span>
        <div class="kpi-label">Klara</div>
        <div class="kpi-value">${done.length}</div>
        <div class="kpi-meta">${items.length ? Math.round((done.length / items.length) * 100) : 0} %</div>
      </div>
      <div class="kpi">
        <span class="kpi-accent bad"></span>
        <div class="kpi-label">Förfallna</div>
        <div class="kpi-value">${overdueCount(active)}</div>
        <div class="kpi-meta">Deadline passerad</div>
      </div>
    </div>

    <section class="card">
      <div class="card-head">
        <h2>Att göra</h2>
        <span class="hint">${active.length} uppgifter kvar</span>
      </div>
      <div class="card-body tight">
        <div class="fika-list">
          ${active.length
            ? active.map((item) => fikaRow(item, false)).join('')
            : `<div class="empty">Inga aktiva uppgifter. Alla klara!`}</div>
        </div>
      </div>
    </section>

    ${done.length
      ? `<section class="card">
          <div class="card-head">
            <h2>Klara</h2>
            <span class="hint">${done.length} uppgifter</span>
          </div>
          <div class="card-body tight">
            <div class="fika-list">
              ${done.map((item) => fikaRow(item, true)).join('')}
            </div>
          </div>
        </section>`
      : ''
    }
  `;
}

function overdueCount(items) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return items.filter((item) => {
    if (!item.deadline) return false;
    return new Date(item.deadline) < today;
  }).length;
}

function fikaRow(item, isDone) {
  const assigned = item.assignedTo ? userName(item.assignedTo) : '–';
  const overdue = !item.done && item.deadline && new Date(item.deadline) < new Date();
  return `
    <div class="fika-item${isDone ? ' fika-done' : ''}${overdue ? ' fika-overdue' : ''}" data-fika="${item.id}">
      <div class="fika-head row-between">
        <label class="check fika-check">
          <input type="checkbox" data-toggle-fika="${item.id}"${item.done ? ' checked' : ''} />
          <span>${esc(item.title)}</span>
        </label>
        ${overdue ? badge('Förfallen', 'bad') : badge(item.deadline ? `Senast ${esc(formatDate(item.deadline, { weekday: false }))}` : 'Inget datum', 'muted')}
      </div>
      <div class="fika-meta row">
        <span class="muted small">${icon('user', 14)} Ansvarig: ${esc(assigned)}</span>
        ${item.projectId ? `<span class="muted small">${icon('building', 14)} ${esc(projectName(item.projectId))}</span>` : ''}
        ${item.image ? `<span class="muted small">${icon('camera', 14)} Bild bifogad</span>` : ''}
      </div>
      ${item.description ? `<div class="fika-desc small muted" style="margin-top:6px">${esc(item.description)}</div>` : ''}
      <div class="fika-actions row" style="margin-top:8px;gap:6px">
        ${item.image ? `<button class="btn btn-ghost btn-sm" data-view-fika-image="${item.id}" title="Visa bild" aria-label="Visa bild">${icon('image', 14)} Visa bild</button>` : ''}
        ${canManageFika(item) ? `<button class="btn btn-ghost btn-sm" data-edit-fika="${item.id}" title="Redigera" aria-label="Redigera">${icon('edit', 14)} Redigera</button>
        <button class="btn btn-danger btn-icon btn-sm" data-delete-fika="${item.id}" title="Ta bort" aria-label="Ta bort">${icon('trash', 14)}</button>` : ''}
      </div>
    </div>
  `;
}

function canManageFika(item) {
  const user = currentUser();
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (item.assignedTo === user.id) return true;
  return false;
}

export function mountFika(root) {
  const user = currentUser();
  const canManage = can('admin', user) || can('writeDaybook', user);

  root.querySelector('[data-new-fika]')?.addEventListener('click', () => fikaDialog());

  root.querySelectorAll('[data-toggle-fika]').forEach((checkbox) => {
    checkbox.addEventListener('change', async () => {
      try {
        await actions.toggleFika(checkbox.dataset.toggleFika);
        toast(checkbox.checked ? 'Uppgiften markerad som klar.' : 'Uppgiften öppnad igen.', 'ok');
      } catch (e) {
        toast('Kunde inte uppdatera uppgiften.', 'bad');
      }
    });
  });

  root.querySelectorAll('[data-edit-fika]').forEach((button) => {
    button.addEventListener('click', () => {
      const item = getState().fika.find((i) => i.id === button.dataset.editFika);
      if (item) fikaDialog(item);
    });
  });

  root.querySelectorAll('[data-delete-fika]').forEach((button) => {
    button.addEventListener('click', async () => {
      const item = getState().fika.find((i) => i.id === button.dataset.deleteFika);
      if (!item) return;
      if (!window.confirm(`Ta bort uppgiften "${item.title}"?`)) return;
      try {
        await actions.deleteFika(button.dataset.deleteFika);
        toast('Uppgiften borttagen.');
      } catch (e) {
        toast('Kunde inte ta bort uppgiften.', 'bad');
      }
    });
  });

  root.querySelectorAll('[data-view-fika-image]').forEach((button) => {
    button.addEventListener('click', () => {
      const item = getState().fika.find((i) => i.id === button.dataset.viewFikaImage);
      if (item?.image) openLightbox(item.image, item.title);
    });
  });
}

function fikaDialog(item = null) {
  const state = getState();
  const users = state.users.filter((u) => u.active);
  const projects = state.projects.filter((p) => p.status !== 'arkiverad');

  const body = `
    <div class="form-grid">
      <div class="field span-2">
        <label for="fk-title">Uppgift <span class="muted">(att göra)</span></label>
        <input id="fk-title" class="input" name="title" value="${esc(item?.title ?? '')}" placeholder="T.ex. Beställ ställning" required />
      </div>
      <div class="field span-2">
        <label for="fk-description">Beskrivning</label>
        <textarea id="fk-description" class="input" name="description" rows="3" placeholder="Vad ska göras?">${esc(item?.description ?? '')}</textarea>
      </div>
      <div class="field">
        <label for="fk-assigned">Ansvarig</label>
        <select id="fk-assigned" class="select" name="assignedTo">
          <option value="">Välj ansvarig</option>
          ${users
            .map(
              (u) =>
                `<option value="${u.id}"${(item?.assignedTo ?? '') === u.id ? ' selected' : ''}>${esc(u.name)} · ${esc(u.role)}</option>`,
            )
            .join('')}
        </select>
      </div>
      <div class="field">
        <label for="fk-project">Projekt</label>
        <select id="fk-project" class="select" name="projectId">
          <option value="">Ingen projektkoppling</option>
          ${projects
            .map(
              (p) =>
                `<option value="${p.id}"${(item?.projectId ?? '') === p.id ? ' selected' : ''}>${esc(`${p.number} · ${p.name}`)}</option>`,
            )
            .join('')}
        </select>
      </div>
      <div class="field">
        <label for="fk-deadline">Deadline</label>
        <input id="fk-deadline" type="date" class="input" name="deadline" value="${esc(item?.deadline ?? '')}" />
      </div>
      <div class="field span-2">
        <label class="field-label">Bild <span class="muted">(valfritt foto av uppgiften)</span></label>
        <div class="row" style="gap:8px;align-items:center">
          <input type="file" class="input" accept="image/*" multiple data-fika-image style="width:auto;flex:0 1 auto" />
          <span class="hint">Max 5 MB per bild.</span>
        </div>
        ${item?.image ? `<img src="${esc(item.image)}" class="fika-preview-img" style="margin-top:8px;border:1px solid var(--line);border-radius:var(--radius-sm)" alt="Nuvarande bild" />` : ''}
      </div>
    </div>
  `;

  openDialog({
    title: item ? 'Redigera uppgift' : 'Ny uppgift',
    body,
    footer: `<div class="row">
      <button type="button" class="btn" data-close>Avbryt</button>
      <button type="submit" class="btn btn-primary">${item ? 'Spara' : 'Skapa uppgift'}</button>
    </div>`,
    onSubmit: async (data, form) => {
      if (!data.title?.trim()) {
        toast('Uppgift krävs.', 'bad');
        return false;
      }
      const fileInput = form.querySelector('[data-fika-image]');
      let image = item?.image ?? null;
      if (fileInput?.files?.length) {
        const file = fileInput.files[0];
        if (file.size > 5 * 1024 * 1024) {
          toast('Bilden är för stor (max 5 MB).', 'bad');
          return false;
        }
        const reader = new FileReader();
        reader.onload = async () => {
          const payload = {
            title: data.title.trim(),
            description: data.description ?? '',
            assignedTo: data.assignedTo ?? '',
            projectId: data.projectId ?? '',
            deadline: data.deadline ?? '',
            image: reader.result,
          };
          try {
            if (item) {
              await actions.updateFika(item.id, payload);
              toast('Uppgiften uppdaterad.', 'ok');
            } else {
              await actions.addFika(payload);
              toast('Uppgiften skapad.', 'ok');
            }
            const dlg = document.querySelector('dialog[open]');
            if (dlg) dlg.close();
          } catch (e) {
            toast('Kunde inte spara uppgiften.', 'bad');
          }
        };
        reader.onerror = () => {
          toast('Kunde inte läsa bilden.', 'bad');
        };
        reader.readAsDataURL(file);
        return false;
      }
      const payload = {
        title: data.title.trim(),
        description: data.description ?? '',
        assignedTo: data.assignedTo ?? '',
        projectId: data.projectId ?? '',
        deadline: data.deadline ?? '',
        image,
      };
      try {
        if (item) {
          await actions.updateFika(item.id, payload);
          toast('Uppgiften uppdaterad.', 'ok');
        } else {
          await actions.addFika(payload);
          toast('Uppgiften skapad.', 'ok');
        }
      } catch (e) {
        toast('Kunde inte spara uppgiften.', 'bad');
        return false;
      }
      return true;
    },
  });
}

function openLightbox(src, title) {
  const dialog = document.createElement('dialog');
  dialog.dataset.appDialog = 'true';
  dialog.style.width = 'min(90vw, 90vh)';
  dialog.style.height = 'min(90vh, 700px)';
  dialog.innerHTML = `
    <form method="dialog" novalidate>
      <div class="dialog-head">
        <h2>${esc(title)}</h2>
        <button type="button" class="btn btn-ghost btn-icon" data-close aria-label="Stäng">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg>
        </button>
      </div>
      <div class="dialog-body" style="padding:0;display:flex;align-items:center;justify-content:center">
        <img src="${esc(src)}" style="max-width:100%;max-height:100%;object-fit:contain;background:#000" />
      </div>
      <div class="dialog-foot"><button type="submit" class="btn">Stäng</button></div>
    </form>
  `;
  document.body.append(dialog);
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.remove());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.remove(); });
  dialog.showModal();
}
