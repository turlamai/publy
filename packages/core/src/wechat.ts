// Minimal WeChat MP API client: access token, permanent image material, draft.
// Only official endpoints; no account simulation.

import fs from "node:fs";
import path from "node:path";

const TOKEN_URL = "https://api.weixin.qq.com/cgi-bin/token";
const ADD_MATERIAL_URL = "https://api.weixin.qq.com/cgi-bin/material/add_material";
const DRAFT_ADD_URL = "https://api.weixin.qq.com/cgi-bin/draft/add";

export class WechatError extends Error {
  constructor(public errcode: number, public errmsg: string) {
    super(`${errcode}: ${errmsg}`);
    this.name = "WechatError";
  }
}

function assertOk(data: any): void {
  if (data && typeof data === "object" && "errcode" in data && data.errcode !== 0) {
    throw new WechatError(data.errcode, data.errmsg ?? "");
  }
}

interface TokenCache {
  [appId: string]: { accessToken: string; expireAt: number };
}

/** File-backed token cache with in-flight dedupe (600 s buffer before expiry). */
export class TokenManager {
  private cache: TokenCache = {};
  private inflight = new Map<string, Promise<string>>();
  private file: string;

  constructor(cacheDir: string) {
    fs.mkdirSync(cacheDir, { recursive: true });
    this.file = path.join(cacheDir, "token.json");
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(this.file, "utf-8"));
      // A parseable JSON value is not necessarily a token dictionary.
      // Null/array/primitive legacy files must not break credential recovery.
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        this.cache = parsed as TokenCache;
      }
    } catch {
      /* first run or unreadable cache: refresh from the API */
    }
  }

  private save(): void {
    fs.writeFileSync(this.file, JSON.stringify(this.cache, null, 2), { mode: 0o600 });
  }

  async get(appId: string, appSecret: string): Promise<string> {
    const now = Date.now() / 1000;
    const hit = this.cache[appId];
    // Older versions could persist an absent or malformed token after HTTP 200.
    // Never trust disk cache shape without validating the credential itself.
    if (hit && typeof hit.accessToken === "string" && hit.accessToken.trim() &&
        Number.isFinite(hit.expireAt) && hit.expireAt > now + 600) return hit.accessToken;

    const pending = this.inflight.get(appId);
    if (pending) return pending;

    const p = (async () => {
      const url = `${TOKEN_URL}?grant_type=client_credential&appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(appSecret)}`;
      const res = await fetch(url);
      const data = await res.json() as any;
      assertOk(data);
      // A successful HTTP response (even errcode: 0) is not proof that the
      // token endpoint returned a usable credential. Never cache or return an
      // absent/non-string token: the caller must see an explicit failure.
      if (!data || typeof data.access_token !== "string" || !data.access_token.trim()) {
        throw new Error("WeChat token response missing a valid access_token");
      }
      this.cache[appId] = {
        accessToken: data.access_token,
        expireAt: now + (data.expires_in ?? 7200),
      };
      this.save();
      return data.access_token as string;
    })().finally(() => this.inflight.delete(appId));

    this.inflight.set(appId, p);
    return p;
  }
}

export async function uploadImageMaterial(
  accessToken: string,
  buffer: Buffer,
  filename: string,
  contentType: string,
): Promise<{ mediaId: string; url: string }> {
  const form = new FormData();
  const blob = new Blob([new Uint8Array(buffer)], { type: contentType });
  form.append("media", blob, filename);
  const res = await fetch(`${ADD_MATERIAL_URL}?access_token=${encodeURIComponent(accessToken)}&type=image`, {
    method: "POST",
    body: form,
  });
  const data = await res.json() as any;
  assertOk(data);
  const url: string = (data.url ?? "").replace(/^http:\/\//i, "https://");
  return { mediaId: data.media_id, url };
}

export async function draftAdd(accessToken: string, article: Record<string, unknown>): Promise<string> {
  const res = await fetch(`${DRAFT_ADD_URL}?access_token=${encodeURIComponent(accessToken)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ articles: [article] }),
  });
  const data = await res.json() as any;
  assertOk(data);
  if (!data.media_id) throw new Error(`draft/add returned no media_id: ${JSON.stringify(data)}`);
  return data.media_id as string;
}

/** Connectivity check for novice onboarding: does this AppID/AppSecret work
 *  FROM THIS MACHINE? The token endpoint is the IP-whitelist-enforced one, and
 *  WeChat's 40164 error literally names the IP to add — surface it. */
export async function checkWechatCredential(appId: string, appSecret: string): Promise<{
  ok: boolean;
  errcode?: number;
  ip?: string;
  message: string;
}> {
  const url = `${TOKEN_URL}?grant_type=client_credential&appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(appSecret)}`;
  let data: any;
  try {
    const res = await fetch(url);
    data = await res.json();
  } catch (err) {
    return { ok: false, message: `网络错误：${(err as Error).message}` };
  }
  if (data.access_token) return { ok: true, message: "验证通过：该服务器已能正常调用此公众号的 API" };

  const errcode = Number(data.errcode ?? 0);
  const errmsg = String(data.errmsg ?? "");
  if (errcode === 40164) {
    const ip = errmsg.match(/invalid ip ([0-9.]+)/)?.[1];
    return {
      ok: false,
      errcode,
      ip,
      message: ip
        ? `IP 未加白名单：请在公众号后台「设置与开发 → 基本配置 → IP白名单」中添加 ${ip}，保存后重试`
        : `IP 未加白名单：${errmsg}`,
    };
  }
  if (errcode === 40125 || errcode === 40001) {
    return { ok: false, errcode, message: "AppSecret 无效：请确认已复制最新重置后的 secret（注意前后无空格）" };
  }
  if (errcode === 40013) {
    return { ok: false, errcode, message: "AppID 无效：请核对公众号后台「设置与开发 → 基本配置」中的 AppID" };
  }
  return { ok: false, errcode, message: `微信返回 ${errcode}: ${errmsg}` };
}
