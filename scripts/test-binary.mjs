// End-to-end check of the single-file binary with the scripted fake model.
//   node scripts/test-binary.mjs [path-to-binary]
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const bin = resolve(process.argv[2] ?? `release/intent-${process.platform}-${process.arch}`);
const tmp = mkdtempSync(join(tmpdir(), 'intent-bin-'));
const dir = join(tmp, 'new-data-dir'); // must be created by the binary itself
const port = 5300 + Math.floor(Math.random() * 500);
const base = `http://127.0.0.1:${port}`;
const env = { ...process.env, INTENT_PROVIDER: 'fake', OPENROUTER_API_KEY: '', MODEL_API_KEY: '' };
let failed = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); if (!cond) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function start() {
  const child = spawn(bin, ['serve', '--dir', dir, '--http', `127.0.0.1:${port}`], { env });
  let out = '';
  child.stdout.on('data', (d) => (out += d));
  child.stderr.on('data', (d) => (out += d));
  return { child, out: () => out };
}
async function ready() {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(base + '/healthz')).ok) return true; } catch {} await sleep(100); }
  return false;
}
const stop = (c) => new Promise((r) => { c.once('exit', r); c.kill('SIGTERM'); });
function jar() {
  let cookie = '';
  const call = async (method, path, body) => {
    const r = await fetch(base + path, { method, headers: { cookie, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const set = r.headers.getSetCookie?.() ?? [];
    for (const c of set) cookie = c.split(';')[0].endsWith('=') ? '' : c.split(';')[0];
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  call.cookie = () => cookie;
  return call;
}

try {
  ok(existsSync(bin), `binary exists (${(statSync(bin).size / 1048576).toFixed(1)} MB)`);
  let s = start();
  ok(await ready(), 'serves /healthz');
  ok((await (await fetch(base + '/')).text()).includes('<div id="root">'), 'serves the embedded web UI');
  ok((await fetch(base + '/t/some-deep-link')).status === 200, 'deep links fall back to the app');

  // A user, a task, and live updates.
  const a = jar();
  await a('POST', '/api/session');
  const events = [];
  const ac = new AbortController();
  void fetch(base + '/api/events', { headers: { cookie: a.cookie() }, signal: ac.signal })
    .then(async (r) => { const rd = r.body.getReader(); for (;;) { const { value, done } = await rd.read(); if (done) break; events.push(new TextDecoder().decode(value)); } })
    .catch(() => {});
  await sleep(200);
  const created = await a('POST', '/api/things', { text: 'Write a birthday message for my old friend' });
  ok(created.status === 201, 'creates a task');
  let detail;
  for (let i = 0; i < 50; i++) { await sleep(100); detail = (await a('GET', `/api/things/${created.body.id}`)).body; if (!detail.thing.busy) break; }
  ok(detail && !detail.thing.busy && detail.entries.length > 1, `agent turn completes (${detail?.entries.map((e) => e.kind).join(',')})`);
  ok(events.join('').includes(`"id":"${created.body.id}"`), 'pushes live change events over SSE');
  ac.abort();

  // Accounts: register here, log in from another browser, see the same task.
  ok((await a('POST', '/api/account/register', { username: 'grandma', password: 'secret123' })).status === 200, 'registers an account');
  const b = jar();
  await b('POST', '/api/session');
  ok((await b('POST', '/api/account/login', { username: 'grandma', password: 'wrong-pass' })).status === 401, 'rejects a wrong password');
  ok((await b('POST', '/api/account/login', { username: 'Grandma', password: 'secret123' })).status === 200, 'logs in from another browser');
  ok((await b('GET', '/api/things')).body.some((t) => t.id === created.body.id), 'second browser sees the same tasks');
  const other = jar();
  await other('POST', '/api/session');
  ok((await other('GET', `/api/things/${created.body.id}`)).status === 404, 'other users cannot read it');

  // Admin: first-run setup link, stats, backup.
  const token = s.out().match(/#setup=([a-f0-9]+)/)?.[1];
  ok(!!token, 'prints a one-time admin setup link');
  const adm = jar();
  ok((await adm('POST', '/_/api/setup', { token: 'bad', password: 'admin-pass-1' })).status === 403, 'refuses a bad setup token');
  ok((await adm('POST', '/_/api/setup', { token, password: 'admin-pass-1' })).status === 200, 'sets the admin password');
  const stats = (await adm('GET', '/_/api/stats')).body;
  ok(stats?.counts?.things === 1 && stats.counts.accounts === 1, `admin stats (rss ${stats?.rssMB} MB, db ${stats?.dbKB} KB, ${stats?.runtime})`);
  ok((await other('GET', '/_/api/stats')).status === 401, 'admin API needs the admin login');
  const backup = await fetch(base + '/_/api/backup', { headers: { cookie: adm.cookie() } });
  const bytes = Buffer.from(await backup.arrayBuffer());
  ok(backup.ok && bytes.subarray(0, 15).toString() === 'SQLite format 3', `downloads a SQLite backup (${(bytes.length / 1024).toFixed(0)} KB)`);

  // One process per data directory.
  const twin = spawn(bin, ['serve', '--dir', dir, '--http', `127.0.0.1:${port + 1}`], { env });
  const twinCode = await new Promise((r) => twin.once('exit', r));
  ok(twinCode !== 0, 'refuses a second process on the same data directory');

  // Memory after some work.
  const rss = Number(readFileSync(`/proc/${s.child.pid}/status`, 'utf8').match(/VmRSS:\s+(\d+)/)?.[1] ?? 0) / 1024;
  console.log(`     resident memory: ${rss.toFixed(0)} MB`);

  // Restart: data, sessions and accounts survive.
  await stop(s.child);
  ok(!existsSync(join(dir, 'intent.pid')), 'removes its lock on shutdown');
  s = start();
  ok(await ready(), 'restarts');
  ok((await b('GET', `/api/things/${created.body.id}`)).status === 200, 'task and session survive a restart');
  ok((await adm('GET', '/_/api/stats')).status === 200, 'admin session survives a restart');
  ok(!/#setup=/.test(s.out()), 'no setup link once an admin exists');
  await stop(s.child);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
