// Odoo JSON-RPC client, read-only by construction.
// Only whitelisted read methods are exposed to the rest of the app.

import { postJson } from './http.mjs';

const READ_METHODS = new Set([
  'search_read',
  'search_count',
  'read',
  'read_group',
  'fields_get',
  'name_search',
  'name_get',
]);

export class OdooError extends Error {
  constructor(message, detail) {
    super(message);
    this.name = 'OdooError';
    this.detail = detail ?? null;
  }
}

function normaliseUrl(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new OdooError('URL Odoo belum diisi di config.local.json');
  }
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new OdooError('URL Odoo harus diawali http:// atau https://');
  }
  return trimmed;
}

function odooMessage(payload) {
  const data = payload?.data ?? {};
  const message =
    data.message ||
    payload?.message ||
    data.name ||
    'Odoo menolak permintaan';
  return String(message).replace(/<[^>]*>/g, '').trim();
}

export function createClient({ url, db, login, apiKey, timeoutMs = 25000 }) {
  const baseUrl = normaliseUrl(url);
  const endpoint = `${baseUrl}/jsonrpc`;
  let uid = null;

  async function rpc(service, method, args) {
    const body = {
      jsonrpc: '2.0',
      method: 'call',
      params: { service, method, args },
      id: Math.floor(Math.random() * 1e9),
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response;
    try {
      response = await postJson(endpoint, body, { timeoutMs, attemptsPerAddress: 2 });
    } catch (error) {
      const reason =
        error?.name === 'AbortError' || error?.code === 'ETIMEDOUT'
          ? `Odoo tidak merespons dalam ${Math.round(timeoutMs / 1000)} detik`
          : 'Tidak bisa menghubungi server Odoo. Periksa jaringan atau URL.';
      throw new OdooError(reason);
    } finally {
      clearTimeout(timer);
    }

    if (response.status < 200 || response.status >= 300) {
      throw new OdooError(`Odoo membalas HTTP ${response.status}`);
    }

    let payload;
    try {
      payload = JSON.parse(response.body);
    } catch {
      throw new OdooError('Balasan Odoo bukan JSON. Pastikan URL mengarah ke server Odoo.');
    }

    if (payload.error) {
      throw new OdooError(odooMessage(payload.error.data ?? payload.error), payload.error.data ?? null);
    }
    return payload.result;
  }

  async function authenticate() {
    if (uid) return uid;
    if (!db) {
      throw new OdooError('Nama database Odoo belum diisi di config.local.json');
    }
    if (!login || !apiKey) {
      throw new OdooError('Login atau API key belum lengkap di config.local.json');
    }
    const result = await rpc('common', 'login', [db, login, apiKey]);
    if (!result) {
      throw new OdooError('Login ditolak Odoo. Periksa nama database, email login, dan API key.');
    }
    uid = result;
    return uid;
  }

  // Whitelisted read-only call.
  async function read(model, method, args = [], kwargs = {}) {
    if (!READ_METHODS.has(method)) {
      throw new OdooError(`Metode "${method}" diblokir: dashboard ini hanya boleh membaca data`);
    }
    const user = await authenticate();
    const result = await rpc('object', 'execute_kw', [db, user, apiKey, model, method, args, kwargs]);
    return result;
  }

  async function searchRead(model, domain = [], fields = [], options = {}) {
    return read(model, 'search_read', [domain], { fields, limit: 200, ...options });
  }

  async function searchCount(model, domain = []) {
    return read(model, 'search_count', [domain]);
  }

  async function version() {
    return rpc('common', 'version', []);
  }

  return {
    baseUrl,
    db,
    login,
    authenticate,
    read,
    searchRead,
    searchCount,
    version,
    get uid() {
      return uid;
    },
  };
}
