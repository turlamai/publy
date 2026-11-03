import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

test("server starts through a symlinked release entrypoint", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-symlink-start-"));
  const target = fileURLToPath(new URL("./index.js", import.meta.url));
  const link = path.join(dir, "server.js");
  try {
    try { fs.symlinkSync(target, link, "file"); }
    catch (error) {
      if (process.platform === "win32" && ["EPERM", "EACCES"].includes((error as NodeJS.ErrnoException).code ?? "")) {
        t.skip("Windows account cannot create symbolic links");
        return;
      }
      throw error;
    }
    const config = path.join(dir, "config.json");
    fs.writeFileSync(config, JSON.stringify({ port: 0, apiKey: "synthetic", secretKey: "11".repeat(32),
      publicIp: "127.0.0.1", dataDir: path.join(dir, "data"),
      accounts: [{ name: "synthetic", appId: "wx_test", appSecret: "synthetic" }] }));
    const child = spawn(process.execPath, [link, "--config", config], { stdio: ["ignore", "pipe", "pipe"] });
    const exit = new Promise<void>((resolve) => child.once("close", () => resolve()));
    try {
      await new Promise<void>((resolve, reject) => {
        let output = "";
        const timer = setTimeout(() => reject(new Error("server startup timed out")), 15000);
        child.stdout.on("data", (chunk: Buffer) => {
          output += chunk.toString();
          if (output.includes("publy-server listening")) { clearTimeout(timer); resolve(); }
        });
        child.once("error", (error) => { clearTimeout(timer); reject(error); });
        child.once("close", () => { clearTimeout(timer); reject(new Error("server exited before listening")); });
      });
      assert.equal(child.exitCode, null);
    } finally {
      child.kill();
      await exit;
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
