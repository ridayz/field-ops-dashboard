import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const configPath = join(root, 'config.local.json');

export function loadConfig() {
  if (!existsSync(configPath)) {
    throw new Error(
      `config.local.json belum ada. Salin config.example.json lalu isi URL, database, login, dan API key.\nLokasi: ${configPath}`,
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch {
    throw new Error(`config.local.json tidak valid (bukan JSON). Lokasi: ${configPath}`);
  }

  const config = {
    url: parsed.url,
    db: parsed.db,
    login: parsed.login,
    apiKey: parsed.apiKey,
    port: Number(parsed.port ?? 4780),
    host: parsed.host ?? '127.0.0.1',
    account: {
      nameContains: parsed.account?.nameContains ?? 'Ridwan',
      unitContains: parsed.account?.unitContains ?? 'Cibitung',
    },
  };

  const missing = ['url', 'login', 'apiKey'].filter((key) => !config[key]);
  if (missing.length > 0) {
    throw new Error(`config.local.json belum lengkap: ${missing.join(', ')}`);
  }

  return { ...config, root, configPath };
}
