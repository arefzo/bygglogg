// Ritningar – organisera och öppna PDF- och IFC-filer per projekt.

import {
  actions,
  accessibleProjects,
  can,
  currentUser,
  drawingsFor,
  getState,
  projectName,
  scopedProjects,
  session,
  setSession,
  userName,
} from '../store.js';
import { badge, esc, formatDateTime, openDialog, toast } from '../ui.js';
import { icon } from '../icons.js';

const MAX_FILE_MB = 25;

export function renderDrawings() {
  const state = getState();
  const user = currentUser();
  const projects = scopedProjects(user);
  const projectIds = projects.map((project) => project.id);
  const activeProjectId = session.activeProjectId ?? 'all';
  const drawings = drawingsFor(activeProjectId !== 'all' ? activeProjectId : null);

  const pdfs = drawings.filter((d) => d.category === 'pdf');
  const ifcs = drawings.filter((d) => d.category === 'ifc');
  const others = drawings.filter((d) => d.category === 'other');

  const canUpload = can('writeDaybook', user);

  return `
    <header class="page-head">
      <div>
        <div class="eyebrow">Dokumenthantering</div>
        <h1>Ritningar</h1>
        <p class="page-sub">Ladda upp, ordna och öppna ritningar och dokument (PDF, IFC och andra filer) per projekt. Filarna sparas lokalt i webbläsaren.</p>
      </div>
      <div class="page-actions">
        <div class="topbar-field" style="margin-right:8px">
          <span>Projekt</span>
          <select class="select-quiet" data-drawing-project aria-label="Välj projekt för ritningar">
            <option value="all"${activeProjectId === 'all' ? ' selected' : ''}>Alla projekt</option>
            ${projects
              .map(
                (project) =>
                  `<option value="${project.id}"${project.id === activeProjectId ? ' selected' : ''}>${esc(`${project.number} · ${project.name}`)}</option>`,
              )
              .join('')}
          </select>
        </div>
        ${canUpload ? `<button class="btn btn-primary" data-new-drawing>Ladda upp fil</button>` : ''}
      </div>
    </header>

    <div class="grid grid-3" style="margin-bottom:16px">
      <div class="kpi">
        <span class="kpi-accent steel"></span>
        <div class="kpi-label">Alla ritningar</div>
        <div class="kpi-value">${drawings.length}</div>
        <div class="kpi-meta">${projectIds.length === 1 ? projectName(activeProjectId) : 'alla projekt'}</div>
      </div>
      <div class="kpi">
        <span class="kpi-accent"></span>
        <div class="kpi-label">PDF</div>
        <div class="kpi-value">${pdfs.length}</div>
        <div class="kpi-meta">Öppnas i webbläsaren</div>
      </div>
      <div class="kpi">
        <span class="kpi-accent bad"></span>
        <div class="kpi-label">IFC / BIM</div>
        <div class="kpi-value">${ifcs.length}</div>
        <div class="kpi-meta">Laddas ner för BIM-visare</div>
      </div>
    </div>

    <section class="card">
      <div class="card-head">
        <h2>Filer</h2>
        <span class="hint">${drawings.length} filer · ${drawings.length ? formatBytes(sumSizes(drawings)) : ''}</span>
      </div>
      <div class="card-body tight">
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Filnamn</th><th>Typ</th><th>Projekt</th><th>Storlek</th><th>Laddad</th><th></th></tr></thead>
            <tbody>
              ${drawings.length
                ? drawings
                    .map(
                      (drawing) => {
                        const project = state.projects.find((p) => p.id === drawing.projectId);
                        const isPdf = drawing.category === 'pdf';
                        const isIfc = drawing.category === 'ifc';
                        return `<tr>
                          <td>
                            <div class="strong">${esc(drawing.name)}</div>
                            <div class="small muted">${esc(userName(drawing.uploadedBy))} · ${esc(formatDateTime(drawing.uploadedAt))}</div>
                          </td>
                          <td>
                            ${isPdf ? badge('PDF', 'steel') : isIfc ? badge('IFC', 'bad') : badge('Övrig', 'muted')}
                          </td>
                          <td class="small muted">${project ? esc(project.name) : '–'}</td>
                          <td class="small muted num">${formatBytes(drawing.size)}</td>
                          <td class="small muted">${esc(formatDate(drawing.uploadedAt, { weekday: false }))}</td>
                          <td>
                            <div class="table-actions">
                              ${isPdf
                                ? `<a href="${esc(drawing.dataUrl)}" target="_blank" rel="noopener" class="btn btn-ghost btn-icon btn-sm" title="Öppna PDF" aria-label="Öppna PDF">${icon('download', 14)}</a>`
                                : `<button class="btn btn-ghost btn-icon btn-sm" data-download-drawing="${drawing.id}" title="Ladda ner" aria-label="Ladda ner">${icon('download', 14)}</button>`}
                              <button class="btn btn-danger btn-icon btn-sm" data-delete-drawing="${drawing.id}" title="Ta bort" aria-label="Ta bort fil">${icon('trash', 14)}</button>
                            </div>
                          </td>
                        </tr>`;
                      },
                    )
                    .join('')
                : `<tr><td colspan="6" class="empty">Inga filer uppladdade ännu. Klicka på "Ladda upp fil" för att börja.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    </section>

    ${canUpload
      ? `<section class="card">
          <div class="card-head"><h2>Ladda upp ny fil</h2></div>
          <div class="card-body stack" style="gap:10px">
            <div class="field">
              <label class="field-label" for="drawing-file">Välj fil (PDF, IFC eller annat)</label>
              <input id="drawing-file" type="file" class="input" accept=".pdf,.ifc,.dwg,.dxf,.png,.jpg,.jpeg" data-drawing-file />
              <span class="hint">Max ${MAX_FILE_MB} MB per fil. PDF öppnas direkt i webbläsaren; IFC laddas ner och öppnas i en BIM-visare.</span>
            </div>
            <button class="btn btn-primary" data-save-drawing>Ladda upp</button>
          </div>
        </section>`
      : `<section class="card"><div class="card-body empty">
          <p class="muted">Du har inte behörighet att ladda upp filer. Kontakta en administratör.</p>
        </div></section>`
      }
  `;
}

function sumSizes(drawings) {
  return drawings.reduce((sum, d) => sum + Number(d.size || 0), 0);
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'kB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function mountDrawings(root) {
  const user = currentUser();
  const canUpload = can('writeDaybook', user);

  root.querySelector('[data-drawing-project]')?.addEventListener('change', (event) => {
    setSession({ activeProjectId: event.target.value });
  });

  root.querySelectorAll('[data-download-drawing]').forEach((button) => {
    button.addEventListener('click', () => {
      const drawings = getState().drawings ?? [];
      const drawing = drawings.find((d) => d.id === button.dataset.downloadDrawing);
      if (!drawing) return;
      const link = document.createElement('a');
      link.href = drawing.dataUrl;
      link.download = drawing.name;
      link.click();
      toast(`Laddar ner ${esc(drawing.name)}.`);
    });
  });

  root.querySelectorAll('[data-delete-drawing]').forEach((button) => {
    button.addEventListener('click', async () => {
      const drawings = getState().drawings ?? [];
      const drawing = drawings.find((d) => d.id === button.dataset.deleteDrawing);
      if (!drawing) return;
      if (!window.confirm(`Ta bort filen ${drawing.name}?`)) return;
      try {
        await actions.deleteDrawing(drawing.id);
        toast('Fil borttagen.');
      } catch (e) {
        toast('Kunde inte ta bort filen.', 'bad');
      }
    });
  });

  if (!canUpload) return;

  const fileInput = root.querySelector('[data-drawing-file]');
  root.querySelector('[data-save-drawing]')?.addEventListener('click', () => {
    const files = [...(fileInput.files ?? [])];
    if (!files.length) {
      toast('Välj minst en fil.', 'bad');
      return;
    }
    let uploaded = 0;
    for (const file of files) {
      if (file.size > MAX_FILE_MB * 1024 * 1024) {
        toast(`${file.name} är för stor (max ${MAX_FILE_MB} MB).`, 'bad');
        continue;
      }
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          await actions.addDrawing({
            projectId: session.activeProjectId ?? 'all',
            file: { dataUrl: reader.result, name: file.name, type: file.type, size: file.size },
          });
          uploaded += 1;
          if (uploaded === files.filter((f) => f.size <= MAX_FILE_MB * 1024 * 1024).length) {
            toast(`${uploaded} fil${uploaded === 1 ? '' : 'er'} uppladdad${uploaded === 1 ? '' : 'a'}.`, 'ok');
            fileInput.value = '';
          }
        } catch (e) {
          toast('Kunde inte ladda upp filen.', 'bad');
        }
      };
      reader.onerror = () => {
        toast(`Kunde inte läsa ${file.name}.`, 'bad');
      };
      reader.readAsDataURL(file);
    }
  });
}
