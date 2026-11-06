import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { adminPage } from "./admin-page.js";

test("operator requests retain authentication and live feed uses short-lived tickets", async () => {
  const html = adminPage();
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  const elements = new Map<string, any>();
  const element = (id: string) => {
    if (!elements.has(id)) elements.set(id, { value: "", style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {}, appendChild() {}, querySelectorAll() { return []; } });
    return elements.get(id);
  };
  const calls: Array<{ url: string; options: any }> = [];
  const sockets: string[] = [];
  const context = vm.createContext({
    document: { getElementById: element, addEventListener() {}, querySelectorAll() { return []; }, createElement() {
      let content = "";
      return { set textContent(value: unknown) { content = String(value); }, get innerHTML() { return content.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"); } };
    } },
    sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    localStorage: { getItem() { return null; }, setItem() {} },
    location: { protocol: "https:", port: "", hostname: "example.test" },
    fetch: async (url: string, options: any) => { calls.push({ url, options }); return { ok: true, status: 200, json: async () => ({ ticket: "ws1.synthetic.ticket" }) }; },
    WebSocket: class { constructor(url: string) { sockets.push(url); } },
    URL, setTimeout, clearTimeout, navigator: {}, console,
  });
  vm.runInContext(script, context);
  context.KEY = "private-admin-key";
  await context.api("/v1/admin/accounts", { method: "POST", headers: { "content-type": "application/json" } });
  assert.equal(calls[0].options.headers["x-api-key"], "private-admin-key");
  assert.equal(calls[0].options.headers["content-type"], "application/json");
  element("ws-url").value = "wss://example.test/events";
  await context.wsConnect();
  assert.equal(calls[1].url, "/v1/ws-ticket");
  assert.equal(calls[1].options.headers["x-api-key"], "private-admin-key");
  assert.match(sockets[0], /key=ws1.synthetic.ticket/);
  assert.doesNotMatch(sockets[0], /private-admin-key/);
  context.fetch = async () => ({ ok: false, status: 501 });
  await context.wsConnect();
  assert.equal(sockets.length, 1, "ticket failure must not fall back to the long-lived key");
  assert.match(element("ws-state").textContent, /连接失败/);
  context.fetch = async (_url: string, options: any) => {
    assert.equal(options.headers["x-api-key"], "private-admin-key");
    return { ok: true, status: 200, json: async () => ({ jobs: [{ id: "job-1", title: "<script>bad</script>", account: "a", runAt: "2026-11-01T00:00:00Z", status: "interrupted" }] }) };
  };
  await context.loadJobs();
  assert.match(element("j-rows").innerHTML, /结果未知，请检查草稿箱/);
  assert.match(element("j-rows").innerHTML, /&lt;script&gt;/);
  assert.doesNotMatch(element("j-rows").innerHTML, /<script>/);
  context.fetch = async () => ({ ok: true, json: async () => ({ jobs: [
    { id: "waiting", title: "Waiting", status: "pending", runAt: 1 },
    { id: "uncertain", title: "Uncertain", status: "interrupted", runAt: 1 },
  ] }) });
  await context.loadJobs();
  assert.equal((element("j-rows").innerHTML.match(/data-cancel-job=/g) || []).length, 1);
  let confirmAction: (() => Promise<void>) | undefined;
  let refreshCount = 0;
  context.confirmBox = (_message: string, action: () => Promise<void>) => { confirmAction = action; };
  context.refreshDrafts = () => { refreshCount++; };
  let mutationCount = 0;
  context.fetch = async (url: string, options: any) => {
    mutationCount++;
    assert.equal(url, "/v1/jobs/job%2F1");
    assert.equal(options.method, "DELETE");
    assert.equal(options.headers["x-api-key"], "private-admin-key");
    return { ok: true, json: async () => ({ ok: true }) };
  };
  context.toast = () => {};
  context.confirmCancelJob({ id: "job/1", title: "Test" });
  assert.equal(mutationCount, 0, "opening confirmation must not cancel the job");
  assert.ok(confirmAction);
  await confirmAction();
  assert.equal(mutationCount, 1);
  assert.equal(refreshCount, 1);
  let notice = "";
  context.toast = (message: string) => { notice = message; };
  context.fetch = async () => { throw new Error("connection lost"); };
  context.confirmCancelJob({ id: "waiting", title: "Waiting" });
  assert.ok(confirmAction);
  await confirmAction();
  assert.match(notice, /未能确认取消结果/);
  assert.equal(refreshCount, 2, "refresh after uncertain cancellation");
  context.fetch = async () => ({ ok: true, status: 200, json: async () => ({ history: [
    { event: "published", ts: "2026-11-01T00:00:00Z", title: "<img>", account: "a" },
    { event: "outcome-unknown", ts: "2026-11-01T00:00:01Z", title: "pending", account: "b" },
    { event: "purchase-paid", title: "not a draft" },
  ] }) });
  await context.loadDraftHistory();
  assert.match(element("h-rows").innerHTML, /结果未知，请检查草稿箱/);
  assert.match(element("h-rows").innerHTML, /&lt;img&gt;/);
  assert.doesNotMatch(element("h-rows").innerHTML, /not a draft/);
  context.fetch = async () => { throw new Error("offline"); };
  await context.loadDraftHistory();
  assert.match(element("history-status").textContent, /无法读取记录/);
  assert.equal(element("h-rows").innerHTML, "");
  await context.loadJobs();
  assert.match(element("jobs-status").textContent, /无法读取任务/);
  assert.equal(element("j-rows").innerHTML, "");
  await context.loadOverview();
  assert.match(element("overview-status").textContent, /无法读取服务概览/);
  assert.equal(element("stat-grid").innerHTML, "");
  let ticketRequests = 0, confirmations = 0;
  context.fetch = async () => { ticketRequests++; return { ok: true, json: async () => ({ ticket: "ws1.synthetic.ticket" }) }; };
  context.window = { confirm() { confirmations++; return false; } };
  element("ws-url").value = "wss://other.example/events";
  await context.wsConnect();
  assert.equal(confirmations, 1);
  assert.equal(ticketRequests, 0, "a declined external gateway must not receive a ticket");
  element("ws-url").value = "ws://example.test/events";
  await context.wsConnect();
  assert.equal(ticketRequests, 0, "an HTTPS console cannot send tickets over plaintext");
  context.window.confirm = () => { confirmations++; return true; };
  element("ws-url").value = "wss://other.example/events";
  await context.wsConnect();
  assert.equal(ticketRequests, 1);
  assert.match(sockets.at(-1)!, /^wss:\/\/other\.example\/events\?key=/);
});

test("claim reconciliation reads the draft box and requires a note before resolving", async () => {
  const html = adminPage();
  assert.match(html, /data-tab="claims"/);
  assert.match(html, /id="c-rows"/);
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  const elements = new Map<string, any>();
  const element = (id: string) => {
    if (!elements.has(id)) {
      elements.set(id, {
        value: "", style: {}, dataset: {},
        classList: { add() {}, remove() {}, toggle() {} },
        addEventListener() {}, appendChild() {},
        querySelectorAll() { return []; },
        querySelector() { return { value: "0" }; },
      });
    }
    return elements.get(id);
  };
  const calls: Array<{ url: string; options: any }> = [];
  const context = vm.createContext({
    document: {
      getElementById: element, addEventListener() {}, querySelectorAll() { return []; }, querySelector() { return null; },
      createElement() {
        let content = "";
        return {
          set textContent(value: unknown) { content = String(value); },
          get innerHTML() { return content.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"); },
          classList: { add() {}, remove() {} },
          remove() {},
        };
      },
    },
    sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    localStorage: { getItem() { return null; }, setItem() {} },
    location: { protocol: "https:", port: "", hostname: "example.test" },
    fetch: async (url: string, options: any) => {
      calls.push({ url, options });
      if (url === "/v1/admin/claims") {
        return {
          ok: true, status: 200,
          json: async () => ({ claims: [{ key: "claim-1", ownerContact: "operator", account: "synth", title: "<b>unsafe</b>", state: "pending", createdAt: 1700000000000 }], pending: 1 }),
        };
      }
      if (url.endsWith("/candidates")) {
        return {
          ok: true, status: 200,
          json: async () => ({ scanned: 1, totalCount: 1, complete: true, sameTitleCount: 1, candidates: [{ mediaId: "draft-verified", title: "unsafe" }] }),
        };
      }
      return { ok: true, status: 200, json: async () => ({ ok: true, claim: { key: "claim-1", state: "confirmed" } }) };
    },
    WebSocket: class { constructor() {} },
    URL, setTimeout, clearTimeout, navigator: {}, console,
  });
  vm.runInContext(script, context);
  context.KEY = "private-admin-key";
  await context.loadClaims();
  assert.match(element("c-rows").innerHTML, /&lt;b&gt;unsafe&lt;\/b&gt;/, "claim titles must be escaped");
  assert.match(element("claims-status").textContent, /1 条待核对/);

  const claim = { key: "claim-1", account: "synth", title: "unsafe" };
  context.openClaimInspection(claim);
  assert.equal(typeof element("claim-load").onclick, "function");
  await context.inspectClaim(claim, false);
  assert.equal(calls.at(-1)!.url, "/v1/admin/claims/claim-1/candidates");
  assert.equal(calls.at(-1)!.options.headers["x-api-key"], "private-admin-key");

  element("claim-note").value = "ok";
  await element("claim-delivered").onclick();
  assert.equal(calls.filter((call) => call.url.endsWith("/reconcile")).length, 0, "a short note must not submit");
  assert.match(element("claim-out").textContent, /至少 4 个字/);

  element("claim-note").value = "已按标题在草稿箱核对";
  await element("claim-delivered").onclick();
  const reconcile = calls.find((call) => call.url === "/v1/admin/claims/claim-1/reconcile");
  assert.ok(reconcile);
  assert.deepEqual(JSON.parse(reconcile.options.body), {
    outcome: "delivered",
    mediaId: "draft-verified",
    note: "已按标题在草稿箱核对",
  });
  assert.equal(calls.at(-1)!.url, "/v1/admin/claims", "the list refreshes after resolving");
});
