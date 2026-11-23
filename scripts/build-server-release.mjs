import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const output = path.resolve(process.argv[2] ?? 'server-release');
const root = process.cwd();
const pkg = JSON.parse(fs.readFileSync('packages/server/package.json', 'utf8'));
if (process.platform !== 'linux' || process.arch !== 'x64') throw new Error('Release target is Linux x64');
if (process.version !== 'v24.14.0') throw new Error('Build with the reviewed Node v24.14.0 runtime');
if (execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()) throw new Error('Commit the complete release tree first');
fs.mkdirSync(output, { recursive: true });
const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'publy-server-release-'));
try {
  const target = path.join(stage, 'publy-server');
  execFileSync('pnpm', ['--filter', '@publy/server', 'deploy', '--prod', '--offline', target], { stdio: 'inherit' });
  fs.mkdirSync(path.join(target, 'racket'));
  for (const file of ['publy-hosted-admission-cli.rkt', 'publy-hosted-admission.rkt', 'publy-hosted-snapshot.rkt']) {
    fs.copyFileSync(path.join(root, 'racket', file), path.join(target, 'racket', file));
  }
  fs.cpSync(path.join(root, 'deploy'), path.join(target, 'deploy'), { recursive: true });
  for (const name of ['LICENSE', 'pnpm-lock.yaml']) fs.copyFileSync(name, path.join(target, name));
  const metadata = { service: 'publy-server', version: pkg.version, platform: 'linux', architecture: 'x64',
    node: process.version, source_commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    source_lock_sha256: crypto.createHash('sha256').update(fs.readFileSync('pnpm-lock.yaml')).digest('hex') };
  fs.writeFileSync(path.join(target, 'release.json'), JSON.stringify(metadata, null, 2) + '\n');
  execFileSync(process.execPath, ['scripts/verify-server-package.mjs', target], { stdio: 'inherit' });
  const archive = `publy-server-${pkg.version}-linux-x64.tar.gz`;
  execFileSync('tar', ['-czf', path.join(output, archive), '-C', stage, 'publy-server']);
  fs.copyFileSync(path.join(target, 'release.json'), path.join(output, 'release.json'));
  fs.writeFileSync(path.join(output, 'SHA256SUMS'), [archive, 'release.json'].map(name =>
    crypto.createHash('sha256').update(fs.readFileSync(path.join(output, name))).digest('hex') + '  ' + name + '\n').join(''));
} finally { fs.rmSync(stage, { recursive: true, force: true }); }
