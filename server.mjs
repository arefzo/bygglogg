// Bygglogg – Express-server med API för datalagring på servern.
// Kör: node server.mjs
import express from 'express';
import pg from 'pg';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const PORT = process.env.PORT === undefined ? 4173 : Number(process.env.PORT);
const HOST = process.env.HOST || (process.env.PORT ? '0.0.0.0' : '127.0.0.1');
const DATA_DIR = resolve(process.env.DATA_DIR || ROOT);
const DATA_FILE = join(DATA_DIR, 'data.json');
const { Pool } = pg;
const database = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, max: 3, idleTimeoutMillis: 10000 })
  : null;
database?.on('error', (error) => {
  console.error('PostgreSQL pool error:', error.message);
});

const app = express();
app.use(express.json());

// A persistent disk is attached to one Render instance. Serialize all writes
// so two devices editing at once cannot overwrite one another's updates.
let writeQueue = Promise.resolve();
app.use('/api', async (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const previousWrite = writeQueue;
  let releaseWrite;
  writeQueue = new Promise((resolve) => { releaseWrite = resolve; });
  await previousWrite;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    releaseWrite();
  };
  res.once('finish', release);
  res.once('close', release);
  next();
});

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

async function readData() {
  if (database) {
    const result = await database.query('SELECT payload FROM bygglogg_state WHERE id = 1');
    return result.rows[0]?.payload ?? createDefaultData();
  }

  try {
    const raw = await readFile(DATA_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return createDefaultData();
  }
}

function createDefaultData() {
  return {
    version: 1,
    revision: 0,
    settings: {
      companyName: 'INCON AB',
      orgNumber: '556123-4567',
      workdayHours: 8,
      lunchMinutes: 30,
      autoLunch: true,
      weekStart: 1,
      reportLimitDays: 7,
    },
    projects: [],
    users: [],
    templates: [],
    activities: [],
    entries: [],
    timeReports: [],
    inspections: [],
    photos: {},
    drawings: [],
    fika: [],
  };
}

async function writeData(data) {
  data.revision = (Number(data.revision) || 0) + 1;
  data.updatedAt = new Date().toISOString();
  if (database) {
    await database.query(
      `INSERT INTO bygglogg_state (id, payload) VALUES (1, $1::jsonb)
       ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload`,
      [JSON.stringify(data)],
    );
    return;
  }
  await mkdir(DATA_DIR, { recursive: true });
  const tempFile = join(DATA_DIR, `.data-${process.pid}-${crypto.randomBytes(6).toString('hex')}.tmp`);
  await writeFile(tempFile, JSON.stringify(data, null, 2), 'utf-8');
  await rename(tempFile, DATA_FILE);
}

async function initializeData() {
  if (database) {
    await database.query(`
      CREATE TABLE IF NOT EXISTS bygglogg_state (
        id SMALLINT PRIMARY KEY CHECK (id = 1),
        payload JSONB NOT NULL
      )
    `);
    const current = await database.query('SELECT id FROM bygglogg_state WHERE id = 1');
    if (current.rowCount) return;
    const data = createDefaultData();
    const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim();
    const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
    if (email && password) {
      data.users.push({
        id: `usr_${crypto.randomBytes(8).toString('hex')}`,
        name: process.env.BOOTSTRAP_ADMIN_NAME?.trim() || 'Administratör',
        email,
        role: 'admin',
        active: true,
        projectIds: [],
        passwordHash: hashPassword(password),
        sessionToken: null,
        sessionTokens: [],
      });
    }
    await database.query(
      'INSERT INTO bygglogg_state (id, payload) VALUES (1, $1::jsonb) ON CONFLICT (id) DO NOTHING',
      [JSON.stringify(data)],
    );
    return;
  }

  await mkdir(DATA_DIR, { recursive: true });
  try {
    await readFile(DATA_FILE, 'utf-8');
    return;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const data = await readData();
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (email && password) {
    data.users.push({
      id: `usr_${crypto.randomBytes(8).toString('hex')}`,
      name: process.env.BOOTSTRAP_ADMIN_NAME?.trim() || 'Administratör',
      email,
      role: 'admin',
      active: true,
      projectIds: [],
      passwordHash: hashPassword(password),
      sessionToken: null,
      sessionTokens: [],
    });
  }
  await writeData(data);
}

function publicUser(user) {
  const { passwordHash, sessionToken, sessionTokens, ...safeUser } = user;
  return safeUser;
}

async function requireAuth(req, res, next) {
  const token = req.headers.authorization;
  if (!token) {
    return res.status(401).json({ error: 'Inloggning krävs' });
  }
  const data = await readData();
  const user = data.users.find((u) => u.sessionToken === token || u.sessionTokens?.includes(token));
  if (!user) {
    return res.status(401).json({ error: 'Ogiltig inloggning' });
  }
  req.user = user;
  next();
}

// ------------------------------------------------------------------
// Statiska filer
// ------------------------------------------------------------------

app.get('/', (_req, res) => {
  res.sendFile(join(ROOT, 'index.html'));
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.get('/assets/*', (req, res) => {
  const filePath = join(ROOT, req.path);
  res.sendFile(filePath);
});

app.get('/src/*', (req, res) => {
  const filePath = join(ROOT, req.path);
  res.sendFile(filePath);
});

app.get('/test/*', (req, res) => {
  const filePath = join(ROOT, req.path);
  res.sendFile(filePath);
});

// ------------------------------------------------------------------
// Auth
// ------------------------------------------------------------------

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'E-post och lösenord krävs' });
  }
  const data = await readData();
  const user = data.users.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase() && u.active
  );
  if (!user || user.passwordHash !== hashPassword(password)) {
    return res.status(401).json({ error: 'Felaktig e-postadress eller lösenord' });
  }
  const token = crypto.randomBytes(32).toString('hex');
  user.sessionTokens = Array.isArray(user.sessionTokens) ? user.sessionTokens : [];
  user.sessionTokens = [...user.sessionTokens.filter((existing) => existing !== token), token].slice(-20);
  user.sessionToken = token;
  await writeData(data);
  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      projectIds: user.projectIds,
    },
  });
});

