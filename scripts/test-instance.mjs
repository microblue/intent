import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, renameSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
const temp = mkdtempSync(join(tmpdir(), 'intent-instance-test-'));
const bundle = join(temp, 'relocated package');
execFileSync('tar', ['-xzf', resolve(`release/intent-linux-${process.arch}.tar.gz`), '-C', temp]);
renameSync(join(temp, `intent-linux-${process.arch}`), bundle);
const processes = new Set();
const delay = ms => new Promise(r => setTimeout(r, ms));
async function boot(home, port) {
  mkdirSync(home, { recursive: true });
  writeFileSync(join(home, 'config.env'), `INTENT_PROVIDER=fake\nPORT=${port}\nHOST=127.0.0.1\n`, { mode: 0o600 });
  const proc = spawn(join(bundle, 'intent'), ['run', home], { cwd: '/', env: { PATH: '/usr/bin:/bin' }, stdio: ['ignore', 'pipe', 'pipe'] });
  processes.add(proc);
  let logs = ''; proc.stdout.on('data', b => logs += b); proc.stderr.on('data', b => logs += b);
  for (let i = 0; i < 100; i++) {
    if (proc.exitCode !== null) throw new Error(logs);
    try { if ((await fetch(`http://127.0.0.1:${port}/healthz`)).ok) return proc; } catch {}
    await delay(50);
  }
  throw new Error(`Startup timeout ${logs}`);
}
async function stop(proc) { const ended = once(proc, 'exit'); proc.kill('SIGTERM'); await ended; processes.delete(proc); }
const a = join(temp, 'home-a'), b = join(temp, 'home-b');
try {
  let one = await boot(a, 15391); const two = await boot(b, 15392);
  const base = 'http://127.0.0.1:15391';
  assert.match(await (await fetch(base)).text(), /Intent/);
  const session = await fetch(`${base}/api/session`, { method: 'POST' });
  const cookie = session.headers.get('set-cookie').split(';')[0];
  const headers = { cookie, 'content-type': 'application/json' };
  const changed = await fetch(`${base}/api/me`, { method: 'PATCH', headers, body: JSON.stringify({ lang: 'en' }) });
  assert.equal(changed.status, 200);
  assert.equal((await changed.json()).lang, 'en');
  assert.equal((await fetch('http://127.0.0.1:15392/api/me', { headers })).status, 401);
  const duplicate = spawn(join(bundle, 'intent'), ['run', a], { stdio: 'ignore' });
  assert.notEqual((await once(duplicate, 'exit'))[0], 0);
  await stop(one);
  assert.equal(existsSync(join(a, 'process.json')), false);
  one = await boot(a, 15391);
  assert.equal((await (await fetch(`${base}/api/me`, { headers })).json()).lang, 'en');
  assert.equal(JSON.parse(readFileSync(join(a, 'data/store.json'), 'utf8')).format, 'intent-tinybase-v1');
  assert.match(execFileSync(join(bundle, 'intent'), ['status', a], { encoding: 'utf8' }), /running/);
  await stop(one); await stop(two);
  console.log('PASS: relocated bundle with bundled Node, frontend, health, independent instances, duplicate lock, persistent TinyBase data and session across restart.');
} finally {
  for (const proc of processes) proc.kill('SIGKILL');
  rmSync(temp, { recursive: true, force: true });
}
