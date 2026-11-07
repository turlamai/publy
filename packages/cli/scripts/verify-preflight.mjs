// Synthetic end-to-end CLI smoke: the user need not install Typora/Obsidian,
// configure a server, or grant access to their notes to run preflight.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import net from "node:net";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const entrypoint = path.resolve(here, "..", "dist", "index.js");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-check-smoke-"));
const run = (file, ...extra) => {
  const result = spawnSync(process.execPath, [entrypoint, "check", file, "--json", ...extra], {
    encoding: "utf8",
    env: { ...process.env, PUBLY_CONFIG: path.join(dir, "no-such-config.json") },
    timeout: 25000,
  });
  if (result.error) throw result.error;
  let report;
  try { report = JSON.parse(result.stdout.trim()); }
  catch { throw new Error("Invalid JSON preflight output: " + result.stdout + " / " + result.stderr); }
  assert.equal(report.kind, "local-preflight");
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.networkUsed, false);
  assert.equal(report.submitted, false);
  return { code: result.status, report };
};

try {
  const project = path.join(dir, "project");
  fs.mkdirSync(path.join(project, "assets"), { recursive: true });
  // Use real PNG bytes: a placeholder string would falsely prove that the
  // browser can display a broken image. This is the same 1×1 fixture used by
  // the core renderer's cover-crop tests.
  const tinyPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  fs.writeFileSync(path.join(project, "assets", "photo.png"), tinyPng);
  const goodPath = path.join(project, "article.md");
  const goodSource = "---\ntitle: User Article\n---\n\n# Hello\n\n![photo](assets/photo.png)";
  fs.writeFileSync(goodPath, goodSource);
  const good = run(goodPath);
  assert.equal(good.code, 0);
  assert.equal(good.report.ok, true);
  assert.equal(good.report.attachmentCount, 1);
  assert.equal(good.report.title, "User Article");
  assert.equal(fs.readFileSync(goodPath, "utf8"), goodSource, "preflight must not change source");

  const imageChoice = run(goodPath, "--format", "image");
  assert.equal(imageChoice.code, 0);
  assert.equal(imageChoice.report.type, "image_post");
  assert.equal(imageChoice.report.format, "image");
  assert.equal(imageChoice.report.formatSource, "choice");
  const invalidChoice = spawnSync(process.execPath, [entrypoint, "publish", goodPath, "--format", "bogus", "--json"], { encoding: "utf8", timeout: 25000 });
  assert.equal(invalidChoice.status, 2);
  assert.equal(JSON.parse(invalidChoice.stdout).code, "FORMAT_INVALID");
  const imagePreviewPath = path.join(dir, "image-preview.html");
  const imagePreview = spawnSync(process.execPath, [entrypoint, "preview", goodPath, "--format", "image", "--out", imagePreviewPath, "--json"], { encoding: "utf8", timeout: 25000 });
  assert.equal(imagePreview.status, 0, imagePreview.stderr);
  const imagePreviewReport = JSON.parse(imagePreview.stdout);
  assert.equal(imagePreviewReport.type, "image_post");
  assert.equal(imagePreviewReport.format, "image");
  const imagePreviewHtml = fs.readFileSync(imagePreviewPath, "utf8");
  assert.match(imagePreviewHtml, /WeChat image post preview/);
  assert.match(imagePreviewHtml, /data:image\/png;base64/);
  assert.equal(fs.readFileSync(goodPath, "utf8"), goodSource, "selection must not modify the source");

  // Config may contain a server API key. New files must be private, and
  // updating a pre-existing permissive file must tighten its permissions.
  const credentialConfig = path.join(dir, "credential-permissions.json");
  fs.writeFileSync(credentialConfig, "{}", { mode: 0o666 });
  if (process.platform !== "win32") fs.chmodSync(credentialConfig, 0o644);
  const setKey = spawnSync(process.execPath,
    [entrypoint, "config", "set", "api_key", "synthetic-private-key"], {
      encoding: "utf8", timeout: 25000,
      env: { ...process.env, PUBLY_CONFIG: credentialConfig },
    });
  assert.equal(setKey.status, 0, setKey.stderr);
  assert.equal(JSON.parse(fs.readFileSync(credentialConfig, "utf8")).api_key, "synthetic-private-key");
  if (process.platform !== "win32") {
    assert.equal(fs.statSync(credentialConfig).mode & 0o777, 0o600,
      "config updates must remove group/other read access");
  }
  const newCredentialConfig = path.join(dir, "private-config", "config.json");
  const createKey = spawnSync(process.execPath,
    [entrypoint, "config", "set", "api_key", "synthetic-private-key"], {
      encoding: "utf8", timeout: 25000,
      env: { ...process.env, PUBLY_CONFIG: newCredentialConfig },
    });
  assert.equal(createKey.status, 0, createKey.stderr);
  if (process.platform !== "win32") {
    assert.equal(fs.statSync(newCredentialConfig).mode & 0o777, 0o600);
    assert.equal(fs.statSync(path.dirname(newCredentialConfig)).mode & 0o777, 0o700);
  }

  // A symlink at the config path must be replaced, not followed: an old
  // symlink should never cause a credential write into an unrelated file.
  if (process.platform !== "win32") {
    const target = path.join(dir, "unrelated-target.json");
    const link = path.join(dir, "symlink-config.json");
    fs.writeFileSync(target, "{}\n");
    fs.symlinkSync(target, link);
    const throughLink = spawnSync(process.execPath,
      [entrypoint, "config", "set", "api_key", "symlink-safe-secret"], {
        encoding: "utf8", timeout: 25000,
        env: { ...process.env, PUBLY_CONFIG: link },
      });
    assert.equal(throughLink.status, 0, throughLink.stderr);
    assert.equal(fs.readFileSync(target, "utf8"), "{}\n",
      "config update must not overwrite a symlink target");
    assert.equal(fs.lstatSync(link).isSymbolicLink(), false);
    assert.equal(fs.statSync(link).mode & 0o777, 0o600);
    assert.equal(JSON.parse(fs.readFileSync(link, "utf8")).api_key, "symlink-safe-secret");
    assert.deepEqual(fs.readdirSync(dir).filter((name) => name.startsWith(".publy-config-")), [],
      "temporary credential files must be cleaned up after atomic rename");
  }

  // Structured config writes must not expose secrets, even in error paths.
  const jsonConfig = path.join(dir, "json-config.json");
  const jsonSecret = "agent-config-secret-must-stay-private";
  const jsonSet = spawnSync(process.execPath,
    [entrypoint, "config", "set", "api_key", jsonSecret, "--json"], {
      encoding: "utf8", timeout: 25000,
      env: { ...process.env, PUBLY_CONFIG: jsonConfig },
    });
  assert.equal(jsonSet.status, 0, jsonSet.stderr);
  const configResult = JSON.parse(jsonSet.stdout);
  assert.equal(configResult.kind, "config-set");
  assert.equal(configResult.code, "CONFIG_SAVED");
  assert.equal(configResult.ok, true);
  assert.equal(configResult.networkUsed, false);
  assert.equal(configResult.submitted, false);
  assert.ok(!jsonSet.stdout.includes(jsonSecret));
  assert.equal(JSON.parse(fs.readFileSync(jsonConfig, "utf8")).api_key, jsonSecret);
  const badJsonSet = spawnSync(process.execPath,
    [entrypoint, "config", "set", "unrecognized_key", jsonSecret, "--json"], {
      encoding: "utf8", timeout: 25000,
      env: { ...process.env, PUBLY_CONFIG: jsonConfig },
    });
  assert.equal(badJsonSet.status, 1);
  assert.equal(JSON.parse(badJsonSet.stdout).code, "CONFIG_KEY_INVALID");
  assert.ok(!badJsonSet.stdout.includes(jsonSecret));
  // Even a malformed key may itself contain a credential; omit untrusted
  // key names from structured error payloads instead of reflecting them.
  const sensitiveKey = "unknown-key-with-secret-" + jsonSecret;
  const invalidSensitiveKey = spawnSync(process.execPath,
    [entrypoint, "config", "set", sensitiveKey, "value", "--json"], {
      encoding: "utf8", timeout: 25000,
      env: { ...process.env, PUBLY_CONFIG: jsonConfig },
    });
  assert.equal(invalidSensitiveKey.status, 1);
  const invalidSensitiveResult = JSON.parse(invalidSensitiveKey.stdout);
  assert.equal(invalidSensitiveResult.code, "CONFIG_KEY_INVALID");
  assert.equal(Object.hasOwn(invalidSensitiveResult, "key"), false);
  assert.ok(!invalidSensitiveKey.stdout.includes(jsonSecret));
  assert.ok(!invalidSensitiveKey.stderr.includes(jsonSecret));


  // A malformed existing config can include credentials in the parser error.
  // JSON mode must return only a stable code, never parser excerpts.
  const malformedSetConfig = path.join(dir, "malformed-agent-config.json");
  const malformedSecret = "do-not-echo-this-parser-token";
  fs.writeFileSync(malformedSetConfig, '{"api_key":"' + malformedSecret + '",');
  const malformedSet = spawnSync(process.execPath,
    [entrypoint, "config", "set", "server", "https://example.invalid", "--json"], {
      encoding: "utf8", timeout: 25000,
      env: { ...process.env, PUBLY_CONFIG: malformedSetConfig },
    });
  assert.equal(malformedSet.status, 1);
  assert.equal(JSON.parse(malformedSet.stdout).code, "CONFIG_INVALID");
  assert.ok(!malformedSet.stdout.includes(malformedSecret));
  assert.ok(!malformedSet.stderr.includes(malformedSecret));
  assert.equal(fs.readFileSync(malformedSetConfig, "utf8"),
    '{"api_key":"' + malformedSecret + '",',
    "failed config update must preserve the original file");

  // Account mutations are local, explicit and machine-readable. Never print
  // App IDs, author metadata or private config contents to an Agent.
  const accountConfig = path.join(dir, "agent-account-add.json");
  const privateAppId = "wx-secret-identifier-not-for-stdout";
  const privateAuthor = "private-author-not-for-stdout";
  const addAccount = (...args) => spawnSync(process.execPath,
    [entrypoint, "account", "add", ...args, "--json"], {
      encoding: "utf8", timeout: 25000,
      env: { ...process.env, PUBLY_CONFIG: accountConfig },
    });
  const firstAccount = addAccount("Work", "--app-id", privateAppId, "--author", privateAuthor, "--theme", "claude");
  assert.equal(firstAccount.status, 0, firstAccount.stderr);
  const firstReport = JSON.parse(firstAccount.stdout.trim());
  assert.equal(firstReport.schemaVersion, 1);
  assert.equal(firstReport.kind, "account-add");
  assert.equal(firstReport.ok, true);
  assert.equal(firstReport.code, "ACCOUNT_SAVED");
  assert.equal(firstReport.created, true);
  assert.equal(firstReport.isDefault, true);
  assert.equal(firstReport.networkUsed, false);
  assert.equal(firstReport.submitted, false);
  assert.ok(!firstAccount.stdout.includes(privateAppId));
  assert.ok(!firstAccount.stdout.includes(privateAuthor));
  const secondAccount = addAccount("Work", "--theme", "wechat");
  assert.equal(secondAccount.status, 0, secondAccount.stderr);
  assert.equal(JSON.parse(secondAccount.stdout).created, false);
  const storedAccount = JSON.parse(fs.readFileSync(accountConfig, "utf8"));
  assert.deepEqual(storedAccount.accounts, [{
    name: "Work", app_id: privateAppId, author: privateAuthor, theme: "wechat",
  }], "updating only a theme must not erase saved account fields");
  assert.equal(storedAccount.default_account, "Work");
  const invalidAccount = addAccount("  ");
  assert.equal(invalidAccount.status, 1);
  assert.equal(JSON.parse(invalidAccount.stdout).code, "ACCOUNT_NAME_INVALID");
  assert.equal(fs.readFileSync(accountConfig, "utf8"), JSON.stringify(storedAccount, null, 2) + "\n");
  const malformedAccountConfig = path.join(dir, "malformed-account-add.json");
  const secretConfigMarker = "hidden-account-config-token";
  fs.writeFileSync(malformedAccountConfig, '{"api_key":"' + secretConfigMarker + '", invalid}');
  const malformedAccount = spawnSync(process.execPath,
    [entrypoint, "account", "add", "Work", "--json"], {
      encoding: "utf8", timeout: 25000,
      env: { ...process.env, PUBLY_CONFIG: malformedAccountConfig },
    });
  assert.equal(malformedAccount.status, 1);
  const malformedAccountReport = JSON.parse(malformedAccount.stdout);
  assert.equal(malformedAccountReport.kind, "account-add");
  assert.equal(malformedAccountReport.code, "CONFIG_INVALID");
  assert.ok(!malformedAccount.stdout.includes(secretConfigMarker));
  assert.ok(!malformedAccount.stderr.includes(secretConfigMarker));

  // Generated math and SVG images must be removed after the CLI has consumed
  // them; original source assets must stay intact.
  const cleanupDir = path.join(dir, "isolated-render-temp");
  fs.mkdirSync(cleanupDir);
  const cleanupSvg = path.join(dir, "source-cleanup.svg");
  const cleanupNote = path.join(dir, "cleanup-test.md");
  const svgSource = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><circle cx="10" cy="10" r="8"/></svg>';
  fs.writeFileSync(cleanupSvg, svgSource);
  fs.writeFileSync(cleanupNote, "---\ntitle: cleanup\n---\n\nFormula $x^2$ and ![asset](source-cleanup.svg)");
  for (const [command, extra] of [["check", []], ["preview", ["--out", path.join(dir, "cleanup-preview.html")]]]) {
    const result = spawnSync(process.execPath, [entrypoint, command, cleanupNote, ...extra, "--json"], {
      encoding: "utf8", timeout: 40000,
      env: { ...process.env, TMPDIR: cleanupDir, TMP: cleanupDir, TEMP: cleanupDir,
        PUBLY_CONFIG: path.join(dir, "no-such-config.json") },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).ok, true);
    assert.deepEqual(fs.readdirSync(cleanupDir).filter((name) => /^publy-(math|svg)-/.test(name)), []);
    assert.equal(fs.readFileSync(cleanupSvg, "utf8"), svgSource);
  }

  // Agent contract discovery is offline and truthful: don't claim JSON
  // support for operations that still only offer human-oriented output.
  const cli = (...args) => spawnSync(process.execPath, [entrypoint, ...args],
    { encoding: "utf8", timeout: 40000, env: { ...process.env,
      PUBLY_CONFIG: path.join(dir, "no-such-config.json") } });
  const capabilities = cli("capabilities", "--json");
  assert.equal(capabilities.status, 0, capabilities.stderr);
  const contract = JSON.parse(capabilities.stdout);
  assert.equal(contract.schemaVersion, 1);
  assert.equal(contract.destination, "wechat-official-account-drafts");
  assert.equal(contract.noPublicSend, true);
  assert.deepEqual(contract.firstClassEditors, ["Typora", "Obsidian"]);
  assert.ok(contract.commands.some((c) => c.name === "preview" && c.json === true && c.network === false));
  assert.ok(contract.commands.some((c) => c.name === "render" && c.json === true && c.network === false));
  assert.ok(contract.commands.some((c) => c.name === "theme ls" && c.json === true && c.network === false && c.jsonNetwork === false));
  assert.ok(contract.commands.some((c) => c.name === "theme preview" && c.json === true && c.jsonNetwork === false));
  // Every advertised command declares stable prerequisites, usage and an
  // explicit approval boolean; tunnel now offers JSON instead of human-only
  // output, so no remaining command hides behind "human-oriented".
  for (const entry of contract.commands) {
    assert.ok(Array.isArray(entry.prerequisites), entry.name + " must declare prerequisites");
    assert.equal(typeof entry.requiresUserApproval, "boolean", entry.name + " must declare approval");
    assert.ok(entry.usage, entry.name + " must declare usage");
  }
  assert.ok(contract.commands.some((c) => c.name === "tunnel" && c.json === true && c.requiresUserApproval === true));
  assert.ok(contract.commands.some((c) => c.name === "publish" && c.prerequisites.includes("wechat-account")));

  const noTunnel = cli("tunnel", "--json");
  assert.equal(noTunnel.status, 1, noTunnel.stderr);
  const noTunnelBody = JSON.parse(noTunnel.stdout);
  assert.equal(noTunnelBody.kind, "tunnel");
  assert.equal(noTunnelBody.ok, false);
  assert.equal(noTunnelBody.code, "TUNNEL_NOT_CONFIGURED");
  assert.equal(noTunnelBody.networkUsed, false);
  assert.equal(noTunnelBody.submitted, false);

  // A tunnel whose local port is already listening needs no SSH: the
  // structured result must say so instead of claiming network use.
  const listener = net.createServer();
  await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const listeningPort = listener.address().port;
  const tunnelConfig = path.join(dir, "tunnel-config.json");
  fs.writeFileSync(tunnelConfig, JSON.stringify({
    tunnel: { ssh_target: "unused@example.invalid", local_port: listeningPort, remote_port: 8081 },
  }));
  try {
    const up = spawnSync(process.execPath, [entrypoint, "tunnel", "--json"], {
      encoding: "utf8", timeout: 25000, env: { ...process.env, PUBLY_CONFIG: tunnelConfig },
    });
    assert.equal(up.status, 0, up.stderr);
    const upBody = JSON.parse(up.stdout);
    assert.equal(upBody.kind, "tunnel");
    assert.equal(upBody.ok, true);
    assert.equal(upBody.status, "up");
    assert.equal(upBody.localPort, listeningPort);
    assert.equal(upBody.startedByThisCall, false);
    assert.equal(upBody.networkUsed, false);
    assert.equal(upBody.submitted, false);
  } finally {
    listener.close();
  }

  // A failed SSH start is a network attempt: report it truthfully and keep
  // the documented exit code. The PATH shim keeps this offline and portable
  // (POSIX only; Windows has no shell-script shim here).
  if (process.platform !== "win32") {
    const probePort = await new Promise((resolve) => {
      const probe = net.createServer();
      probe.listen(0, "127.0.0.1", () => {
        const port = probe.address().port;
        probe.close(() => resolve(port));
      });
    });
    const shimDir = path.join(dir, "shim-bin");
    fs.mkdirSync(shimDir, { recursive: true });
    const shim = path.join(shimDir, "ssh");
    fs.writeFileSync(shim, "#!/bin/sh\nexit 1\n");
    fs.chmodSync(shim, 0o755);
    const downConfig = path.join(dir, "tunnel-down.json");
    fs.writeFileSync(downConfig, JSON.stringify({
      tunnel: { ssh_target: "unused@example.invalid", local_port: probePort, remote_port: 8081 },
    }));
    const down = spawnSync(process.execPath, [entrypoint, "tunnel", "--json"], {
      encoding: "utf8", timeout: 25000,
      env: { ...process.env, PUBLY_CONFIG: downConfig, PATH: shimDir + path.delimiter + process.env.PATH },
    });
    assert.equal(down.status, 5, down.stderr);
    const downBody = JSON.parse(down.stdout);
    assert.equal(downBody.ok, false);
    assert.equal(downBody.status, "down");
    assert.equal(downBody.code, "TUNNEL_UNREACHABLE");
    assert.equal(downBody.networkUsed, true);
    assert.equal(downBody.submitted, false);
  }

  // Both human and machine theme discovery must be genuinely offline, not
  // merely reporting networkUsed:false while silently fetching a registry.
  const fetchSentinel = path.join(dir, "theme-fetch-was-called");
  const preload = path.join(dir, "reject-theme-fetch.cjs");
  // Satori uses fetch for non-network resources during module initialization.
  // Preserve those operations, but fail if the CLI attempts any HTTP(S) request.
  fs.writeFileSync(preload, [
    'require("node:child_process").spawn = () => { throw new Error("unexpected browser or child process"); };',
    'require("node:module").syncBuiltinESMExports();',
    'const originalFetch = globalThis.fetch;',
    'globalThis.fetch = (...args) => {',
    '  const input = args[0];',
    '  const target = typeof input === "string" ? input : (input?.url ?? String(input));',
    '  if (/^https?:\\/\\//i.test(target)) {',
    '    require("node:fs").writeFileSync(process.env.PUBLY_THEME_FETCH_SENTINEL, "called");',
    '    throw new Error("unexpected HTTP(S) request during offline theme listing");',
    '  }',
    '  return originalFetch(...args);',
    '};',
  ].join("\n"));
  // Machine theme previews must render both sample types without HTTP or a browser.
  for (const [theme, type] of [["medium", "article"], ["naive", "cards"]]) {
    fs.rmSync(fetchSentinel, { force: true });
    const preview = spawnSync(process.execPath, ["--require", preload, entrypoint, "theme", "preview", theme, "--json"], {
      encoding: "utf8", timeout: 40000,
      env: { ...process.env, PUBLY_CONFIG: path.join(dir, "no-such-config.json"), PUBLY_THEME_FETCH_SENTINEL: fetchSentinel },
    });
    assert.equal(preview.status, 0, preview.stderr);
    const result = JSON.parse(preview.stdout);
    assert.equal(result.kind, "theme-preview");
    assert.equal(result.type, type);
    assert.equal(result.networkUsed, false);
    assert.equal(result.submitted, false);
    assert.equal(fs.existsSync(fetchSentinel), false);
    assert.match(fs.readFileSync(result.output, "utf8"), /Content-Security-Policy/);
    if (process.platform !== "win32") assert.equal(fs.statSync(result.output).mode & 0o077, 0);
    fs.rmSync(path.dirname(result.output), { recursive: true, force: true });
  }
  for (const name of ["not-a-theme", "toString", "__proto__"]) {
    const unknown = cli("theme", "preview", name, "--json");
    assert.equal(unknown.status, 2);
    const report = JSON.parse(unknown.stdout);
    assert.equal(report.code, "UNKNOWN_THEME");
    assert.equal(report.networkUsed, false);
  }
  for (const json of [false, true]) {
    fs.rmSync(fetchSentinel, { force: true });
    const listed = spawnSync(process.execPath,
      ["--require", preload, entrypoint, "theme", "ls", ...(json ? ["--json"] : [])], {
        encoding: "utf8", timeout: 25000,
        env: { ...process.env, PUBLY_CONFIG: path.join(dir, "no-such-config.json"),
          PUBLY_THEME_FETCH_SENTINEL: fetchSentinel },
      });
    assert.equal(listed.status, 0, listed.stderr);
    assert.equal(fs.existsSync(fetchSentinel), false,
      "theme ls must not attempt a registry request");
    if (json) {
      const result = JSON.parse(listed.stdout);
      assert.equal(result.kind, "themes");
      assert.equal(result.networkUsed, false);
      assert.equal(result.source, "bundled");
      assert.ok(result.articleThemes.length > 0 && result.cardThemes.length > 0);
    } else {
      assert.ok(listed.stdout.includes("Article themes (built-in):"));
      assert.ok(listed.stdout.includes("Card themes (built-in):"));
    }
  }
  assert.ok(contract.commands.some((c) => c.name === "jobs list" && c.json === true));
  assert.ok(contract.commands.some((c) => c.name === "publish" && c.effect === "create-wechat-draft"));
  const accountMutation = contract.commands.find((c) => c.name === "account add");
  assert.equal(accountMutation.json, true);
  assert.equal(accountMutation.network, false);
  assert.equal(accountMutation.requiresUserApproval, true);
  assert.match(accountMutation.usage, /account add <name> --json/);

  for (const operation of ["jobs cancel", "jobs retry"]) {
    const def = contract.commands.find((c) => c.name === operation);
    assert.equal(def.json, true);
    assert.equal(def.requiresUserApproval, true);
    assert.match(def.usage, /--json$/);
  }

  const sendCommand = contract.commands.find((c) => c.name === "publish");
  assert.equal(sendCommand.requiresUserApproval, true);
  assert.match(sendCommand.usage, /publish <file\.md> --account <name> --json/);
  const checkCommand = contract.commands.find((c) => c.name === "check");
  assert.equal(checkCommand.requiresUserApproval, false);
  assert.equal(checkCommand.usage, "publy check <file.md> --json");

  const agentPreview = cli("preview", goodPath, "--json");
  assert.equal(agentPreview.status, 0, agentPreview.stderr);
  const previewReport = JSON.parse(agentPreview.stdout);
  assert.equal(previewReport.schemaVersion, 1);
  assert.equal(previewReport.kind, "local-preview");
  assert.equal(previewReport.ok, true);
  assert.equal(previewReport.type, "article");
  assert.equal(previewReport.networkUsed, false);
  assert.equal(previewReport.submitted, false);
  assert.ok(fs.existsSync(previewReport.output));
  assert.ok(previewReport.output.endsWith(".html"));
  assert.equal(fs.readFileSync(goodPath, "utf8"), goodSource);
  fs.rmSync(path.dirname(previewReport.output), { recursive: true, force: true });

  const badPreview = cli("preview", path.join(project, "absent.md"), "--json");
  assert.equal(badPreview.status, 2, badPreview.stderr);
  const badReport = JSON.parse(badPreview.stdout);
  assert.equal(badReport.ok, false);
  assert.equal(badReport.code, "INPUT_INVALID");
  assert.equal(badReport.submitted, false);

  // An Agent needs account aliases to choose a destination, never the
  // WeChat App ID or the caller's long-lived API key.
  const aliasesConfig = path.join(dir, "agent-aliases.json");
  const secretKey = "test-secret-must-not-enter-machine-output";
  const appId = "wx-internal-app-id";
  fs.writeFileSync(aliasesConfig, JSON.stringify({
    server: "https://invalid.local", api_key: secretKey,
    default_account: "Work",
    accounts: [{ name: "Work", app_id: appId, theme: "claude" }],
  }));
  const aliases = spawnSync(process.execPath,
    [entrypoint, "account", "list", "--json"],
    { encoding: "utf8", timeout: 25000, env: { ...process.env, PUBLY_CONFIG: aliasesConfig } });
  assert.equal(aliases.status, 0, aliases.stderr);
  const aliasData = JSON.parse(aliases.stdout);
  assert.equal(aliasData.kind, "accounts");
  assert.equal(aliasData.defaultAccount, "Work");
  assert.deepEqual(aliasData.accounts, [{ name: "Work", theme: "claude" }]);
  assert.ok(!aliases.stdout.includes(secretKey));
  assert.ok(!aliases.stdout.includes(appId));

  // Read-only server queries are scriptable even when no credentials have
  // been configured. One JSON object on stdout, no raw URL exception trace.
  for (const [args, kind] of [
    [["jobs", "list", "--json"], "jobs"],
    [["history", "--json"], "history"],
    [["quota", "--json"], "quota"],
    [["publish-result", "test-identity", "--json"], "publish-result"],
  ]) {
    const result = cli(...args);
    assert.equal(result.status, 5, args.join(" ") + " " + result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.schemaVersion, 1);
    assert.equal(report.ok, false);
    assert.equal(report.kind, kind);
    assert.equal(report.code, "SERVER_NOT_CONFIGURED");
    assert.ok(!result.stderr.includes("TypeError:"));
    assert.ok(!result.stderr.includes("ERR_INVALID_URL"));
  }

  // A malformed configuration can contain API secrets in its parser error
  // context. Nothing from the file should reach stdout or stderr.
  const privateConfigToken = "private-agent-config-secret-marker";
  const malformedConfig = path.join(dir, "malformed-agent-config.json");
  fs.writeFileSync(malformedConfig, '{"api_key":"' + privateConfigToken + '", broken}');
  for (const [args, kind] of [
    [["account", "list", "--json"], "accounts"],
    [["jobs", "list", "--json"], "jobs"],
    [["history", "--json"], "history"],
    [["quota", "--json"], "quota"],
    [["publish-result", "some-id", "--json"], "publish-result"],
  ]) {
    const runBadConfig = spawnSync(process.execPath, [entrypoint, ...args], {
      encoding: "utf8", timeout: 25000,
      env: { ...process.env, PUBLY_CONFIG: malformedConfig },
    });
    assert.equal(runBadConfig.status, 1, args.join(" ") + " " + runBadConfig.stderr);
    const report = JSON.parse(runBadConfig.stdout);
    assert.equal(report.schemaVersion, 1);
    assert.equal(report.kind, kind);
    assert.equal(report.code, "CONFIG_INVALID");
    assert.equal(report.ok, false);
    assert.ok(!runBadConfig.stdout.includes(privateConfigToken));
    assert.ok(!runBadConfig.stderr.includes(privateConfigToken));
  }
  const badCfgPublish = spawnSync(process.execPath,
    [entrypoint, "publish", goodPath, "--json"],
    { encoding: "utf8", timeout: 25000,
      env: { ...process.env, PUBLY_CONFIG: malformedConfig } });
  assert.equal(badCfgPublish.status, 1);
  const pubCfgError = JSON.parse(badCfgPublish.stdout);
  assert.equal(pubCfgError.code, "CONFIG_INVALID");
  assert.equal(pubCfgError.submitted, false);
  assert.ok(!badCfgPublish.stdout.includes(privateConfigToken));
  assert.ok(!badCfgPublish.stderr.includes(privateConfigToken));

  for (const [operation, kind] of [
    ["cancel", "job-cancel"],
    ["retry", "job-retry"],
  ]) {
    const invalidJobConfig = spawnSync(process.execPath,
      [entrypoint, "jobs", operation, "fake-job-id", "--json"],
      { encoding: "utf8", timeout: 25000,
        env: { ...process.env, PUBLY_CONFIG: malformedConfig } });
    assert.equal(invalidJobConfig.status, 1);
    const invalidJobResult = JSON.parse(invalidJobConfig.stdout);
    assert.equal(invalidJobResult.kind, kind);
    assert.equal(invalidJobResult.code, "CONFIG_INVALID");
    assert.equal(invalidJobResult.status, "rejected");
    assert.equal(invalidJobResult.jobId, "fake-job-id");
    assert.ok(!invalidJobConfig.stdout.includes(privateConfigToken));
    assert.ok(!invalidJobConfig.stderr.includes(privateConfigToken));
  }

  // Local Markdown preview must still work with damaged global config:
  // it should not require an account or a repair to private credentials.
  const damagedPreview = spawnSync(process.execPath,
    [entrypoint, "preview", goodPath, "--json"],
    { encoding: "utf8", timeout: 25000,
      env: { ...process.env, PUBLY_CONFIG: malformedConfig } });
  assert.equal(damagedPreview.status, 0, damagedPreview.stderr);
  const damagedPreviewReport = JSON.parse(damagedPreview.stdout);
  assert.equal(damagedPreviewReport.networkUsed, false);
  assert.equal(damagedPreviewReport.submitted, false);
  fs.rmSync(path.dirname(damagedPreviewReport.output), { recursive: true, force: true });

  // An invalid endpoint is a configuration error, not an instruction for
  // the Agent to retry an unreachable server.
  const invalidEndpoint = path.join(dir, "invalid-agent-server.json");
  fs.writeFileSync(invalidEndpoint, JSON.stringify({
    server: "file:///private/agent-local-note", api_key: privateConfigToken,
  }));
  const badEndpointQuery = spawnSync(process.execPath,
    [entrypoint, "jobs", "list", "--json"],
    { encoding: "utf8", timeout: 25000,
      env: { ...process.env, PUBLY_CONFIG: invalidEndpoint } });
  assert.equal(badEndpointQuery.status, 1, badEndpointQuery.stderr);
  const badEndpointReport = JSON.parse(badEndpointQuery.stdout);
  assert.equal(badEndpointReport.code, "CONFIG_INVALID");
  assert.ok(!badEndpointQuery.stdout.includes(privateConfigToken));
  assert.ok(!badEndpointQuery.stderr.includes(privateConfigToken));

  const unreachableConfig = path.join(dir, "unreachable-agent-server.json");
  fs.writeFileSync(unreachableConfig, JSON.stringify({
    server: "http://127.0.0.1:9", api_key: privateConfigToken,
  }));
  for (const [operation, kind] of [
    ["cancel", "job-cancel"],
    ["retry", "job-retry"],
  ]) {
    const uncertainJob = spawnSync(process.execPath,
      [entrypoint, "jobs", operation, "fake-job-id", "--json"],
      { encoding: "utf8", timeout: 25000,
        env: { ...process.env, PUBLY_CONFIG: unreachableConfig } });
    assert.equal(uncertainJob.status, 5, uncertainJob.stderr);
    const report = JSON.parse(uncertainJob.stdout);
    assert.equal(report.kind, kind);
    assert.equal(report.ok, false);
    assert.equal(report.status, "unknown", "network outcome may have applied a mutation");
    assert.equal(report.code, "SERVER_UNREACHABLE");
    assert.equal(report.jobId, "fake-job-id");
    assert.ok(!uncertainJob.stdout.includes(privateConfigToken));
  }

  const readUnreachable = spawnSync(process.execPath,
    [entrypoint, "quota", "--json"],
    { encoding: "utf8", timeout: 25000,
      env: { ...process.env, PUBLY_CONFIG: unreachableConfig } });
  assert.equal(readUnreachable.status, 5);
  const unreachableReport = JSON.parse(readUnreachable.stdout);
  assert.equal(unreachableReport.code, "SERVER_UNREACHABLE");
  assert.ok(!readUnreachable.stdout.includes(privateConfigToken));
  assert.ok(!readUnreachable.stderr.includes(privateConfigToken));

  const missingPublishServer = cli("publish", goodPath, "--json");
  assert.equal(missingPublishServer.status, 5, missingPublishServer.stderr);
  const missingServerReport = JSON.parse(missingPublishServer.stdout);
  assert.equal(missingServerReport.ok, false);
  assert.equal(missingServerReport.status, "not_submitted");
  assert.equal(missingServerReport.code, "SERVER_NOT_CONFIGURED");
  assert.equal(missingServerReport.submitted, false);

  // A configured default must never silently select a WeChat draft
  // destination. This test uses a synthetic unreachable endpoint: the
  // command must reject before reading a source or making any HTTP request.
  const explicitAccountConfig = path.join(dir, "explicit-account.json");
  const explicitAccountSecret = "synthetic-account-guard-secret";
  fs.writeFileSync(explicitAccountConfig, JSON.stringify({
    server: "http://127.0.0.1:9", api_key: explicitAccountSecret,
    default_account: "Work", accounts: [{ name: "Work" }],
  }));
  const missingAccount = spawnSync(process.execPath,
    [entrypoint, "publish", goodPath, "--json"], {
      encoding: "utf8", timeout: 25000,
      env: { ...process.env, PUBLY_CONFIG: explicitAccountConfig },
    });
  assert.equal(missingAccount.status, 1, missingAccount.stderr);
  const missingAccountReport = JSON.parse(missingAccount.stdout);
  assert.equal(missingAccountReport.schemaVersion, 1);
  assert.equal(missingAccountReport.kind, "publish-result");
  assert.equal(missingAccountReport.ok, false);
  assert.equal(missingAccountReport.status, "not_submitted");
  assert.equal(missingAccountReport.code, "ACCOUNT_REQUIRED");
  assert.equal(missingAccountReport.submitted, false);
  assert.equal(missingAccountReport.requestId, null);
  assert.ok(!missingAccount.stdout.includes(explicitAccountSecret));
  assert.ok(!missingAccount.stderr.includes(explicitAccountSecret));
  const missingAccountHuman = spawnSync(process.execPath,
    [entrypoint, "publish", goodPath], {
      encoding: "utf8", timeout: 25000,
      env: { ...process.env, PUBLY_CONFIG: explicitAccountConfig },
    });
  assert.equal(missingAccountHuman.status, 1);
  assert.match(missingAccountHuman.stderr, /--account/);
  // Explicitly choosing the account passes this guard; missing input then
  // fails locally before any HTTP request is attempted.
  const explicitAccountMissingSource = spawnSync(process.execPath,
    [entrypoint, "publish", path.join(project, "missing.md"), "--account", "Work", "--json"], {
      encoding: "utf8", timeout: 25000,
      env: { ...process.env, PUBLY_CONFIG: explicitAccountConfig },
    });
  assert.equal(explicitAccountMissingSource.status, 2);
  assert.equal(JSON.parse(explicitAccountMissingSource.stdout).code, "INPUT_INVALID");

  // JSON render writes a private HTML artifact without embedding private
  // source content in stdout, and explicitly reports unresolved media refs.
  const jsonRender = cli("render", goodPath, "--json");
  assert.equal(jsonRender.status, 0, jsonRender.stderr);
  const rendered = JSON.parse(jsonRender.stdout);
  assert.equal(rendered.schemaVersion, 1);
  assert.equal(rendered.kind, "html-render");
  assert.equal(rendered.ok, true);
  assert.equal(rendered.attachmentCount, 1);
  assert.equal(rendered.containsAttachmentReferences, true);
  assert.equal(rendered.networkUsed, false);
  assert.equal(rendered.submitted, false);
  assert.ok(rendered.output.endsWith(".html"));
  assert.ok(fs.readFileSync(rendered.output, "utf8").includes("attachment://"));
  assert.equal(fs.readFileSync(goodPath, "utf8"), goodSource);
  if (process.platform !== "win32") {
    assert.equal(fs.statSync(rendered.output).mode & 0o077, 0);
    assert.equal(fs.statSync(path.dirname(rendered.output)).mode & 0o077, 0);
  }
  fs.rmSync(path.dirname(rendered.output), { recursive: true, force: true });

  const explicitRender = path.join(dir, "agent-render.html");
  const renderAtPath = cli("render", goodPath, "--json", "--out", explicitRender);
  assert.equal(renderAtPath.status, 0, renderAtPath.stderr);
  assert.equal(JSON.parse(renderAtPath.stdout).output, explicitRender);
  const repeatRender = cli("render", goodPath, "--json", "--out", explicitRender);
  assert.equal(repeatRender.status, 2);
  assert.equal(JSON.parse(repeatRender.stdout).code, "OUTPUT_INVALID");
  const replaceRender = cli("render", goodPath, "--json", "--out", explicitRender, "--force");
  assert.equal(replaceRender.status, 0, replaceRender.stderr);
  const renderSourceGuard = cli("render", goodPath, "--json", "--out", goodPath, "--force");
  assert.equal(renderSourceGuard.status, 2);
  assert.equal(JSON.parse(renderSourceGuard.stdout).code, "OUTPUT_INVALID");
  assert.equal(fs.readFileSync(goodPath, "utf8"), goodSource);

  const renderMissing = cli("render", path.join(project, "not-here.md"), "--json");
  assert.equal(renderMissing.status, 2);
  assert.equal(JSON.parse(renderMissing.stdout).code, "INPUT_INVALID");

  // Agents can enumerate installed themes even when disconnected from the
  // internet; the JSON variant must NOT consult a remote theme registry.
  const themeQuery = cli("theme", "ls", "--json");
  assert.equal(themeQuery.status, 0, themeQuery.stderr);
  const themeManifest = JSON.parse(themeQuery.stdout);
  assert.equal(themeManifest.schemaVersion, 1);
  assert.equal(themeManifest.kind, "themes");
  assert.equal(themeManifest.source, "bundled");
  assert.equal(themeManifest.networkUsed, false);
  assert.ok(themeManifest.articleThemes.length > 0);
  assert.ok(themeManifest.cardThemes.length > 0);
  assert.ok(!themeQuery.stdout.includes("Registry:"));

  // CLI browser preview must resolve local images without any remote server,
  // leaving both the source and the original asset file untouched.
  const previewPath = path.join(dir, "offline-preview.html");
  const preview = spawnSync(process.execPath,
    [entrypoint, "preview", goodPath, "--no-open", "--out", previewPath],
    { encoding: "utf8", timeout: 25000, env: { ...process.env, PUBLY_CONFIG: path.join(dir, "no-such-config.json") } });
  assert.equal(preview.status, 0, preview.stderr);
  const previewHtml = fs.readFileSync(previewPath, "utf8");
  const embeddedPrefix = "data:image/png;base64,";
  assert.ok(previewHtml.includes(embeddedPrefix), "local image must be embedded");
  assert.ok(!previewHtml.includes("attachment://photo.png"), "local attachment reference must be replaced");
  assert.ok(previewHtml.includes("Content-Security-Policy"), "preview must enforce a no-network CSP");
  assert.ok(previewHtml.includes("default-src 'none'"), "preview must deny unlisted resource loads");
  assert.ok(previewHtml.includes("img-src data:"), "embedded local images must remain visible");
  assert.ok(previewHtml.includes("connect-src 'none'"), "preview must not connect to a server");
  const encoded = previewHtml.slice(previewHtml.indexOf(embeddedPrefix) + embeddedPrefix.length).split('"')[0];
  const embeddedBytes = Buffer.from(encoded, "base64");
  assert.deepEqual(embeddedBytes, tinyPng, "preview must embed the exact PNG bytes without mutation");
  assert.equal(fs.readFileSync(goodPath, "utf8"), goodSource, "preview must not alter source");


  // Typora can persist Chinese names with legacy %u escapes and local image
  // roots. No Typora plugin/process or vault copying is needed.
  const typoraRoot = path.join(project, "Typora project");
  const typoraMedia = path.join(typoraRoot, "blog", "assets");
  fs.mkdirSync(typoraMedia, { recursive: true });
  const typoraPhoto = path.join(typoraMedia, "封面 图片.png");
  fs.writeFileSync(typoraPhoto, tinyPng);
  const typoraFile = path.join(project, "这是 Typora 原稿.md");
  const typoraSource = [
    "---",
    "title: 这是 Typora 的原稿",
    "typora-root-url: " + JSON.stringify(typoraRoot.split(path.sep).join("/")),
    "typora-copy-images-to: assets/pasted",
    "cover: /blog/assets/%u5C01%u9762%20%u56FE%u7247.png",
    "---",
    "",
    "![正文图](/blog/assets/%u5C01%u9762%20%u56FE%u7247.png)",
  ].join("\n");
  fs.writeFileSync(typoraFile, typoraSource);
  const typoraCheck = run(typoraFile);
  assert.equal(typoraCheck.code, 0);
  assert.equal(typoraCheck.report.ok, true);
  assert.equal(typoraCheck.report.attachmentCount, 1);
  assert.equal(typoraCheck.report.title, "这是 Typora 的原稿");
  const typoraPreviewPath = path.join(dir, "Typora 预览.html");
  const typoraPreview = spawnSync(process.execPath,
    [entrypoint, "preview", typoraFile, "--no-open", "--out", typoraPreviewPath],
    { encoding: "utf8", timeout: 25000, env: { ...process.env, PUBLY_CONFIG: path.join(dir, "no-such-config.json") } });
  assert.equal(typoraPreview.status, 0, typoraPreview.stderr);
  assert.ok(fs.readFileSync(typoraPreviewPath, "utf8").includes("data:image/png;base64,"));
  assert.equal(fs.readFileSync(typoraFile, "utf8"), typoraSource, "Typora source must remain exactly unchanged");

  // An encoded slash/backslash must not be promoted into a directory
  // separator and silently select an existing, unrelated cover. The normal
  // %uXXXX and %25uXXXX Chinese filename forms must keep working.
  const doubleEscapedUnicode = path.join(project, "Typora double-escaped Unicode.md");
  const doubleEscapedSource = [
    "---",
    "typora-root-url: " + JSON.stringify(typoraRoot.split(path.sep).join("/")),
    "cover: /blog/assets/%25u5C01%25u9762%20%25u56FE%25u7247.png",
    "---", "", "# Local review",
  ].join("\n");
  fs.writeFileSync(doubleEscapedUnicode, doubleEscapedSource);
  const doubleEscapedCheck = run(doubleEscapedUnicode);
  assert.equal(doubleEscapedCheck.code, 0, JSON.stringify(doubleEscapedCheck.report));
  assert.equal(doubleEscapedCheck.report.ok, true);
  assert.equal(fs.readFileSync(doubleEscapedUnicode, "utf8"), doubleEscapedSource);

  for (const encodedSeparator of ["%2F", "%5C", "%u002F", "%u005C", "%25u002F", "%25u005C"]) {
    const unsafeFile = path.join(project, "Typora encoded separator " + encodedSeparator + ".md");
    const unsafeSource = [
      "---",
      "typora-root-url: " + JSON.stringify(typoraRoot.split(path.sep).join("/")),
      "cover: /blog" + encodedSeparator + "assets" + encodedSeparator + "%u5C01%u9762%20%u56FE%u7247.png",
      "---", "", "# Local review",
    ].join("\n");
    fs.writeFileSync(unsafeFile, unsafeSource);
    const unsafeCheck = run(unsafeFile);
    assert.equal(unsafeCheck.code, 4, encodedSeparator + ": " + JSON.stringify(unsafeCheck.report));
    assert.equal(unsafeCheck.report.ok, false);
    assert.equal(unsafeCheck.report.attachmentCount, 0);
    assert.ok(unsafeCheck.report.problems.some((p) => p.startsWith("Cover not found:")),
      "encoded separator must block the draft preflight: " + encodedSeparator);
    assert.equal(fs.readFileSync(unsafeFile, "utf8"), unsafeSource);
  }

  // Typora can also save absolute file:/// image links, including Chinese
  // paths. They must resolve to the exact same local bytes, without exporting
  // a clickable file:// link into the WeChat HTML.
  const fileUriArticle = path.join(project, "Typora file URI.md");
  const localFileUrl = pathToFileURL(typoraPhoto).href;
  const fileUriRaw = "---\ncover: " + JSON.stringify(localFileUrl) +
    "\n---\n\n![absolute](" + localFileUrl + ")";
  fs.writeFileSync(fileUriArticle, fileUriRaw);
  const fileUriCheck = run(fileUriArticle);
  assert.equal(fileUriCheck.code, 0);
  assert.equal(fileUriCheck.report.attachmentCount, 1);
  const fileUriOut = path.join(dir, "file-uri-review.html");
  const fileUriPreview = spawnSync(process.execPath,
    [entrypoint, "preview", fileUriArticle, "--no-open", "--out", fileUriOut],
    { encoding: "utf8", timeout: 25000 });
  assert.equal(fileUriPreview.status, 0, fileUriPreview.stderr);
  const fileUriHtml = fs.readFileSync(fileUriOut, "utf8");
  assert.ok(fileUriHtml.includes("data:image/png;base64,"));
  assert.ok(!fileUriHtml.includes("file:///"));
  assert.equal(fs.readFileSync(fileUriArticle, "utf8"), fileUriRaw);

  // Customer-specified output must never clobber existing HTML or the .md.
  const overwriteRefused = spawnSync(process.execPath,
    [entrypoint, "preview", typoraFile, "--no-open", "--out", typoraPreviewPath],
    { encoding: "utf8", timeout: 25000 });
  assert.equal(overwriteRefused.status, 2, overwriteRefused.stderr);
  assert.match(overwriteRefused.stderr, /already exists/);
  const overwriteAllowed = spawnSync(process.execPath,
    [entrypoint, "preview", typoraFile, "--no-open", "--force", "--out", typoraPreviewPath],
    { encoding: "utf8", timeout: 25000 });
  assert.equal(overwriteAllowed.status, 0, overwriteAllowed.stderr);
  const sourceAsOutput = spawnSync(process.execPath,
    [entrypoint, "preview", typoraFile, "--no-open", "--out", typoraFile, "--force"],
    { encoding: "utf8", timeout: 25000 });
  assert.equal(sourceAsOutput.status, 2);
  assert.equal(fs.readFileSync(typoraFile, "utf8"), typoraSource);
  if (process.platform !== "win32") {
    assert.equal(fs.statSync(typoraPreviewPath).mode & 0o077, 0, "local image preview is private");
  }

  // The raw HTML export path must uphold the same "never alter the
  // original Typora file" guarantee as the HTML preview.
  const renderOut = path.join(dir, "rendered.html");
  const renderWith = (...args) => spawnSync(process.execPath,
    [entrypoint, "render", typoraFile, "--out", ...args],
    { encoding: "utf8", timeout: 25000 });
  const firstRender = renderWith(renderOut);
  assert.equal(firstRender.status, 0, firstRender.stderr);
  assert.ok(fs.readFileSync(renderOut, "utf8").includes("attachment://"));
  assert.equal(renderWith(renderOut).status, 2, "existing exported HTML needs explicit confirmation");
  assert.equal(renderWith(renderOut, "--force").status, 0);
  assert.equal(renderWith(typoraFile, "--force").status, 2, "raw rendering cannot overwrite .md");
  assert.equal(fs.readFileSync(typoraFile, "utf8"), typoraSource);

  // Default previews are generated into isolated random temp folders, not a
  // guessable shared timestamp path. --no-open is safe for automated review.
  const ephemeral = spawnSync(process.execPath, [entrypoint, "preview", typoraFile, "--no-open"],
    { encoding: "utf8", timeout: 25000 });
  assert.equal(ephemeral.status, 0, ephemeral.stderr);
  const previewLine = ephemeral.stderr.split("\n").find((line) => line.startsWith("preview → "));
  assert.ok(previewLine, "preview path should be reported");
  const tempPreview = previewLine.slice("preview → ".length).trim();
  assert.ok(fs.existsSync(tempPreview));
  assert.ok(path.basename(tempPreview) === "index.html");
  assert.ok(path.basename(path.dirname(tempPreview)).startsWith("publy-preview-"));
  if (process.platform !== "win32") {
    assert.equal(fs.statSync(tempPreview).mode & 0o077, 0);
    assert.equal(fs.statSync(path.dirname(tempPreview)).mode & 0o077, 0);
  }
  fs.rmSync(path.dirname(tempPreview), { recursive: true, force: true });

  const missingPath = path.join(project, "broken.md");
  fs.writeFileSync(missingPath, "# Broken\n\n![photo](missing/other.jpg)");
  const missing = run(missingPath);
  assert.equal(missing.code, 4);
  assert.equal(missing.report.ok, false);
  assert.ok(missing.report.problems.some((p) => p.includes("missing/other.jpg")));

  // A user must never receive a WeChat draft with silently dropped media.
  // A deliberately unreachable local endpoint makes any accidental submit
  // fail differently, without calling an external service in this smoke.
  const fakeConfig = path.join(dir, "fake-publish-config.json");
  fs.writeFileSync(fakeConfig, JSON.stringify({
    server: "http://127.0.0.1:9", api_key: "fixture-key",
    default_account: "fixture", accounts: [{ name: "fixture" }],
  }));
  const publishWith = (source) => spawnSync(process.execPath,
    [entrypoint, "publish", source, "--account", "fixture"],
    { encoding: "utf8", timeout: 25000, env: { ...process.env, PUBLY_CONFIG: fakeConfig } });
  const blocked = publishWith(missingPath);
  assert.equal(blocked.status, 4, blocked.stderr);
  assert.match(blocked.stderr, /draft NOT sent/);
  assert.match(blocked.stderr, /Image not found:/);
  assert.doesNotMatch(blocked.stderr, /outcome UNKNOWN|publish failed \(/);
  const badCover = path.join(project, "missing-cover.md");
  fs.writeFileSync(badCover, "---\ncover: assets/absent.png\n---\n\n# Missing cover\n\n![valid](assets/photo.png)");
  const blockedCover = publishWith(badCover);
  assert.equal(blockedCover.status, 4, blockedCover.stderr);
  assert.match(blockedCover.stderr, /Cover not found/);

  const noCoverArticle = path.join(project, "no-cover.md");
  fs.writeFileSync(noCoverArticle, "# Text only\n\nNo image and no cover");
  const blockedNoCover = publishWith(noCoverArticle);
  assert.equal(blockedNoCover.status, 4, blockedNoCover.stderr);
  assert.match(blockedNoCover.stderr, /Missing cover:/);
  const noCoverReview = cli("preview", noCoverArticle, "--json");
  assert.equal(noCoverReview.status, 4, noCoverReview.stderr);
  const noCoverJson = JSON.parse(noCoverReview.stdout);
  assert.equal(noCoverJson.ok, false);
  assert.equal(noCoverJson.submitted, false);
  assert.ok(noCoverJson.problems.some((p) => p.startsWith("Missing cover:")));
  fs.rmSync(path.dirname(noCoverJson.output), { recursive: true, force: true });

  const emptyImagePost = path.join(project, "empty-image-post.md");
  fs.writeFileSync(emptyImagePost, "---\ntype: image\n---\n\nJust some words");
  const blockedImagePost = publishWith(emptyImagePost);
  assert.equal(blockedImagePost.status, 4, blockedImagePost.stderr);
  assert.match(blockedImagePost.stderr, /No local images found/);

  // Local previews may contain unresolved media while the author fixes the
  // note. They must call that out in the rendered page, not only on stderr.
  const brokenPreviewPath = path.join(dir, "broken-preview.html");
  const brokenPreview = spawnSync(process.execPath,
    [entrypoint, "preview", missingPath, "--no-open", "--out", brokenPreviewPath],
    { encoding: "utf8", timeout: 25000, env: { ...process.env, PUBLY_CONFIG: fakeConfig } });
  assert.equal(brokenPreview.status, 0, brokenPreview.stderr);
  const brokenHtml = fs.readFileSync(brokenPreviewPath, "utf8");
  assert.match(brokenHtml, /Missing draft media/);
  assert.ok(brokenHtml.includes("missing/other.jpg"), "preview should list the missing image path");
  assert.match(brokenHtml, /Preview only, not submitted/);

  const blockedJson = spawnSync(process.execPath,
    [entrypoint, "publish", missingPath, "--json", "--account", "fixture"],
    { encoding: "utf8", timeout: 25000, env: { ...process.env, PUBLY_CONFIG: fakeConfig } });
  assert.equal(blockedJson.status, 4, blockedJson.stderr);
  const mediaFailure = JSON.parse(blockedJson.stdout);
  assert.equal(mediaFailure.kind, "publish-result");
  assert.equal(mediaFailure.status, "not_submitted");
  assert.equal(mediaFailure.code, "MEDIA_NOT_READY");
  assert.equal(mediaFailure.submitted, false);
  assert.ok(mediaFailure.problems.some((p) => p.includes("missing/other.jpg")));

  const unknownJson = spawnSync(process.execPath,
    [entrypoint, "publish", goodPath, "--json", "--account", "fixture"],
    { encoding: "utf8", timeout: 25000, env: { ...process.env, PUBLY_CONFIG: fakeConfig } });
  assert.equal(unknownJson.status, 5, unknownJson.stderr);
  const uncertain = JSON.parse(unknownJson.stdout);
  assert.equal(uncertain.kind, "publish-result");
  assert.equal(uncertain.status, "unknown");
  assert.equal(uncertain.submitted, null);
  assert.match(uncertain.requestId, /^[a-f0-9]{32}$/);
  assert.ok(!uncertain.problems?.length);
  
  // A real loopback HTTP stub catches protocol errors that a missing port
  // cannot: malformed 200 JSON, explicit 400 denial, and a 500 response.
  // None may leak the server response body or lose requestId on uncertainty.
  const responseServerScript = path.join(dir, "agent-response-stub.mjs");
  const responsePortFile = path.join(dir, "agent-response-port.txt");
  const responseCountFile = path.join(dir, "agent-response-count.txt");
  fs.writeFileSync(responseCountFile, "");
  const privateServerMarker = "remote-secret-never-log";
  fs.writeFileSync(responseServerScript, `
import fs from "node:fs";
import http from "node:http";
const server = http.createServer((_req, res) => {
  const key = _req.headers["x-api-key"];
  if (_req.method === "POST") fs.appendFileSync(process.argv[3], String(key) + "\\n");
  res.setHeader("Content-Type", "application/json");
  if (_req.url.startsWith("/v1/publish-result/")) {
    if (key === "confirmed-no-media") {
      res.end(JSON.stringify({ status: "confirmed", ok: true, mediaId: null, secret: "remote-secret-never-log" })); return;
    }
    if (key === "unknown-override") {
      res.end(JSON.stringify({ status: "unknown", ok: true, schemaVersion: 999, secret: "remote-secret-never-log" })); return;
    }
    if (key === "confirmed-valid") {
      res.end(JSON.stringify({ status: "confirmed", mediaId: "SYNTHETIC_MEDIA_1", account: "fixture", title: "local test" })); return;
    }
  }
  if (key === "empty-success") { res.writeHead(200); res.end("{}"); return; }
  if (key === "invalid-media") { res.writeHead(200); res.end('{"mediaId":123}'); return; }
  if (key === "invalid-job") { res.writeHead(200); res.end('{"jobId":{"id":"bad"}}'); return; }
  if (key === "bad-response") {
    res.writeHead(200); res.end('{"mediaId":'); return;
  }
  if (key === "wechat-rejection") {
    res.writeHead(502); res.end(JSON.stringify({ code: "WECHAT_40001" })); return;
  }
  if (key === "unknown-claim") {
    res.writeHead(409); res.end(JSON.stringify({ code: "DRAFT_OUTCOME_UNKNOWN" })); return;
  }
  if (key === "denied-response") {
    res.writeHead(400); res.end(JSON.stringify({
      code: "BAD_ARGUMENT", message: "${privateServerMarker}",
    })); return;
  }
  res.writeHead(500); res.end(JSON.stringify({
    code: "UPSTREAM_FAILED", message: "${privateServerMarker}",
  }));
});
server.listen(0, "127.0.0.1", () => {
  fs.writeFileSync(process.argv[2], String(server.address().port));
});
`);
  const responseServer = spawn(process.execPath,
    [responseServerScript, responsePortFile, responseCountFile],
    { stdio: "ignore", windowsHide: true });
  try {
    const clock = new Int32Array(new SharedArrayBuffer(4));
    for (let attempt = 0; attempt < 100 && !fs.existsSync(responsePortFile); attempt++) {
      Atomics.wait(clock, 0, 0, 50);
    }
    assert.ok(fs.existsSync(responsePortFile), "local protocol mock must start");
    const responseConfig = path.join(dir, "response-server-config.json");
    const responsePort = fs.readFileSync(responsePortFile, "utf8").trim();
    fs.writeFileSync(responseConfig, JSON.stringify({
      server: "http://127.0.0.1:" + responsePort,
      api_key: "bad-response", default_account: "fixture",
      accounts: [{ name: "fixture" }],
    }));
    for (const [key, expectedStatus, expectedCode] of [
      ["bad-response", "unknown", "NETWORK_OUTCOME_UNKNOWN"],
      ["empty-success", "unknown", "NETWORK_OUTCOME_UNKNOWN"],
      ["invalid-media", "unknown", "NETWORK_OUTCOME_UNKNOWN"],
      ["invalid-job", "unknown", "NETWORK_OUTCOME_UNKNOWN"],
      ["denied-response", "rejected", "BAD_ARGUMENT"],
      ["unknown-claim", "unknown", "DRAFT_OUTCOME_UNKNOWN"],
      ["wechat-rejection", "rejected", "WECHAT_40001"],
      ["failed-response", "unknown", "UPSTREAM_FAILED"],
    ]) {
      const runReply = spawnSync(process.execPath,
        [entrypoint, "publish", goodPath, "--json", "--account", "fixture",
          "--api-key", key],
        { encoding: "utf8", timeout: 25000,
          env: { ...process.env, PUBLY_CONFIG: responseConfig } });
      assert.equal(runReply.status, 5, key + " " + runReply.stderr);
      const report = JSON.parse(runReply.stdout);
      assert.equal(report.kind, "publish-result");
      assert.equal(report.status, expectedStatus);
      assert.equal(report.code, expectedCode);
      assert.match(report.requestId, /^[a-f0-9]{32}$/);
      assert.ok(!runReply.stdout.includes(privateServerMarker));
      assert.ok(!runReply.stderr.includes(privateServerMarker));
      assert.ok(!runReply.stderr.includes("SyntaxError:"));
    }

    // A working loopback listener stands in for the SSH tunnel: no SSH process
    // or remote service is involved. One ambiguous POST must stay one POST.
    const tunnelConfig = path.join(dir, "response-server-with-tunnel.json");
    fs.writeFileSync(tunnelConfig, JSON.stringify({
      server: "http://127.0.0.1:" + responsePort,
      api_key: "bad-response", default_account: "fixture",
      accounts: [{ name: "fixture" }],
      tunnel: { ssh_target: "unused-local-test", local_port: Number(responsePort),
        remote_port: 8081, server: "http://127.0.0.1:" + responsePort },
    }));
    const postCount = () => fs.readFileSync(responseCountFile, "utf8")
      .split("\n").filter((key) => key === "bad-response").length;
    const beforeTunnel = postCount();
    const ambiguousTunnel = spawnSync(process.execPath,
      [entrypoint, "publish", goodPath, "--json", "--account", "fixture"],
      { encoding: "utf8", timeout: 25000,
        env: { ...process.env, PUBLY_CONFIG: tunnelConfig } });
    assert.equal(ambiguousTunnel.status, 5, ambiguousTunnel.stderr);
    assert.equal(JSON.parse(ambiguousTunnel.stdout).status, "unknown");
    assert.equal(postCount() - beforeTunnel, 1,
      "an ambiguous draft response must not be replayed through a tunnel");

    // A claimed confirmation without mediaId is unknown; a server response
    // cannot override our agent JSON contract or leak unrelated fields.
    for (const [key, expectedStatus, expectedOk, expectedExit] of [
      ["confirmed-no-media", "unknown", false, 4],
      ["unknown-override", "unknown", false, 4],
      ["confirmed-valid", "confirmed", true, 0],
    ]) {
      const queried = spawnSync(process.execPath,
        [entrypoint, "publish-result", "synthetic-key", "--json", "--api-key", key],
        { encoding: "utf8", timeout: 25000,
          env: { ...process.env, PUBLY_CONFIG: responseConfig } });
      assert.equal(queried.status, expectedExit, key + " " + queried.stderr);
      const report = JSON.parse(queried.stdout);
      assert.equal(report.schemaVersion, 1);
      assert.equal(report.kind, "publish-result");
      assert.equal(report.ok, expectedOk);
      assert.equal(report.status, expectedStatus);
      assert.ok(!queried.stdout.includes(privateServerMarker));
      assert.ok(!queried.stderr.includes(privateServerMarker));
      assert.ok(!("secret" in report));
    }
  } finally {
    responseServer.kill();
  }

  // The local cover is valid, but external body images still must NOT
  // silently enter an incomplete WeChat draft. Query tokens are private.
  const remoteOnly = path.join(project, "external-body-image.md");
  const privateToken = "synthetic-secret-in-url";
  fs.writeFileSync(remoteOnly,
    "---\ncover: assets/photo.png\n---\n\n![External](https://example.test/photo.png?token=" + privateToken + ")");
  const remoteResult = run(remoteOnly);
  assert.equal(remoteResult.code, 4);
  assert.ok(remoteResult.report.problems.some((w) => w.includes("Remote image not uploaded")));
  assert.ok(!JSON.stringify(remoteResult.report).includes(privateToken));
  const blockedRemote = publishWith(remoteOnly);
  assert.equal(blockedRemote.status, 4, blockedRemote.stderr);
  assert.match(blockedRemote.stderr, /Remote image not uploaded/);
  assert.ok(!blockedRemote.stderr.includes(privateToken), "credential URL must not appear in diagnostics");

  const cardsPath = path.join(project, "cards.md");
  fs.writeFileSync(cardsPath,
    "---\nmode: cards\ncaption: synthetic test\n---\n\n## cover\nTitle\n\n## point\nDetail\n\n## ending\nThanks");
  const cards = run(cardsPath);
  assert.equal(cards.code, 0);
  assert.equal(cards.report.type, "image_post");
  assert.equal(cards.report.cardCount, 3);
  assert.equal(cards.report.attachmentCount, 3, "preflight must verify real PNG cards");
  assert.equal(cards.report.ok, true);

  // The image-post preview must show the same rasterized PNG cards as
  // publish, never ordinary Markdown/HTML pretending to be card output.
  const cardAgentOut = path.join(dir, "agent-cards.html");
  const cardAgentPreview = cli("preview", cardsPath, "--json", "--out", cardAgentOut);
  assert.equal(cardAgentPreview.status, 0, cardAgentPreview.stderr);
  const cardAgent = JSON.parse(cardAgentPreview.stdout);
  assert.equal(cardAgent.kind, "local-preview");
  assert.equal(cardAgent.type, "image_post");
  assert.equal(cardAgent.mode, "cards");
  assert.equal(cardAgent.submitted, false);
  assert.ok(fs.readFileSync(cardAgent.output, "utf8").includes("data:image/png;base64,"));

  const cardsOut = path.join(dir, "card-review.html");
  const cardPreview = spawnSync(process.execPath,
    [entrypoint, "preview", cardsPath, "--no-open", "--out", cardsOut],
    { encoding: "utf8", timeout: 40000,
      env: { ...process.env, PUBLY_CONFIG: path.join(dir, "no-such-config.json") } });
  assert.equal(cardPreview.status, 0, cardPreview.stderr);
  const cardsHtml = fs.readFileSync(cardsOut, "utf8");
  assert.match(cardsHtml, /WeChat image post card preview/);
  assert.equal((cardsHtml.match(/data:image\/png;base64,/g) ?? []).length, 3);
  assert.ok(cardsHtml.includes("synthetic test"), "preview must show image-post caption");
  assert.ok(cardsHtml.includes("Preview only, not submitted"));
  assert.ok(cardsHtml.includes("Content-Security-Policy"));
  assert.equal(fs.readFileSync(cardsPath, "utf8").includes("## cover"), true);

  const invalidCards = path.join(project, "invalid-cards.md");
  fs.writeFileSync(invalidCards,
    "---\nmode: cards\ncaption: invalid deck\n---\n\n## cover\nFirst only\n\n## ending\nSecond");
  const invalidCheck = run(invalidCards);
  assert.equal(invalidCheck.code, 4, "invalid card deck must fail preflight");
  assert.equal(invalidCheck.report.ok, false);
  assert.ok(invalidCheck.report.problems.some((problem) => problem.includes("3")));
  const invalidOut = path.join(dir, "invalid-card-preview.html");
  const invalidPreview = spawnSync(process.execPath,
    [entrypoint, "preview", invalidCards, "--no-open", "--out", invalidOut],
    { encoding: "utf8", timeout: 40000 });
  assert.equal(invalidPreview.status, 0, invalidPreview.stderr);
  const invalidHtml = fs.readFileSync(invalidOut, "utf8");
  assert.match(invalidHtml, /Missing draft media/);
  assert.match(invalidHtml, /图片数量须为 3/);

  // Do not leak private YAML values or parser internals into an agent JSON
  // preflight response; malformed sources are safely recoverable errors.
  const secret = "synthetic-secret-marker-do-not-print";
  const corrupt = path.join(project, "malformed.md");
  fs.writeFileSync(corrupt, "---\nprivate_key: " + secret + "\nunsupported: [broken\n---\n# hi");
  const corruptPublish = spawnSync(process.execPath,
    [entrypoint, "publish", corrupt, "--json", "--account", "fixture"],
    { encoding: "utf8", timeout: 25000, env: { ...process.env, PUBLY_CONFIG: fakeConfig } });
  assert.equal(corruptPublish.status, 3, corruptPublish.stderr);
  const corruptResult = JSON.parse(corruptPublish.stdout);
  assert.equal(corruptResult.code, "RENDER_FAILED");
  assert.equal(corruptResult.submitted, false);
  assert.ok(!corruptPublish.stderr.includes(secret), "private frontmatter should not leak to stderr");
  assert.ok(!corruptPublish.stdout.includes(secret), "private frontmatter should not leak to JSON");
  const corruptPreviewRun = cli("preview", corrupt, "--json");
  assert.equal(corruptPreviewRun.status, 3);
  const corruptPreviewReport = JSON.parse(corruptPreviewRun.stdout);
  assert.equal(corruptPreviewReport.code, "RENDER_FAILED");
  assert.equal(corruptPreviewReport.submitted, false);
  assert.ok(!corruptPreviewRun.stdout.includes(secret));
  assert.ok(!corruptPreviewRun.stderr.includes(secret));

  const malformed = run(corrupt);
  assert.equal(malformed.code, 3);
  assert.equal(malformed.report.ok, false);
  assert.ok(malformed.report.problems.some((p) => p.includes("Cannot inspect")));
  assert.ok(!JSON.stringify(malformed.report).includes(secret));

  const wrong = path.join(project, "not-markdown.txt");
  fs.writeFileSync(wrong, "plain text");
  assert.equal(run(wrong).code, 2);
  assert.equal(run(path.join(project, "absent.md")).code, 2);
  console.log("PASS — editor-neutral local preflight, JSON, assets, cards, non-mutating source and error exits");
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
