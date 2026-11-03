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
    document: { getElementById: element, addEventListener() {}, querySelectorAll() { return []; }, createElement() { return element("created"); } },
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
});
