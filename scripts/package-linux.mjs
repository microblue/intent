import { cpSync, mkdirSync, writeFileSync, chmodSync, readFileSync, readdirSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
if (process.platform !== 'linux') throw new Error('Build on Linux for the target architecture');
const name = `intent-linux-${process.arch}`;
const staging = mkdtempSync(resolve(tmpdir(), 'intent-package-'));
const out = resolve(staging, name);
mkdirSync('release', { recursive: true });
const archive = resolve('release', `${name}.tar.gz`);
mkdirSync(`${out}/bin`, { recursive: true });
mkdirSync(`${out}/scripts`, { recursive: true });
cpSync(process.execPath, `${out}/bin/node`);
mkdirSync(`${out}/licenses`, { recursive: true });
const nodeLicense = resolve(dirname(process.execPath), '..', 'LICENSE');
if (!existsSync(nodeLicense)) throw new Error('Node LICENSE must accompany the bundled runtime');
cpSync(nodeLicense, `${out}/licenses/Node-LICENSE`);
for (const dep of readdirSync('node_modules/.pnpm', { withFileTypes: true })) {
  if (!dep.isDirectory()) continue;
  const modules = `node_modules/.pnpm/${dep.name}/node_modules`;
  if (!existsSync(modules)) continue;
  const packages = readdirSync(modules).flatMap(name => name.startsWith('@') ? readdirSync(`${modules}/${name}`).map(child => `${name}/${child}`) : [name]);
  for (const pkg of packages) {
    for (const license of ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'license', 'license.md', 'license.txt']) {
      const source = `${modules}/${pkg}/${license}`;
      if (existsSync(source)) cpSync(source, `${out}/licenses/${dep.name.replaceAll('/', '_')}-${pkg.replaceAll('/', '_')}-${license}`);
    }
  }
}
for (const dir of ['dist', 'dist-server']) cpSync(dir, `${out}/${dir}`, { recursive: true });
cpSync('scripts/instance.mjs', `${out}/scripts/instance.mjs`);
cpSync('docs/INSTANCE.md', `${out}/README.md`);
writeFileSync(`${out}/package.json`, '{"name":"intent-instance","type":"module","private":true}\n');
writeFileSync(`${out}/intent`, '#!/bin/sh\nROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\nexec "$ROOT/bin/node" "$ROOT/scripts/instance.mjs" "$@"\n');
chmodSync(`${out}/intent`, 0o755);
writeFileSync(`${out}/config.env.example`, 'HOST=127.0.0.1\nPORT=5199\nINTENT_PROVIDER=meta\nMODEL_API_KEY=\n');
writeFileSync(`${out}/build.json`, JSON.stringify({ product: 'intent', node: process.version, arch: process.arch, platform: process.platform, glibc: process.report.getReport().header.glibcVersionRuntime, builtAt: new Date().toISOString() }, null, 2));
execFileSync('tar', ['-czf', archive, '-C', staging, name]);
writeFileSync(`${archive}.sha256`, createHash('sha256').update(readFileSync(archive)).digest('hex') + `  ${name}.tar.gz\n`);
rmSync(staging, { recursive: true });
console.log(archive);
