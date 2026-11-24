// UI preview only: serves public/ with sample data so the layout can be checked
// without a live Odoo connection. Never used by the real dashboard.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const publicDir = join(root, 'public');
const PORT = Number(process.env.PREVIEW_PORT ?? 4781);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const now = Date.now();
const iso = (offsetHours) => new Date(now + offsetHours * 3600000).toISOString().replace('T', ' ').slice(0, 19);

const tickets = [
  ['GPON down di Cibitung Barat', 'PT Sumber Makmur', 'In Progress', 'High', -20, -1],
  ['Link backup flapping', 'CV Mitra Jaya', 'New', 'Urgent', -3, 0.5],
  ['Gangguan LOS area Tambun', 'PT Anugerah Tekstil', 'In Progress', 'Normal', -52, 26],
  ['Permintaan pengecekan fiber', 'RS Harapan Sehat', 'Waiting', 'Low', -120, -5],
  ['Throughput turun 40%', 'PT Global Logistik', 'In Progress', 'High', -8, 18],
  ['Modem client mati total', 'Koperasi Sejahtera', 'New', 'Normal', -1, 4],
  ['Redaman tinggi di ODP-12', 'PT Nusa Bangun', 'Waiting', 'Normal', -76, -12],
  ['Salah konfigurasi VLAN', 'CV Karya Mandiri', 'In Progress', 'Low', -34, 30],
];

const queue = tickets.map(([subject, customer, stage, priority, createdOffset, deadlineOffset], index) => {
  const deadlineDate = iso(deadlineOffset);
  const late = deadlineOffset < 0;
  return {
    id: 1284 + index,
    ref: `#${1284 + index}`,
    subject,
    customer,
    customerEmail: null,
    stage,
    stageId: index,
    priority,
    team: 'Field Ops Cibitung',
    assignee: 'Ridwan Field Ops Cibitung',
    createdAt: iso(createdOffset),
    updatedAt: iso(-1),
    deadline: deadlineDate,
    deadlineDate,
    late,
    kanban: 'normal',
  };
});

const daily = Array.from({ length: 30 }, (_, index) => {
  const date = new Date(now - (29 - index) * 86400000).toISOString().slice(0, 10);
  const count = [2, 3, 1, 4, 3, 5, 2, 3, 4, 6, 2, 1, 3, 4][index % 14] + (index % 5 === 0 ? 1 : 0);
  return { date, count };
});

const payload = {
  account: {
    user: { id: 42, name: 'Ridwan Field Ops Cibitung', login: 'ridwan@indonet.id', email: 'ridwan@indonet.id' },
    employee: { id: 9, name: 'Ridwan', jobTitle: 'Field Operations', department: 'Field Ops Cibitung' },
    company: 'Indonet',
    scope: { person: 'Ridwan', unit: 'Cibitung', unitVerified: true },
  },
  generatedAt: new Date().toISOString(),
  source: { model: 'helpdesk.ticket', available: true, fields: [], stages: [] },
  window: { days: 30, from: daily[0].date, to: daily.at(-1).date },
  totals: {
    open: queue.length,
    late: queue.filter((ticket) => ticket.late).length,
    dueToday: 2,
    closedThisMonth: 17,
    total: queue.length + 17,
  },
  stages: [
    { name: 'In Progress', count: 4 },
    { name: 'New', count: 2 },
    { name: 'Waiting', count: 2 },
  ],
  priorities: [
    { name: 'Normal', count: 3 },
    { name: 'High', count: 2 },
    { name: 'Urgent', count: 1 },
    { name: 'Low', count: 2 },
  ],
  daily,
  queue,
  attention: [...queue].sort((a, b) => String(a.deadlineDate).localeCompare(String(b.deadlineDate))).slice(0, 6),
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');

  if (url.pathname === '/api/dashboard') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(payload));
    return;
  }

  if (url.pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"ok":true}');
    return;
  }

  const rel = url.pathname === '/' ? '/index.html' : url.pathname;
  const target = normalize(join(publicDir, rel));
  if (!target.startsWith(publicDir + sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  try {
    const body = await readFile(target);
    res.writeHead(200, { 'Content-Type': MIME[extname(target)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Preview UI (data contoh) di http://127.0.0.1:${PORT}`);
});
