// Server-side publish: turn a PublishRequest into WeChat API calls.
// Both the self-hosted server and the cloud control plane call into this.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Attachment, PublishRequest } from "@publy/shared";
import { ATTACHMENT_SCHEME, PublishResponse } from "@publy/shared";
import { TokenManager, uploadImageMaterial, draftAdd, WechatError } from "./wechat.js";
import { cropCoverTo235 } from "./crop.js";
import { generateTitleCover } from "./cover-art.js";

export interface AccountCredential {
  name: string;
  appId: string;
  appSecret: string;
}

/** Permanent-material cache: same bytes for the same app never re-upload. */
export class MaterialCache {
  private cache: Record<string, { mediaId: string; url: string }> = {};
  private file: string;

  constructor(cacheDir?: string) {
    if (!cacheDir) {
      this.file = "";
      return;
    }
    fs.mkdirSync(cacheDir, { recursive: true });
    this.file = path.join(cacheDir, "material-cache.json");
    try {
      this.cache = JSON.parse(fs.readFileSync(this.file, "utf-8"));
    } catch {
      /* first run */
    }
  }

  private static key(appId: string, data: string, name: string): string {
    return crypto.createHash("sha256").update(appId).update(name).update(data).digest("hex");
  }

  get(appId: string, att: Attachment): { mediaId: string; url: string } | undefined {
    if (!this.file) return undefined;
    return this.cache[MaterialCache.key(appId, att.data, att.name)];
  }

  set(appId: string, att: Attachment, mediaId: string, url: string): void {
    if (!this.file) return;
    this.cache[MaterialCache.key(appId, att.data, att.name)] = { mediaId, url };
    try {
      fs.writeFileSync(this.file, JSON.stringify(this.cache), { mode: 0o600 });
    } catch {
      /* best-effort */
    }
  }
}

export class PublishError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "PublishError";
  }
}

/** Tiny seam so the cloud control plane (M4) can swap in a database store. */
export interface AccountStore {
  resolve(ref: string): AccountCredential | undefined;
  list(): string[];
}

export function accountStoreFromArray(accounts: AccountCredential[]): AccountStore {
  return {
    resolve: (ref) => accounts.find((a) => a.name === ref || a.appId === ref),
    list: () => accounts.map((a) => a.name),
  };
}

export function credentialFor(accounts: AccountCredential[], ref: string): AccountCredential {
  const hit = accounts.find((a) => a.name === ref || a.appId === ref);
  if (!hit) {
    throw new PublishError("ACCOUNT_NOT_FOUND", `Unknown account "${ref}"`);
  }
  return hit;
}

async function upload(
  token: string,
  att: Attachment,
  filename: string | undefined,
  appId: string,
  cache?: MaterialCache,
): Promise<{ mediaId: string; url: string }> {
  if (cache) {
    const hit = cache.get(appId, att);
    if (hit) return hit;
  }
  const buffer = Buffer.from(att.data, "base64");
  if (buffer.length === 0) {
    throw new PublishError("EMPTY_ATTACHMENT", `Attachment ${att.name} is empty`);
  }
  const result = await uploadImageMaterial(token, buffer, filename ?? att.name, att.contentType ?? "image/jpeg");
  cache?.set(appId, att, result.mediaId, result.url);
  return result;
}

export async function publishToWechat(
  req: PublishRequest,
  cred: AccountCredential,
  tokenManager: TokenManager,
  materialCache?: MaterialCache,
  onDraftSubmit?: () => void,
): Promise<PublishResponse> {
  const token = await tokenManager.get(cred.appId, cred.appSecret);
  const byName = new Map((req.images ?? []).map((a) => [a.name, a]));

  if (req.type === "image_post") {
    return publishImagePost(req, cred, token, byName, materialCache, onDraftSubmit);
  }
  return publishArticle(req, cred, token, byName, materialCache, onDraftSubmit);
}

/** Extract attachment names referenced in published HTML ("attachment://<name>" until the closing quote). */
export function extractAttachmentRefs(html: string): string[] {
  // greedy [^"']+ — a lazy `+?` here stops after a single character and every
  // lookup misses (regression-tested in publish.test.ts)
  return [...html.matchAll(new RegExp(`${ATTACHMENT_SCHEME}([^"']+)`, "g"))].map((m) => m[1]);
}

