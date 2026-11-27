// Shared client-side identity for a WeChat *draft* submission.
//
// Both CLI and Obsidian must hash what is actually sent, not the length of
// HTML, the source mtime, a filename or a UI preview. An accidental collision
// could silently suppress a distinct draft via server-side idempotency.
//
// Version the prefix so new clients cannot accidentally reuse historical weak
// identifiers. Keep the same request identity for true network retries and
// outcome reconciliation. This does not replace server authorization.
import crypto from "node:crypto";
import { visitDraftIdentityFields } from "./draft-identity-fields.js";
import type { PublishRequest } from "@publy/shared";

export function draftIdempotencyKey(
  request: Omit<PublishRequest, "idempotencyKey">,
): string {
  const hash = crypto.createHash("sha256");
  // Each field is length-delimited: concatenating two fields without a
  // boundary would turn ["ab", "c"] into the same bytes as ["a", "bc"].
  const field = (value: string): void => {
    hash.update(String(Buffer.byteLength(value, "utf8")), "ascii");
    hash.update(":");
    hash.update(value, "utf8");
  };
  visitDraftIdentityFields(request, field);
  return hash.digest("hex").slice(0, 32);
}
