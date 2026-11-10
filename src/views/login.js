// Inloggning med e-post och lösenord. Användare och roller hanteras av administratören
// under Administration → Användare. Lösenord sparas haschat i webbläsarens localStorage.

import { auth, currentUser, getState, userName } from '../store.js';
import { esc, openDialog, toast } from '../ui.js';
import { icon, inconLogo } from '../icons.js';

export function renderLogin() {
  return `
    <div class="shell">
      <header class="topbar">
        <a class="brand" href="#" aria-label="Bygglogg">
          <span class="brand-mark">${inconLogo({ width: 60, height: 32 })}</span>
          <span>
            <span class="brand-name">Bygglogg</span>
            <span class="brand-sub">Dagbok · Tid · Skydd</span>
          </span>
        </a>
        <div class="topbar-spacer"></div>
        <span class="topbar-date">Inloggning krävs</span>
      </header>

      <div class="layout">
        <main class="main">
          <div class="page" style="max-width:420px;margin:48px auto">
            <div class="card" style="padding:26px 24px">
              <div class="row" style="gap:10px;align-items:center;margin-bottom:22px">
                ${icon('shield', 36)}
                <div>
                  <h1 style="font-size:20px">Bygglogg</h1>
                  <p class="muted small" style="margin-top:4px">Digital byggdagbok, tid och skyddsrond</p>
                </div>
              </div>
              <p class="muted small" style="margin-bottom:18px">Logga in med ditt användarkonto. Kontot och rollen hanteras av en administratör i appen.</p>
              <form data-login-form class="stack" novalidate>
                <div class="field">
                  <label class="field-label" for="login-email">E-postadress</label>
                  <input id="login-email" type="email" class="input" name="email" required autocomplete="email" placeholder="namn@foretag.se" />
                </div>
                <div class="field">
                  <label class="field-label" for="login-password">Lösenord</label>
                  <input id="login-password" type="password" class="input" name="password" required autocomplete="current-password" placeholder="••••••••" />
                </div>
                <div class="row-between">
                  <span class="hint">Data sparas säkert på servern.</span>
                  <button type="submit" class="btn btn-primary btn-block">Logga in</button>
                </div>
              </form>
            </div>
          </div>
        </main>
      </div>
    </div>
  `;
}

export function mountLogin(root) {
  const form = root.querySelector('[data-login-form]');
  if (!form) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const email = String(data.get('email') ?? '').trim();
    const password = String(data.get('password') ?? '');

    const ok = await auth.login(email, password);
    if (ok) {
      toast(`Välkommen, ${currentUser().name}.`, 'ok');
      window.dispatchEvent(new Event('hashchange'));
    } else {
      toast('Felaktig e-postadress eller lösenord, eller kontot är inaktivt.', 'bad');
    }
  });
}