async function publishArticle(
  req: PublishRequest,
  cred: AccountCredential,
  token: string,
  byName: Map<string, Attachment>,
  cache?: MaterialCache,
  onDraftSubmit?: () => void,
): Promise<PublishResponse> {
  let html = req.html ?? "";

  // upload content images, replace attachment:// refs with wechat CDN urls
  const refs = extractAttachmentRefs(html);
  const unique = [...new Set(refs)];
  for (const name of unique) {
    const att = byName.get(name);
    if (!att) throw new PublishError("ATTACHMENT_MISSING", `HTML references unknown attachment "${name}"`);
    const { url } = await upload(token, att, undefined, cred.appId, cache);
    html = html.replaceAll(`${ATTACHMENT_SCHEME}${name}`, url);
  }

  // cover: explicit cover attachment, else first uploaded content image,
  // else a generated title card — every publishable note gets one
  let thumbMediaId = "";
  let coverSource: "cover" | "first-image" | "auto" | undefined;
  if (req.cover) {
    coverSource = "cover";
    const att = byName.get(req.cover);
    if (!att) throw new PublishError("ATTACHMENT_MISSING", `Cover attachment "${req.cover}" not found`);
    const buffer = Buffer.from(att.data, "base64");
    // center-crop to the 2.35:1 cover ratio so WeChat's auto-crop lands right
    const cropped = cropCoverTo235(buffer, att.contentType ?? "image/jpeg");
    const coverAtt: Attachment = { ...att, data: cropped.toString("base64"), contentType: "image/png" };
    const { mediaId } = await upload(token, coverAtt, "cover.jpg", cred.appId, cache);
    thumbMediaId = mediaId;
  }
  if (!thumbMediaId && req.coverMode !== "auto") {
    const first = unique[0];
    if (first) {
      const { mediaId } = await upload(token, byName.get(first)!, "cover.jpg", cred.appId, cache);
      thumbMediaId = mediaId;
      coverSource = "first-image";
    }
  }
  if (!thumbMediaId) {
    // auto title cover: every publishable note deserves a cover
    const coverPng = generateTitleCover(req.title);
    if (coverPng) {
      const att: Attachment = { name: "auto-cover.png", data: coverPng.toString("base64"), contentType: "image/png" };
      const { mediaId } = await upload(token, att, "cover.jpg", cred.appId, cache);
      thumbMediaId = mediaId;
      coverSource = "auto";
    }
  }
  if (!thumbMediaId) {
    throw new PublishError("NO_COVER", "Provide a cover or at least one image in the body");
  }

  onDraftSubmit?.();
  const mediaId = await draftAdd(token, {
    title: req.title,
    content: html,
    thumb_media_id: thumbMediaId,
    author: req.author ?? "",
    digest: req.digest ?? "",
    content_source_url: req.contentSourceUrl ?? "",
    need_open_comment: req.needOpenComment ? 1 : 0,
    only_fans_can_comment: req.onlyFansCanComment ? 1 : 0,
  });
  return { mediaId, coverSource };
}

async function publishImagePost(
  req: PublishRequest,
  cred: AccountCredential,
  token: string,
  byName: Map<string, Attachment>,
  cache?: MaterialCache,
  onDraftSubmit?: () => void,
): Promise<PublishResponse> {
  const images = req.images ?? [];
  if (images.length === 0) {
    throw new PublishError("NO_IMAGES", "image_post requires at least one image");
  }
  const imageList: { image_media_id: string }[] = [];
  for (const att of images) {
    const { mediaId } = await upload(token, att, undefined, cred.appId, cache);
    imageList.push({ image_media_id: mediaId });
  }
  const thumbMediaId = req.cover
    ? (await upload(token, byName.get(req.cover)!, "cover.jpg", cred.appId, cache)).mediaId
    : imageList[0].image_media_id;

  onDraftSubmit?.();
  const mediaId = await draftAdd(token, {
    title: req.title,
    content: req.html ?? "",
    thumb_media_id: thumbMediaId,
    author: req.author ?? "",
    article_type: "newspic",
    image_info: { image_list: imageList },
    need_open_comment: req.needOpenComment ? 1 : 0,
    only_fans_can_comment: req.onlyFansCanComment ? 1 : 0,
  });
  return { mediaId };
}

export { WechatError };

