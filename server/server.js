const fs = require('fs');
const http = require('http');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3001);
const CODE_TTL_MS = Number(process.env.LINK_CODE_TTL_MS || 5 * 60 * 1000);
const STORE_FILE = process.env.LINK_STORE_FILE || path.join(__dirname, 'link-codes.json');
const STATIC_DIR = path.join(__dirname, '..', 'build');
const API_AUTH_TOKEN = process.env.LINK_API_AUTH_TOKEN || '';
const MINECRAFT_NAME_PATTERN = /^[a-zA-Z0-9_]{3,16}$/;

const codes = new Map();

function loadStore() {
  try {
    const raw = fs.readFileSync(STORE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    for (const entry of Array.isArray(parsed.codes) ? parsed.codes : []) {
      if (entry && typeof entry.code === 'string' && Number(entry.expiresAt) > Date.now()) {
        codes.set(entry.code.toUpperCase(), entry);
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn('Could not load link code store:', error.message);
    }
  }
}

function saveStore() {
  const dir = path.dirname(STORE_FILE);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    STORE_FILE,
    JSON.stringify({ codes: Array.from(codes.values()) }, null, 2)
  );
}

function pruneExpiredCodes() {
  const now = Date.now();
  let changed = false;
  for (const [code, entry] of codes) {
    if (Number(entry.expiresAt) <= now) {
      codes.delete(code);
      changed = true;
    }
  }
  if (changed) {
    saveStore();
  }
}

function createCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const bytes = crypto.randomBytes(4);
    const suffix = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
    const code = `VMC-${suffix}`;
    if (!codes.has(code)) {
      return code;
    }
  }
  throw new Error('Could not generate unique code.');
}

function normalizeUuid(uuid) {
  return String(uuid || '').replace(/-/g, '').toLowerCase();
}

function sendJson(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 16 * 1024) {
        reject(new Error('Body too large.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('Invalid JSON.'));
      }
    });
    req.on('error', reject);
  });
}

async function fetchDiscordUser(accessToken) {
  const response = await fetch('https://discord.com/api/users/@me', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': 'VenoxMC-Link/1.0',
    },
  });

  if (!response.ok) {
    throw new Error(`Discord API returned ${response.status}.`);
  }

  const user = await response.json();
  if (!user || typeof user.id !== 'string') {
    throw new Error('Discord response missing user id.');
  }
  return user;
}

async function createLink(req, res) {
  const body = await readJson(req);
  const accessToken = typeof body.accessToken === 'string' ? body.accessToken.trim() : '';
  const minecraftUuid = normalizeUuid(body.minecraftUuid);
  const minecraftName = typeof body.minecraftName === 'string' ? body.minecraftName.trim() : '';

  if (!accessToken || !minecraftUuid || !MINECRAFT_NAME_PATTERN.test(minecraftName)) {
    sendJson(res, 400, { success: false, error: 'Ongeldige aanvraag.' });
    return;
  }

  const discordUser = await fetchDiscordUser(accessToken);
  pruneExpiredCodes();

  for (const [code, entry] of codes) {
    if (entry.discordId === discordUser.id || entry.minecraftUuid === minecraftUuid) {
      codes.delete(code);
    }
  }

  const code = createCode();
  const expiresAt = Date.now() + CODE_TTL_MS;
  const discordTag = discordUser.global_name || discordUser.username || discordUser.id;
  const entry = {
    code,
    expiresAt,
    minecraftUuid,
    minecraftName,
    discordId: discordUser.id,
    discordTag,
    createdAt: Date.now(),
  };

  codes.set(code, entry);
  saveStore();

  sendJson(res, 200, {
    success: true,
    code,
    expiresAt,
    minecraftUuid,
    minecraftName,
    discordId: entry.discordId,
    discordTag,
  });
}

async function consumeLink(req, res) {
  if (API_AUTH_TOKEN) {
    const expected = `Bearer ${API_AUTH_TOKEN}`;
    if (req.headers.authorization !== expected) {
      sendJson(res, 401, { success: false, error: 'Niet geautoriseerd.' });
      return;
    }
  }

  const body = await readJson(req);
  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
  const minecraftUuid = normalizeUuid(body.minecraftUuid);
  const minecraftName = typeof body.minecraftName === 'string' ? body.minecraftName.trim() : '';

  pruneExpiredCodes();
  const entry = codes.get(code);
  if (!entry || entry.minecraftUuid !== minecraftUuid || entry.minecraftName.toLowerCase() !== minecraftName.toLowerCase()) {
    sendJson(res, 200, { success: false, error: 'Code ongeldig of verlopen' });
    return;
  }

  codes.delete(code);
  saveStore();

  sendJson(res, 200, {
    success: true,
    discordId: entry.discordId,
    discordTag: entry.discordTag,
  });
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const safePath = path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  const requestedPath = path.join(STATIC_DIR, safePath);
  const filePath = fs.existsSync(requestedPath) && fs.statSync(requestedPath).isFile()
    ? requestedPath
    : path.join(STATIC_DIR, 'index.html');

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath);
    const contentType = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png': 'image/png',
      '.ico': 'image/x-icon',
      '.txt': 'text/plain; charset=utf-8',
    }[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  });
}

loadStore();
setInterval(pruneExpiredCodes, 60 * 1000).unref();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (req.method === 'GET' && url.pathname === '/api/health') {
      sendJson(res, 200, { success: true });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/link/create') {
      await createLink(req, res);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/minecraft/link/consume') {
      await consumeLink(req, res);
      return;
    }

    if (url.pathname.startsWith('/api/')) {
      sendJson(res, 404, { success: false, error: 'Endpoint niet gevonden.' });
      return;
    }

    serveStatic(req, res);
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { success: false, error: 'Interne serverfout.' });
  }
});

server.listen(PORT, () => {
  console.log(`VenoxMC link API listening on port ${PORT}`);
});
