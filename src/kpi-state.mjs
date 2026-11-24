import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const stateFile = join(root, 'data', 'kpi-state.json');

const norm = (t) => String(t || '').trim().toUpperCase();

let cache = null;

export async function loadKpiState() {
  if (cache) return cache;
  let raw = {};
  try {
    raw = JSON.parse(await readFile(stateFile, 'utf8'));
  } catch {
    raw = {};
  }
  cache = {
    baseline: new Set((raw.baseline || []).map(norm).filter(Boolean)),
    done: new Set((raw.done || []).map(norm).filter(Boolean)),
    source: raw.source || '',
  };
  return cache;
}

async function persist() {
  const st = await loadKpiState();
  const payload = {
    note: 'baseline = tiket yang SUDAH ada di Dynamics (snapshot export). done = tiket yang sudah ditandai \'Sudah\' dari tab KPI belum diinput.',
    source: st.source,
    updated: new Date().toISOString().slice(0, 10),
    baseline: [...st.baseline].sort(),
    done: [...st.done].sort(),
  };
  await mkdir(dirname(stateFile), { recursive: true });
  await writeFile(stateFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

export async function getKpiState() {
  const st = await loadKpiState();
  return { baseline: [...st.baseline].sort(), done: [...st.done].sort(), source: st.source };
}

export async function setKpiDone(ticket, done) {
  const key = norm(ticket);
  if (!key) throw new Error('nomor tiket kosong');
  const st = await loadKpiState();
  if (done) st.done.add(key);
  else st.done.delete(key);
  await persist();
  return { ticket: key, done, doneTickets: [...st.done].sort() };
}
