import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const root = fs.realpathSync(process.argv[2]);
function inspect(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, e.name);
    if (e.isSymbolicLink()) {
      const target = fs.realpathSync(file);
      assert.ok(target.startsWith(root + path.sep), `Dependency link escapes artifact: ${file}`);
    } else if (e.isDirectory()) inspect(file);
  }
}
inspect(root);
for (const file of ['dist/index.js', 'racket/publy-hosted-admission-cli.rkt', 'deploy/publy.service']) assert.ok(fs.existsSync(path.join(root, file)), file);
const require = createRequire(path.join(root, 'package.json'));
assert.throws(() => require.resolve('typescript'), /Cannot find module/);
const { loadTheme } = await import(pathToFileURL(require.resolve('@publy/core')));
assert.ok(loadTheme('claude').css.length > 100);
const { buildApp } = await import(pathToFileURL(path.join(root, 'dist/index.js')));
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'publy-installed-smoke-'));
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error('Installed artifact smoke forbids external requests'); };
try {
  const app = buildApp({ port: 0, apiKey: 'synthetic-install-only', accounts: [], dataDir: data, publicIp: '127.0.0.1' });
  try {
    const response = await app.inject({ method: 'GET', url: '/health' });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().service, 'publy-server');
    const setup = await app.inject({ method: 'GET', url: '/setup' });
    assert.equal(setup.statusCode, 200);
    assert.match(setup.body, /127\.0\.0\.1/);
    assert.match(setup.body, /API IP/);
    assert.doesNotMatch(setup.body, /__SETUP_JS__|__WEB_CSS__|__PUBLIC_IP__/);
  } finally { await app.close(); }
} finally { globalThis.fetch = originalFetch; fs.rmSync(data, { recursive: true, force: true }); }
console.log('PASS — isolated server artifact, assets, dependencies and HTTP health; no payment or publishing');
