import type { PublishRequest } from "@publy/shared";
import { visitDraftIdentityFields } from "./draft-identity-fields.js";

/** Same UTF-8 length-delimited identity as CLI and Obsidian; no network access. */
export async function browserDraftIdempotencyKey(request: Omit<PublishRequest, "idempotencyKey">, subtle: { digest(algorithm: string, data: Uint8Array<ArrayBuffer>): Promise<ArrayBuffer> }): Promise<string> {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  let length = 0;
  visitDraftIdentityFields(request, value => {
    const data = encoder.encode(value);
    const prefix = encoder.encode(String(data.length) + ":");
    chunks.push(prefix, data);
    length += prefix.length + data.length;
  });
  const input = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { input.set(chunk, offset); offset += chunk.length; }
  const digest = new Uint8Array(await subtle.digest("SHA-256", input));
  return Array.from(digest.slice(0, 16), byte => byte.toString(16).padStart(2, "0")).join("");
}
