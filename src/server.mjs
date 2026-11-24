import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { createHelpdeskApi } from './helpdesk.mjs';
import { setKpiDone } from './kpi-state.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const publicDir = join(root, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

let api;
try {
  api = await createHelpdeskApi();
} catch (error) {
  console.error(`\n[field-ops] ${error.message}\n`);
  process.exit(1);
}

const port = Number(process.env.FIELD_OPS_PORT ?? api.config.port ?? 4780);
const host = api.config.host ?? '127.0.0.1';

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

async function serveStatic(res, pathname) {
  const rel = pathname === '/' ? '/index.html' : pathname;
  const target = normalize(join(publicDir, rel));
  if (!target.startsWith(publicDir + sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  if (!existsSync(target)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
    return;
  }
  const body = await readFile(target);
  res.writeHead(200, {
    'Content-Type': MIME[extname(target).toLowerCase()] ?? 'application/octet-stream',
    'Cache-Control': 'no-cache',
    'Content-Length': body.length,
  });
  res.end(body);
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const p = url.pathname;
  const q = Object.fromEntries(url.searchParams.entries());

  try {
    if (p === '/api/health') return sendJson(res, 200, await api.health());
    if (p === '/api/meta') return sendJson(res, 200, await api.meta());
    if (p === '/api/tickets') return sendJson(res, 200, await api.tickets(q));
    if (p === '/api/tickets-extra') return sendJson(res, 200, await api.ticketsExtra(q));
    if (p === '/api/search') return sendJson(res, 200, await api.search(q));
    if (p === '/api/refresh') {
      await api.refreshCache();
      return sendJson(res, 200, { ok: true, at: Date.now() });
    }
    if (p === '/api/stats') return sendJson(res, 200, await api.stats(q));
    if (p === '/api/l2') return sendJson(res, 200, await api.l2(q));
    if (p === '/api/kpi-l2') return sendJson(res, 200, await api.kpiL2(q));
    if (p === '/api/kpi-missing') return sendJson(res, 200, await api.kpiMissing(q));
    if (p === '/api/kpi-done' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const out = await setKpiDone(body.ticket, body.done !== false);
      return sendJson(res, 200, out);
    }

    const mId = p.match(/^\/api\/tickets\/(\d+)$/);
    if (mId) {
      const out = await api.ticketDetail(parseInt(mId[1], 10));
      if (out.status === 404) return sendJson(res, 404, { error: out.error || 'tiket tidak ditemukan' });
      return sendJson(res, 200, out);
    }

    if (p.startsWith('/api/')) {
      return sendJson(res, 404, { error: 'Endpoint tidak dikenal (dashboard ini hanya baca data Odoo)' });
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return sendJson(res, 405, { error: 'Dashboard ini hanya membaca data Odoo' });
    }

    await serveStatic(res, p);
  } catch (error) {
    console.error(`[field-ops] ${error?.stack ?? error}`);
    sendJson(res, 500, { error: error?.message ?? 'Kesalahan tak terduga' });
  }
});

server.listen(port, host, () => {
  console.log(`[field-ops] Dashboard siap di http://${host}:${port}`);
  console.log(`[field-ops] Akun: ${api.config.login} | Odoo: ${api.config.url}`);
  api.refreshCache().then(() => console.log('[field-ops] cache awal OK')).catch((e) => console.log('[field-ops] cache awal gagal:', e.message));
});
