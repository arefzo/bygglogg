import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

test('server data persists, syncs between clients, and keeps multi-device sessions', async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), 'bygglogg-sync-'));

  let child;
  let output = '';
  let baseUrl;

  async function startServer() {
    child = spawn(process.execPath, ['server.mjs'], {
      cwd: ROOT,
      env: {
        ...process.env,
        HOST: '127.0.0.1',
        PORT: '0',
        DATA_DIR: dataDir,
        DATABASE_URL: '',
        BOOTSTRAP_ADMIN_EMAIL: 'admin@example.test',
        BOOTSTRAP_ADMIN_PASSWORD: 'test-password',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => { output += chunk; });

    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      const match = output.match(/Bygglogg körs på http:\/\/[^:]+:(\d+)/);
      if (match) {
        baseUrl = `http://127.0.0.1:${match[1]}`;
        const health = await fetch(`${baseUrl}/api/health`).catch(() => null);
        if (health?.ok) return;
      }
      if (child.exitCode !== null) throw new Error(`Server exited early: ${output}`);
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    throw new Error(`Server did not start: ${output}`);
  }

  async function stopServer() {
    if (!child || child.exitCode !== null) return;
    child.kill();
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
    if (child.exitCode === null) child.kill('SIGKILL');
  }

  async function login() {
    const response = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.test', password: 'test-password' }),
    });
    assert.equal(response.status, 200);
    return (await response.json()).token;
  }

  async function authenticated(path, token, options = {}) {
    return fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        Authorization: token,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    });
  }

  t.after(async () => {
    await stopServer();
    await rm(dataDir, { recursive: true, force: true });
  });

  await startServer();
  const firstDeviceToken = await login();
  const secondDeviceToken = await login();
  assert.equal((await authenticated('/api/me', firstDeviceToken)).status, 200);
  assert.equal((await authenticated('/api/me', secondDeviceToken)).status, 200);

  const safeUsers = await authenticated('/api/users', secondDeviceToken);
  const user = (await safeUsers.json())[0];
  assert.equal('passwordHash' in user, false);
  assert.equal('sessionToken' in user, false);
  assert.equal('sessionTokens' in user, false);

  const initial = await authenticated('/api/sync', firstDeviceToken);
  const initialSnapshot = await initial.json();
  assert.equal(initialSnapshot.data.users[0].email, 'admin@example.test');
  assert.equal('passwordHash' in initialSnapshot.data.users[0], false);

  const writes = await Promise.all(['p1', 'p2'].map((id) => authenticated('/api/projects', firstDeviceToken, {
    method: 'POST',
    body: JSON.stringify({ id, name: `Project ${id}` }),
  })));
  assert.deepEqual(writes.map((response) => response.status), [201, 201]);
  const templateResponse = await authenticated('/api/templates', firstDeviceToken, {
    method: 'POST',
    body: JSON.stringify({
      id: 'safety-template',
      name: 'Safety check',
      items: [{ id: 'point-1', group: 'Site safety', label: 'Access is clear' }],
    }),
  });
  assert.equal(templateResponse.status, 201);

  const inspectionResponse = await authenticated('/api/inspections', firstDeviceToken, {
    method: 'POST',
    body: JSON.stringify({
      id: 'inspection-1',
      templateId: 'safety-template',
      projectId: 'p1',
      date: '2026-11-13',
      title: 'Weekly safety check',
      inspectorId: user.id,
    }),
  });
  assert.equal(inspectionResponse.status, 201);
  const inspection = await inspectionResponse.json();
  const answerResponse = await authenticated(
    `/api/inspections/${inspection.id}/items/${inspection.items[0].id}`,
    firstDeviceToken,
    { method: 'PUT', body: JSON.stringify({ result: 'godkand' }) },
  );
  assert.equal(answerResponse.status, 200);
  const signResponse = await authenticated(`/api/inspections/${inspection.id}/sign`, firstDeviceToken, {
    method: 'POST',
  });
  assert.equal(signResponse.status, 200);

  const sharedInspectionSnapshot = await authenticated('/api/sync', secondDeviceToken);
  const sharedInspectionData = (await sharedInspectionSnapshot.json()).data;
  const sharedInspection = sharedInspectionData.inspections.find((item) => item.id === inspection.id);
  assert.equal(sharedInspection.status, 'signerad');
  assert.equal(sharedInspection.signedBy, user.id);
  assert.ok(sharedInspection.signedAt);

  const unchanged = await authenticated(`/api/sync?since=${initialSnapshot.revision}`, secondDeviceToken);
  assert.equal(unchanged.status, 200);
  const changedSnapshot = await unchanged.json();
  assert.ok(changedSnapshot.revision > initialSnapshot.revision);
  assert.deepEqual(changedSnapshot.data.projects.map((project) => project.id).sort(), ['p1', 'p2']);

  const savedFile = JSON.parse(await readFile(join(dataDir, 'data.json'), 'utf8'));
  assert.equal(savedFile.projects.length, 2);
  await stopServer();
  output = '';
  await startServer();
  const afterRestart = await authenticated('/api/sync', secondDeviceToken);
  assert.deepEqual((await afterRestart.json()).data.projects.map((project) => project.id).sort(), ['p1', 'p2']);
});
