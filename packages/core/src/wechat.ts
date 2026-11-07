// Minimal WeChat MP API client: access token, permanent image material, draft.
// Only official endpoints; no account simulation.

import fs from "node:fs";
import path from "node:path";

const TOKEN_URL = "https://api.weixin.qq.com/cgi-bin/token";
const ADD_MATERIAL_URL = "https://api.weixin.qq.com/cgi-bin/material/add_material";
const DRAFT_ADD_URL = "https://api.weixin.qq.com/cgi-bin/draft/add";
const DRAFT_BATCHGET_URL = "https://api.weixin.qq.com/cgi-bin/draft/batchget";

/** Read-only summary of one WeChat draft. Titles are the operator-visible
 *  identity; media_id is the value a confirmed draft must retain. */
export interface WechatDraftSummary {
  mediaId: string;
  title: string;
  updateTime: number;
}

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
  private cache: TokenCache = Object.create(null) as TokenCache;
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
        // Keep a prototype-free dictionary: app IDs must never resolve to
        // inherited keys such as constructor or mutate __proto__ on save.
        Object.assign(this.cache, parsed);
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

/**
 * List one page of the account's draft box. This is the only way an operator
 * can prove which drafts really exist after an ambiguous submission, so it is
 * deliberately read-only and never creates or edits anything.
 *
 * WeChat returns at most 20 items per call; ask for no_content to keep the
 * response small while retaining titles and media IDs.
 */
export async function draftBatchGet(accessToken: string, offset = 0, count = 20): Promise<{ totalCount: number; items: WechatDraftSummary[] }> {
  const safeCount = Math.min(Math.max(Math.trunc(count) || 20, 1), 20);
  const safeOffset = Math.max(Math.trunc(offset) || 0, 0);
  const res = await fetch(`${DRAFT_BATCHGET_URL}?access_token=${encodeURIComponent(accessToken)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ offset: safeOffset, count: safeCount, no_content: 1 }),
  });
  const data = await res.json() as any;
  assertOk(data);
  // Evidence must be well formed: a missing total_count would make a partial
  // listing look complete and could wrongly release a claim.
  if (typeof data?.total_count !== "number" || !Number.isFinite(data.total_count)) {
    throw new Error("draft/batchget returned no usable total_count");
  }
  const rawItems: any[] = Array.isArray(data.item) ? data.item : [];
  const items: WechatDraftSummary[] = [];
  for (const item of rawItems) {
    const mediaId = item?.media_id;
    if (typeof mediaId !== "string" || !mediaId) continue;
    const newsItem = Array.isArray(item?.content?.news_item) ? item.content.news_item[0] : null;
    const title = typeof newsItem?.title === "string" ? newsItem.title : "";
    items.push({ mediaId, title, updateTime: Number(item?.update_time) || 0 });
  }
  return { totalCount: data.total_count, items };
}

/**
 * Read up to `limit` drafts across pages. A partial listing is returned when
 * WeChat reports fewer drafts than requested; callers must treat an empty
 * result as "not seen on this page set", never as proof that a draft was
 * never created outside the scanned range.
 */
export async function listDraftSummaries(accessToken: string, limit = 100): Promise<{ totalCount: number; items: WechatDraftSummary[] }> {
  const max = Math.min(Math.max(Math.trunc(limit) || 100, 1), 200);
  const pageSize = 20;
  const items: WechatDraftSummary[] = [];
  let totalCount = 0;
  for (let offset = 0; offset < max; offset += pageSize) {
    const page = await draftBatchGet(accessToken, offset, Math.min(pageSize, max - offset));
    totalCount = Math.max(totalCount, page.totalCount);
    items.push(...page.items);
    if (page.items.length === 0 || items.length >= totalCount) break;
  }
  return { totalCount: Math.max(totalCount, items.length), items: items.slice(0, max) };
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