app.post('/api/logout', async (req, res) => {
  const token = req.headers.authorization;
  if (token) {
    const data = await readData();
    const user = data.users.find((u) => u.sessionToken === token || u.sessionTokens?.includes(token));
    if (user) {
      user.sessionTokens = (user.sessionTokens ?? []).filter((existing) => existing !== token);
      if (user.sessionToken === token) user.sessionToken = user.sessionTokens.at(-1) ?? null;
      await writeData(data);
    }
  }
  res.json({ ok: true });
});

app.get('/api/me', requireAuth, async (req, res) => {
  const data = await readData();
  const user = data.users.find((u) => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'Användare hittades inte' });
  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    projectIds: user.projectIds,
  });
});

// ------------------------------------------------------------------
// Helper: CRUD generiskt
// ------------------------------------------------------------------

function crudRoutes(app, entity, idField = 'id') {
  app.get(`/api/${entity}`, requireAuth, async (_req, res) => {
    const data = await readData();
    const records = data[entity] ?? [];
    res.json(entity === 'users' ? records.map(publicUser) : records);
  });

  app.post(`/api/${entity}`, requireAuth, async (req, res) => {
    const data = await readData();
    const body = { ...req.body };
    if (entity === 'users') {
      if (body.password) body.passwordHash = hashPassword(body.password);
      delete body.password;
    }
    const item = { ...body, id: req.body.id || `ent_${crypto.randomBytes(4).toString('hex')}` };
    if (entity === 'inspections') {
      const template = data.templates.find((entry) => entry.id === body.templateId);
      if (!template) return res.status(400).json({ error: 'Mallen hittades inte' });
      item.status = 'pagaende';
      item.items = template.items.map((entry) => ({
        ...entry,
        id: `item_${crypto.randomBytes(4).toString('hex')}`,
        result: null,
        note: '',
        action: '',
        responsible: '',
        dueDate: '',
        resolved: false,
      }));
    }
    data[entity] = data[entity] ?? [];
    data[entity].push(item);
    await writeData(data);
    res.status(201).json(item);
  });

  app.put(`/api/${entity}/:id`, requireAuth, async (req, res) => {
    const data = await readData();
    data[entity] = data[entity] ?? [];
    const index = data[entity].findIndex((item) => item[idField] === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Hittades inte' });
    const body = { ...req.body };
    if (entity === 'users') {
      if (body.password) body.passwordHash = hashPassword(body.password);
      delete body.password;
    }
    data[entity][index] = { ...data[entity][index], ...body, [idField]: req.params.id };
    await writeData(data);
    res.json(data[entity][index]);
  });

  app.delete(`/api/${entity}/:id`, requireAuth, async (req, res) => {
    const data = await readData();
    data[entity] = data[entity] ?? [];
    const before = data[entity].length;
    data[entity] = data[entity].filter((item) => item[idField] !== req.params.id);
    if (data[entity].length === before) return res.status(404).json({ error: 'Hittades inte' });
    await writeData(data);
    res.json({ ok: true });
  });
}

// ------------------------------------------------------------------
// Entiteter
// ------------------------------------------------------------------

crudRoutes(app, 'projects');
crudRoutes(app, 'users');
crudRoutes(app, 'templates');
crudRoutes(app, 'activities');
crudRoutes(app, 'entries');
crudRoutes(app, 'timeReports');
crudRoutes(app, 'inspections');
crudRoutes(app, 'drawings');
crudRoutes(app, 'fika');

// Clients poll this compact, versioned snapshot to pick up changes from other
// devices. Credential hashes and session tokens are never included.
app.get('/api/sync', requireAuth, async (req, res) => {
  const data = await readData();
  const revision = Number(data.revision) || 0;
  if (Number(req.query.since) === revision) return res.status(304).end();
  res.json({
    revision,
    updatedAt: data.updatedAt ?? null,
    data: { ...data, users: (data.users ?? []).map(publicUser) },
  });
});

app.post('/api/fika/:id/toggle', requireAuth, async (req, res) => {
  const data = await readData();
  const item = data.fika.find((entry) => entry.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Hittades inte' });
  item.done = !item.done;
  await writeData(data);
  res.json(item);
});

app.put('/api/timeReports/:id/status', requireAuth, async (req, res) => {
  const data = await readData();
  const report = data.timeReports.find((item) => item.id === req.params.id);
  if (!report) return res.status(404).json({ error: 'Hittades inte' });
  if (!['utkast', 'inskickad', 'godkand', 'avvisad'].includes(req.body.status)) {
    return res.status(400).json({ error: 'Ogiltig status' });
  }
  report.status = req.body.status;
  await writeData(data);
  res.json(report);
});

app.put('/api/inspections/:id/items/:itemId', requireAuth, async (req, res) => {
  const data = await readData();
  const inspection = data.inspections.find((item) => item.id === req.params.id);
  const item = inspection?.items?.find((entry) => entry.id === req.params.itemId);
  if (!item) return res.status(404).json({ error: 'Hittades inte' });
  Object.assign(item, req.body);
  await writeData(data);
  res.json(item);
});

app.post('/api/inspections/:id/items/:itemId/resolve', requireAuth, async (req, res) => {
  const data = await readData();
  const inspection = data.inspections.find((item) => item.id === req.params.id);
  const item = inspection?.items?.find((entry) => entry.id === req.params.itemId);
  if (!item) return res.status(404).json({ error: 'Hittades inte' });
  item.resolved = true;
  await writeData(data);
  res.json(item);
});

app.post('/api/inspections/:id/sign', requireAuth, async (req, res) => {
  const data = await readData();
  const inspection = data.inspections.find((item) => item.id === req.params.id);
  if (!inspection) return res.status(404).json({ error: 'Hittades inte' });
  if (inspection.items.some((item) => !item.result || (item.result === 'avvikelse' && (!item.note?.trim() || !item.action?.trim() || !item.responsible || !item.dueDate)))) {
    return res.status(400).json({ error: 'Alla punkter måste vara besvarade och avvikelser dokumenterade' });
  }
  inspection.status = 'signerad';
  inspection.signedBy = req.user.id;
  inspection.signedAt = new Date().toISOString();
  await writeData(data);
  res.json(inspection);
});

app.put('/api/users/:id/password', requireAuth, async (req, res) => {
  const { password } = req.body;
  if (typeof password !== 'string' || password.trim().length < 1) {
    return res.status(400).json({ error: 'Lösenord krävs' });
  }
  const data = await readData();
  const user = data.users.find((item) => item.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'Användaren hittades inte' });
  user.passwordHash = hashPassword(password);
  await writeData(data);
  res.json({ ok: true });
});

// ------------------------------------------------------------------
// Photos (sparas som data URLs i JSON)
// ------------------------------------------------------------------

app.get('/api/photos/:entityType/:entityId', requireAuth, async (req, res) => {
  const data = await readData();
  const key = `${req.params.entityType}:${req.params.entityId}`;
  res.json(data.photos[key] ?? []);
});

app.post('/api/photos/:entityType/:entityId', requireAuth, async (req, res) => {
  const data = await readData();
  const key = `${req.params.entityType}:${req.params.entityId}`;
  if (!data.photos[key]) data.photos[key] = [];
  const photo = {
    id: `ph_${crypto.randomBytes(4).toString('hex')}`,
    ...req.body,
    createdAt: new Date().toISOString(),
  };
  data.photos[key].unshift(photo);
  await writeData(data);
  res.status(201).json(photo);
});

app.delete('/api/photos/:entityType/:entityId/:photoId', requireAuth, async (req, res) => {
  const data = await readData();
  const key = `${req.params.entityType}:${req.params.entityId}`;
  if (!data.photos[key]) return res.status(404).json({ error: 'Hittades inte' });
  data.photos[key] = data.photos[key].filter((p) => p.id !== req.params.photoId);
  await writeData(data);
  res.json({ ok: true });
});

// ------------------------------------------------------------------
// Settings
// ------------------------------------------------------------------

app.get('/api/settings', requireAuth, async (_req, res) => {
  const data = await readData();
  res.json(data.settings);
});

app.put('/api/settings', requireAuth, async (req, res) => {
  const data = await readData();
  data.settings = { ...data.settings, ...req.body };
  await writeData(data);
  res.json(data.settings);
});

// ------------------------------------------------------------------
// Dagbok: publicera / låsa / kommentarer
// ------------------------------------------------------------------

app.post('/api/entries/publish', requireAuth, async (req, res) => {
  const { projectIds, date } = req.body;
  const data = await readData();
  data.entries.forEach((e) => {
    if (date === e.date && projectIds.includes(e.projectId)) e.published = true;
  });
  await writeData(data);
  res.json({ ok: true });
});

app.post('/api/entries/unpublish', requireAuth, async (req, res) => {
  const { projectIds, date } = req.body;
  const data = await readData();
  data.entries.forEach((e) => {
    if (date === e.date && projectIds.includes(e.projectId)) e.published = false;
  });
  await writeData(data);
  res.json({ ok: true });
});

app.post('/api/entries/lock', requireAuth, async (req, res) => {
  const { projectIds, date } = req.body;
  const data = await readData();
  data.entries.forEach((e) => {
    if (date === e.date && projectIds.includes(e.projectId)) {
      e.locked = true;
      e.published = true;
    }
  });
  await writeData(data);
  res.json({ ok: true });
});

app.post('/api/entries/unlock', requireAuth, async (req, res) => {
  const { projectIds, date } = req.body;
  const data = await readData();
  data.entries.forEach((e) => {
    if (date === e.date && projectIds.includes(e.projectId)) e.locked = false;
  });
  await writeData(data);
  res.json({ ok: true });
});

app.post('/api/entries/:id/comments', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { text } = req.body;
  const data = await readData();
  const entry = data.entries.find((e) => e.id === id);
  if (!entry) return res.status(404).json({ error: 'Hittades inte' });
  entry.comments = entry.comments ?? [];
  entry.comments.push({
    id: `c_${crypto.randomBytes(4).toString('hex')}`,
    userId: req.user.id,
    text,
    createdAt: new Date().toISOString(),
  });
  await writeData(data);
  res.status(201).json(entry.comments[entry.comments.length - 1]);
});

// ------------------------------------------------------------------
// Tid: submit vecka
// ------------------------------------------------------------------

app.post('/api/timeReports/submit-week', requireAuth, async (req, res) => {
  const { userId, anchorIso } = req.body;
  const data = await readData();
  const start = new Date(`${anchorIso}T12:00:00`);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  data.timeReports.forEach((r) => {
    const date = new Date(`${r.date}T12:00:00`);
    if (r.userId === userId && date >= start && date < end && r.status === 'utkast') {
      r.status = 'inskickad';
    }
  });
  await writeData(data);
  res.json({ ok: true });
});

// ------------------------------------------------------------------
// Starta servern
// ------------------------------------------------------------------

await initializeData();
const server = app.listen(PORT, HOST, () => {
  const address = server.address();
  console.log(`Bygglogg körs på http://${HOST}:${address.port}`);
});
