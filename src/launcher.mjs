import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

let port = 4780;
try {
  const config = loadConfig();
  port = Number(process.env.FIELD_OPS_PORT ?? config.port);
} catch (error) {
  console.error(`\n${error.message}\n`);
  process.exit(1);
}

const base = `http://127.0.0.1:${port}`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function isAlive() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1200);
    const res = await fetch(`${base}/api/health`, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

function openBrowser(url) {
  if (process.platform === 'win32') {
    // Windows file/URL protocol handler, no shell window.
    spawn('rundll32.exe', ['url.dll,FileProtocolHandler', url], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    }).unref();
    return;
  }
  const opener = process.platform === 'darwin' ? 'open' : 'xdg-open';
  spawn(opener, [url], { detached: true, stdio: 'ignore' }).unref();
}

async function main() {
  if (!(await isAlive())) {
    const child = spawn(process.execPath, [join(root, 'src', 'server.mjs')], {
      cwd: root,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();

    let up = false;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await sleep(250);
      if (await isAlive()) {
        up = true;
        break;
      }
    }
    if (!up) {
      console.error('Server dashboard tidak bisa dijalankan. Cek config.local.json lalu coba lagi.');
      process.exit(1);
    }
  }

  openBrowser(base);
}

main();
