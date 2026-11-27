import { test } from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import type { PublishRequest } from "@publy/shared";
import { draftIdempotencyKey } from "./draft-identity.js";
import { browserDraftIdempotencyKey } from "./draft-identity-browser.js";

test("browser and native draft identity agree on exact UTF-8 and attachment bytes", async () => {
 const req: PublishRequest = { account: "测试账号", type: "article", title: "你好 🌍", html: "<p>文</p>", images: [{name:"图.png",contentType:"image/png",data:"AA=="}], needOpenComment:false };
 assert.equal(await browserDraftIdempotencyKey(req, webcrypto.subtle), draftIdempotencyKey(req));
 assert.notEqual(await browserDraftIdempotencyKey({...req,html:"<p>新</p>"},webcrypto.subtle),draftIdempotencyKey(req));
 assert.notEqual(await browserDraftIdempotencyKey({...req,account:"另一个"},webcrypto.subtle),draftIdempotencyKey(req));
 assert.notEqual(await browserDraftIdempotencyKey({...req,images:[{...req.images![0],data:"AQ=="}]},webcrypto.subtle),draftIdempotencyKey(req));
});
