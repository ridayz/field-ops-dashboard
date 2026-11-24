// HTTP helper that survives flaky DNS / half-dead hosts.
// helpdesk.indonet.id resolves to several IPs and one of them often times out,
// so every request is pinned to a concrete IP and retried on the others.
import { request as httpsRequest } from 'node:https';
import { resolve4 as dnsResolve4, resolve6 as dnsResolve6 } from 'node:dns/promises';

const DNS_TTL_MS = 5 * 60 * 1000;
const cache = new Map();

async function resolveAddresses(hostname) {
  const cached = cache.get(hostname);
  if (cached && Date.now() - cached.at < DNS_TTL_MS) return cached.addresses;

  const addresses = [];
  try {
    addresses.push(...(await dnsResolve4(hostname)));
  } catch {
    // no A records
  }
  try {
    addresses.push(...(await dnsResolve6(hostname)));
  } catch {
    // no AAAA records
  }
  if (addresses.length === 0) addresses.push(null); // let the system resolver try
  cache.set(hostname, { at: Date.now(), addresses });
  return addresses;
}

function once(url, { method = 'GET', headers = {}, body = null, ip, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const req = httpsRequest(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || 443,
        path: `${target.pathname}${target.search}`,
        method,
        headers,
        servername: target.hostname,
        ...(ip
          ? {
              lookup: (_host, opts, cb) => {
                const family = ip.includes(':') ? 6 : 4;
                if (opts && opts.all) {
                  cb(null, [{ address: ip, family }]);
                  return;
                }
                cb(null, ip, family);
              },
            }
          : {}),
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );

    req.setTimeout(timeoutMs, () => {
      req.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

export async function httpRequest(url, options = {}) {
  const {
    method = 'GET',
    headers = {},
    body = null,
    timeoutMs = 20000,
    attemptsPerAddress = 2,
  } = options;

  const hostname = new URL(url).hostname;
  const addresses = await resolveAddresses(hostname);
  let lastError = null;

  for (const ip of addresses) {
    for (let attempt = 0; attempt < attemptsPerAddress; attempt += 1) {
      try {
        return await once(url, { method, headers, body, ip, timeoutMs });
      } catch (error) {
        lastError = error;
        if (error.code === 'ENOTFOUND' || error.code === 'CERT_HAS_EXPIRED') break;
      }
    }
  }

  cache.delete(hostname);
  throw lastError ?? new Error('Tidak ada alamat IP yang bisa dihubungi');
}

export async function postJson(url, payload, options = {}) {
  const res = await httpRequest(url, {
    ...options,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
    body: JSON.stringify(payload),
  });
  return res;
}

export async function getText(url, options = {}) {
  return httpRequest(url, { ...options, method: 'GET' });
}
