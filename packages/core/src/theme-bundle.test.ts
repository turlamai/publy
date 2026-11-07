import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { installThemeBundle, listInstalledThemes, readInstalledTheme, removeInstalledTheme, themeSignaturePayload, validateThemeBundle, type ThemeBundle } from "./theme-bundle.js";
function make(css: string, changes: Record<string, unknown> = {}): string {
  return JSON.stringify({ format: "publy-theme-v1", id: "sample", version: "1.0.0", name: "Sample", license: "MIT", css, cssSha256: crypto.createHash("sha256").update(css).digest("hex"), ...changes });
}
test("content-only bundles accept scoped styles and reject active or malformed CSS", () => {
  assert.equal(validateThemeBundle(make("#publy p { color: #123; margin: 1px 2px; } ")).id, "sample");
  for (const css of ["body { color: red }", "#publy p { background: url(https://evil.test/x) }", "@import url(x);", "#publy p { color: red; } </style><script>x</script>", "#publy p { color: r\\65d }", "#publy p { color: expression(x) }", "#publy p { color: red; broken }", "#publy p, body { color: red }"]) {
    assert.throws(() => validateThemeBundle(make(css)), Error, css);
  }
  assert.throws(() => validateThemeBundle(make("#publy p {color:red}", { cssSha256: "0".repeat(64) })), /THEME_CSS_HASH_MISMATCH/);
  assert.throws(() => validateThemeBundle(make("#publy p {background: url(https://evil.test/x)}")), /THEME_UNSAFE_CSS/);
  assert.throws(() => validateThemeBundle(make("#publy p {color:red}", { id: "../escape" })));
  assert.throws(() => validateThemeBundle(make("#publy p {color:red}", { script: "malicious" })));
});
test("installation verifies each read, refuses replacement and removes only selected bundle", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-theme-bundle-test-"));
  const previous = process.env.PUBLY_THEME_DIR; process.env.PUBLY_THEME_DIR = dir;
  try {
    const source = make("#publy p {color:red}");
    assert.equal(installThemeBundle(source, "add").id, "sample");
    assert.throws(() => installThemeBundle(source, "add"));
    assert.equal(listInstalledThemes().length, 1);
    assert.equal(readInstalledTheme("sample").version, "1.0.0");
    assert.equal(installThemeBundle(make("#publy p {color:blue}", { version: "1.0.1" }), "update").version, "1.0.1");
    fs.writeFileSync(path.join(dir, "sample.json"), source.replace("color:red", "color:blue"));
    assert.throws(() => readInstalledTheme("sample"));
    fs.writeFileSync(path.join(dir, "sample.json"), source);
    removeInstalledTheme("sample"); assert.deepEqual(listInstalledThemes(), []);
    assert.deepEqual(fs.readdirSync(dir), []);
  } finally { if (previous === undefined) delete process.env.PUBLY_THEME_DIR; else process.env.PUBLY_THEME_DIR = previous; fs.rmSync(dir, { recursive: true, force: true }); }
});

const SIGNED_CSS = "#publy p { color: #123456; margin: 1px 2px }";
const sha256 = (value: string) => crypto.createHash("sha256").update(value, "utf8").digest("hex");

function signedBundle(css = SIGNED_CSS): { raw: string; publicKeyBase64: string; bundle: ThemeBundle } {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
  const publicKeyBase64 = publicKey.export({ type: "spki", format: "der" }).toString("base64");
  const base = {
    format: "publy-theme-v2" as const,
    id: "signed-fixture",
    version: "1.0.0",
    name: "Signed fixture",
    license: "MIT",
    css,
    cssSha256: sha256(css),
  };
  const signature = crypto.sign(null, themeSignaturePayload(base), privateKey).toString("base64");
  const bundle = { ...base, signature: { alg: "ed25519" as const, publicKey: publicKeyBase64, signature } };
  return { raw: JSON.stringify(bundle), publicKeyBase64, bundle: bundle as unknown as ThemeBundle };
}

test("a valid v2 bundle verifies and installs only with the pinned key", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-theme-signed-"));
  const previous = process.env.PUBLY_THEME_DIR;
  process.env.PUBLY_THEME_DIR = dir;
  try {
    const { raw, publicKeyBase64 } = signedBundle();
    assert.equal(validateThemeBundle(raw).signature?.alg, "ed25519");

    const other = crypto.generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "der" }).toString("base64");
    assert.throws(() => installThemeBundle(raw, "add", [], { trustedKey: other }), /THEME_UNTRUSTED_SIGNER/);
    assert.throws(() => installThemeBundle(raw, "add", [], { trustedKey: "not-a-key" }), /THEME_SIGNING_KEY_INVALID/);
    assert.deepEqual(fs.readdirSync(dir), [], "a rejected pin must not write a bundle");

    const installed = installThemeBundle(raw, "add", [], { trustedKey: publicKeyBase64 });
    assert.equal(installed.id, "signed-fixture");
    assert.equal(fs.readdirSync(dir).length, 1);
  } finally {
    if (previous === undefined) delete process.env.PUBLY_THEME_DIR; else process.env.PUBLY_THEME_DIR = previous;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("signed bundle metadata tampering and malformed signatures fail closed", () => {
  const { bundle } = signedBundle();

  const tampered = { ...bundle, name: "Renamed after signing" };
  assert.throws(() => validateThemeBundle(JSON.stringify(tampered)), /THEME_SIGNATURE_INVALID/);

  const missing = { ...bundle };
  delete (missing as { signature?: unknown }).signature;
  assert.throws(() => validateThemeBundle(JSON.stringify(missing)), /THEME_INVALID_BUNDLE/);

  const v1 = { ...bundle, format: "publy-theme-v1" };
  assert.throws(() => validateThemeBundle(JSON.stringify(v1)), /THEME_INVALID_BUNDLE/);

  const badAlg = { ...bundle, signature: { ...bundle.signature, alg: "rsa" } };
  assert.throws(() => validateThemeBundle(JSON.stringify(badAlg)), /THEME_SIGNATURE_INVALID/);

  const original = bundle.signature!.signature;
  const altered = original.slice(0, -1) + (original.endsWith("A") ? "B" : "A");
  const rewritten = { ...bundle, signature: { ...bundle.signature, signature: altered } };
  assert.throws(() => validateThemeBundle(JSON.stringify(rewritten)), /THEME_SIGNATURE_INVALID/);
});
