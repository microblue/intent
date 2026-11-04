import { mkdirSync, openSync, writeFileSync, closeSync, readFileSync, unlinkSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const command = process.argv[2] ?? 'run';
const home = resolve(process.argv[3] ?? process.env.INTENT_HOME ?? `${root}/instance`);
mkdirSync(home, { recursive: true, mode: 0o700 });
const lock = `${home}/process.json`;
function running() {
  try {
    const record = JSON.parse(readFileSync(lock, 'utf8'));
    const stat = readFileSync(`/proc/${record.pid}/stat`, 'utf8');
    return stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19] === record.start ? record.pid : null;
  } catch { return null; }
}
if (command === 'status') { const pid = running(); console.log(pid ? `Intent running (pid ${pid}) in ${home}` : 'Intent stopped'); process.exit(pid ? 0 : 1); }
if (command === 'stop') { const pid = running(); if (pid) process.kill(pid, 'SIGTERM'); console.log(pid ? 'Shutdown requested' : 'Intent stopped'); process.exit(0); }
if (!['start', 'run'].includes(command)) throw new Error('Usage: intent [run|start|stop|status] [instance-directory]');
if (command === 'start') {
  if (running()) throw new Error('Instance already running');
  const log = openSync(`${home}/server.log`, 'a', 0o600);
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), 'run', home], { detached: true, stdio: ['ignore', log, log], env: process.env });
  child.unref(); closeSync(log);
  console.log(`Start requested; check intent status and ${home}/server.log`);
} else {
  if (existsSync(lock)) {
    if (running()) throw new Error('Instance already running');
    // Never automatically remove a lock: another process may be creating it.
    throw new Error(`Stale or incomplete lock: verify no instance is running, then remove ${lock}`);
  }
  const fd = openSync(lock, 'wx', 0o600);
  const stat = readFileSync(`/proc/${process.pid}/stat`, 'utf8');
  writeFileSync(fd, JSON.stringify({ pid: process.pid, start: stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19] })); closeSync(fd);
  process.on('exit', () => { try { unlinkSync(lock); } catch {} });
  const envFile = `${home}/config.env`;
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  process.env.INTENT_DATA_FILE = `${home}/data/store.json`;
  process.env.INTENT_STATIC_DIR = `${root}/dist`;
  mkdirSync(`${home}/data`, { recursive: true, mode: 0o700 });
  await import(`${root}/dist-server/standalone.js`);
}
