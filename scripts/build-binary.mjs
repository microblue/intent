// Build the single-file Intent executable(s) with Bun.
//   node scripts/build-binary.mjs            -> this machine only
//   node scripts/build-binary.mjs --all      -> linux x64/arm64, macOS x64/arm64, windows x64
// The web UI from dist/ is embedded; nothing else is needed at runtime.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const all = process.argv.includes('--all');
const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, stdio: 'inherit' });

run('node_modules/.bin/vite', ['build']);

const files = {};
const walk = (dir, prefix) => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, `${prefix}/${name}`);
    else files[`${prefix}/${name}`] = readFileSync(full).toString('base64');
  }
};
walk(join(root, 'dist'), '');

const build = join(root, '.build');
rmSync(build, { recursive: true, force: true });
mkdirSync(build);
writeFileSync(join(build, 'assets.json'), JSON.stringify(files));
writeFileSync(join(build, 'entry.ts'), `import files from './assets.json';
import { embeddedAssets, runCli } from '../server/main';
runCli(process.argv.slice(2), embeddedAssets(files as Record<string, string>)).catch((e: Error) => {
  console.error('[intent] ' + e.message);
  process.exit(1);
});
`);

const host = `${process.platform === 'win32' ? 'windows' : process.platform}-${process.arch}`;
const targets = all ? ['linux-x64', 'linux-arm64', 'darwin-x64', 'darwin-arm64', 'windows-x64'] : [host];
const out = join(root, 'release');
mkdirSync(out, { recursive: true });
const sums = [];
for (const t of targets) {
  const file = join(out, `intent-${t}${t.startsWith('windows') ? '.exe' : ''}`);
  run('bun', ['build', '--compile', '--minify', `--target=bun-${t}`, join(build, 'entry.ts'), '--outfile', file]);
  const buf = readFileSync(file);
  sums.push(`${createHash('sha256').update(buf).digest('hex')}  ${file.split('/').pop()}`);
  console.log(`${file.split('/').pop()}  ${(buf.length / 1048576).toFixed(1)} MB`);
}
writeFileSync(join(out, 'SHA256SUMS'), sums.join('\n') + '\n');
rmSync(build, { recursive: true, force: true });
