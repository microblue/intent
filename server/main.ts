/**
 * Intent command line. One program, one data directory:
 *   intent serve  [--dir ./intent_data] [--http 127.0.0.1:5199]
 *   intent admin  <new-password> [--dir …]   set the /_/ admin password
 *   intent backup <file.db>      [--dir …]   copy the database (instance stopped)
 *   intent version
 * Settings come from the environment or <dir>/config.env.
 */
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, statSync, unlinkSync, writeSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import type { Asset, Assets } from './http';
import { VERSION } from './version';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8',
};
const mime = (p: string) => MIME[extname(p)] ?? 'application/octet-stream';

/** Assets compiled into the binary: path -> base64. */
export function embeddedAssets(files: Record<string, string>): Assets {
  const cache = new Map<string, Asset>();
  return (p) => {
    if (!(p in files)) return undefined;
    let a = cache.get(p);
    if (!a) cache.set(p, (a = { body: Buffer.from(files[p], 'base64'), type: mime(p) }));
    return a;
  };
}

/** Assets read from a built `dist/` directory (running from source). */
export function directoryAssets(dir: string): Assets {
  const root = resolve(dir);
  return (p) => {
    const file = resolve(root, '.' + decodeURIComponent(p));
    if (!file.startsWith(root + sep)) return undefined;
    try { return statSync(file).isFile() ? { body: readFileSync(file), type: mime(file) } : undefined; } catch { return undefined; }
  };
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf('--' + name);
  if (i >= 0) return args[i + 1];
  return args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}
const positional = (args: string[]) => args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--') && !args[i - 1].includes('=')));

/** KEY=VALUE lines; existing environment wins. */
function loadConfig(dir: string) {
  const file = join(dir, 'config.env');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

/** One process per data directory. */
function lock(dir: string): () => void {
  const file = join(dir, 'intent.pid');
  if (existsSync(file)) {
    const pid = Number(readFileSync(file, 'utf8'));
    let alive = false;
    try { if (pid && pid !== process.pid) { process.kill(pid, 0); alive = true; } } catch (e) { alive = (e as NodeJS.ErrnoException).code === 'EPERM'; }
    if (alive) throw new Error(`Another Intent process (pid ${pid}) is using ${dir}`);
    unlinkSync(file);
  }
  const fd = openSync(file, 'wx', 0o600);
  writeSync(fd, String(process.pid));
  closeSync(fd);
  return () => { try { if (readFileSync(file, 'utf8') === String(process.pid)) unlinkSync(file); } catch { /* gone */ } };
}

const HELP = `Intent ${VERSION} — a tiny, self-contained AI helper with its own database.

Usage:
  intent serve  [--dir ./intent_data] [--http 127.0.0.1:5199]
  intent admin  <new-password> [--dir ./intent_data]
  intent backup <out.db> [--dir ./intent_data]     (stop the server first, or use /_/)
  intent version

Settings (environment or <dir>/config.env):
  INTENT_PROVIDER=meta|openrouter|fake   MODEL_API_KEY / OPENROUTER_API_KEY
  INTENT_MODEL_MAIN, INTENT_MODEL_SEARCH, INTENT_PUBLIC_ORIGIN (https://your.domain)
  INTENT_ADMIN_PASSWORD (optional; otherwise a one-time setup link is printed)`;

export async function runCli(argv: string[], assets?: Assets): Promise<void> {
  const [cmd = 'help'] = positional(argv);
  if (cmd === 'version' || cmd === '--version' || cmd === '-v') return void console.log(VERSION);
  if (!['serve', 'admin', 'backup'].includes(cmd)) return void console.log(HELP);

  const dir = resolve(flag(argv, 'dir') ?? process.env.INTENT_DATA_DIR ?? 'intent_data');
  process.env.INTENT_DATA_DIR = dir;
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  loadConfig(dir);
  if (cmd !== 'serve') process.env.INTENT_PROVIDER ??= 'fake'; // admin/backup don't call a model

  const unlock = lock(dir);
  process.on('exit', unlock);
  const { getDeps } = await import('./deps');
  const deps = await getDeps();

  if (cmd === 'admin') {
    const pw = positional(argv)[1];
    if (!pw || pw.length < 8) throw new Error('Usage: intent admin <new-password>  (at least 8 characters)');
    const { hashPassword } = await import('./accounts');
    await deps.store.setSetting('adminHash', await hashPassword(pw));
    await deps.store.close();
    return void console.log('Admin password set.');
  }
  if (cmd === 'backup') {
    const out = resolve(positional(argv)[1] ?? `intent-backup-${Date.now()}.db`);
    if (existsSync(out)) throw new Error(`${out} already exists`);
    deps.store.backup(out);
    await deps.store.close();
    return void console.log(`Backup written to ${out}`);
  }

  const [host, portStr] = (flag(argv, 'http') ?? process.env.INTENT_HTTP ?? '127.0.0.1:5199').split(/:(?=\d+$)/);
  const port = Number(portStr ?? 5199);
  const { createIntentServer } = await import('./http');
  const { newSetupToken } = await import('./admin');
  if (process.env.INTENT_ADMIN_PASSWORD) {
    const { hashPassword } = await import('./accounts');
    await deps.store.setSetting('adminHash', await hashPassword(process.env.INTENT_ADMIN_PASSWORD));
  }
  const files = assets ?? directoryAssets(process.env.INTENT_STATIC_DIR ?? 'dist');
  if (!files('/index.html')) throw new Error('Web UI not found. Run `pnpm build` or use the release binary.');
  const { server, pending } = createIntentServer(deps, files);
  server.listen(port, host, () => {
    const base = process.env.INTENT_PUBLIC_ORIGIN?.split(',')[0] ?? `http://${host}:${port}`;
    console.log(`Intent ${VERSION} ready at http://${host}:${port}  (data: ${dir})`);
    if (!deps.store.getSetting('adminHash')) console.log(`Create the admin password: ${base}/_/#setup=${newSetupToken()}`);
  });
  let stopping = false;
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    server.close();
    server.closeAllConnections?.();
    setTimeout(() => process.exit(1), 20_000).unref();
    void Promise.allSettled([...pending]).then(() => deps.store.close()).then(() => process.exit(0));
  });
}

/** Files under dist/ as path -> base64, for embedding. */
export function readAssetDir(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string, prefix: string) => {
    for (const name of readdirSync(d)) {
      const full = join(d, name);
      if (statSync(full).isDirectory()) walk(full, `${prefix}/${name}`);
      else out[`${prefix}/${name}`] = readFileSync(full).toString('base64');
    }
  };
  walk(resolve(dir), '');
  return out;
}
