#!/usr/bin/env node
// Run only with all Publy writers stopped, on an isolated restored copy.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";

const statuses = new Set(["pending", "running", "done", "failed", "cancelled", "interrupted"]);
const isRecord = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

export function quarantineRestoredJobs(dataDir) {
  const file = path.join(dataDir, "jobs.json");
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("jobs.json must be a regular file, not a symlink");
  const original = fs.readFileSync(file, "utf8");
  const jobs = JSON.parse(original);
  if (!isRecord(jobs) || !Object.entries(jobs).every(([key, job]) =>
    isRecord(job) && job.id === key && statuses.has(job.status) && isRecord(job.body) &&
    typeof job.body.account === "string" && job.body.account.length > 0 &&
    typeof job.body.title === "string" && typeof job.body.type === "string" &&
    Number.isFinite(job.runAt) && Number.isFinite(job.nextAttemptAt) &&
    Number.isInteger(job.attempts) && job.attempts >= 0 &&
    (job.userId === null || typeof job.userId === "string") &&
    (job.idempotencyKey === undefined || typeof job.idempotencyKey === "string") &&
    (job.error === undefined || typeof job.error === "string") &&
    (job.result === undefined || isRecord(job.result)))) {
    throw new Error("invalid jobs state; no changes made");
  }
  let count = 0;
  for (const job of Object.values(jobs)) {
    // A failure marked safe at snapshot time might have been retried later.
    if (job.status === "pending" || job.status === "running" || (job.status === "failed" && job.safeToRetry === true)) {
      job.status = "interrupted";
      job.safeToRetry = false;
      job.error = "restored from backup — draft outcome unknown; inspect WeChat drafts before further action";
      count++;
    }
  }
  if (count === 0) return 0;
  // Preserve the exact original and fail instead of overwriting an older copy.
  const backup = `${file}.before-restore-quarantine`;
  fs.writeFileSync(backup, original, { flag: "wx", mode: 0o600 });
  const temporary = path.join(dataDir, `.jobs-restore-${crypto.randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temporary, JSON.stringify(jobs, null, 2), { flag: "wx", mode: 0o600 });
    fs.renameSync(temporary, file);
  } finally {
    try { fs.unlinkSync(temporary); } catch (e) { if (e.code !== "ENOENT") throw e; }
  }
  return count;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.length !== 4 || process.argv[2] !== "--data-dir") {
    console.error("Usage: node scripts/quarantine-restored-jobs.mjs --data-dir <restored-server-data-dir>");
    process.exitCode = 2;
  } else {
    try {
      const count = quarantineRestoredJobs(path.resolve(process.argv[3]));
      console.log(`Quarantined ${count} potentially executable job(s). Review all activity since the backup before reconnecting the server.`);
    } catch (error) {
      console.error(`Recovery quarantine failed: ${error.message}`);
      process.exitCode = 1;
    }
  }
}
