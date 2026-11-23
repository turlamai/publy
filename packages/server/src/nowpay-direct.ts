import net from "node:net";
import crypto from "node:crypto";
import { verifyHostedAdmission } from "./hosted-admission.js";
import type { HostedEntitlementFence } from "./hosted-entitlement-fence.js";

export interface NowpayDirectConfig {
  socketPath: string;
  serviceId: string;
  outProductId: string;
  issuer: string;
  racketExecutable: string;
  verifierScript: string;
  trustStore: string;
  purchasingEnabled: boolean;
}
export type NowpayDirectResult =
  | { status: "allowed"; validFrom: string; validUntil: string; entitlementId: string; revision: number }
  | { status: "purchase-required"; purchaseUrl?: string; qrUrl?: string }
  | { status: "denied" | "unavailable" };

function requestSocket(socketPath: string, request: object): Promise<Record<string, unknown> | null> {
  return new Promise(resolve => {
    const socket = net.createConnection({ path: socketPath });
    let size = 0, settled = false;
    const chunks: Buffer[] = [];
    const finish = (value: Record<string, unknown> | null) => {
      if (settled) return; settled = true; socket.destroy(); resolve(value);
    };
    socket.setTimeout(40_000, () => finish(null));
    socket.on("connect", () => socket.end(JSON.stringify(request)));
    socket.on("error", () => finish(null));
    socket.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 65536) finish(null); else chunks.push(chunk);
    });
    socket.on("end", () => {
      try {
        const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
        finish(value && typeof value === "object" && !Array.isArray(value) ? value : null);
      } catch { finish(null); }
    });
    socket.on("close", () => { if (!settled) finish(null); });
  });
}

function purchaseUrl(value: unknown, qr = false): string | undefined {
  if (typeof value !== "string" || value.length > 512 || /\s/.test(value)) return;
  try {
    const url = new URL(value);
    if (url.username || url.password || url.port) return;
    if (qr) return url.protocol === "https:" && url.hostname === "mobilecodec.alipay.com" ? value : undefined;
    if (url.protocol === "alipays:" && url.hostname === "platformapi" && url.pathname === "/startapp") return value;
    if (url.protocol === "https:" && (url.hostname === "alipay.com" || url.hostname.endsWith(".alipay.com"))) return value;
  } catch { /* Provider failure is never a reason to follow an arbitrary URL. */ }
}

export async function consultNowpayDirect(config: NowpayDirectConfig, buyerId: string,
    fence: HostedEntitlementFence): Promise<NowpayDirectResult> {
  if (typeof buyerId !== "string" || buyerId.length < 1 || buyerId.length > 128) return { status: "denied" };
  const nonce = crypto.randomBytes(32).toString("hex");
  try {
    const response = await requestSocket(config.socketPath, { version: 1, service_id: config.serviceId, buyer_id: buyerId, nonce });
    if (!response || response.version !== 1 || response.nonce !== nonce || response.buyer_id !== buyerId) return { status: "unavailable" };
    if (response.decision === "DENY") return { status: "denied" };
    if (response.decision === "PURCHASE_REQUIRED") {
      if (!config.purchasingEnabled) return { status: "purchase-required" };
      return { status: "purchase-required", purchaseUrl: purchaseUrl(response.purchase_url), qrUrl: purchaseUrl(response.purchase_qr_code, true) };
    }
    if (response.decision !== "ALLOW" || !response.credential || typeof response.credential !== "object") return { status: "unavailable" };
    const offer = "publy-personal-monthly";
    const prior = fence.lookup(buyerId, offer);
    const at = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
    const verified = await verifyHostedAdmission({ credential: response.credential as object, account: buyerId,
      plan: "personal", at, entitlementId: prior?.entitlementId, minimumRevision: prior?.revision,
      racketExecutable: config.racketExecutable, verifierScript: config.verifierScript, trustStore: config.trustStore,
      direct: { nonce, serviceId: config.serviceId, outProductId: config.outProductId, issuer: config.issuer } });
    if (!verified.allowed || !verified.validFrom || !verified.useExpiresAt || !verified.entitlementId ||
        verified.revision === undefined || !verified.payloadSha256) return { status: "denied" };
    fence.record({ subject: buyerId, offer, entitlementId: verified.entitlementId, revision: verified.revision,
      payloadSha256: verified.payloadSha256 }, true);
    return { status: "allowed", validFrom: verified.validFrom, validUntil: verified.useExpiresAt,
      entitlementId: verified.entitlementId, revision: verified.revision };
  } catch { return { status: "unavailable" }; }
}
