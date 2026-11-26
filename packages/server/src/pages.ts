import { WEB_CSS, WEB_JS } from "./web-assets.js";
import { escapeHtml } from "./setup-page.js";
// Storefront (purchase) + admin console pages.
import { HOSTED_OFFERS, formatFen, type HostedOfferId } from "./hosted-offers.js";
//
// Shared public tokens are generated from the prototype and embedded so
// installed servers never depend on a remote stylesheet.

const BASE_CSS = `
  :root { --radius:12px; --radius-sm:8px; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
    background: var(--bg); color: var(--text);
    -webkit-font-smoothing: antialiased;
    line-height: 1.6;
  }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 24px;
    margin-bottom: 16px;
  }
  .card h3 {
    font-size: 15px; font-weight: 600; color: var(--text);
    margin-bottom: 16px; padding-bottom: 12px;
    border-bottom: 1px solid var(--border);
  }
  label {
    display: block; font-size: 12px; font-weight: 500;
    color: var(--text-2); margin: 14px 0 5px; letter-spacing: .02em;
  }
  input, select {
    width: 100%; padding: 10px 12px;
    background: var(--bg); color: var(--text);
    border: 1px solid var(--border-light); border-radius: var(--radius-sm);
    font-size: 14px; outline: none; transition: border-color .2s;
  }
  input:focus, select:focus { border-color: var(--accent); }
  input::placeholder { color: var(--text-3); }
  .btn {
    display: inline-block; padding: 10px 20px;
    background: var(--accent); color: var(--on-accent);
    border: 0; border-radius: var(--radius-sm);
    font-size: 14px; font-weight: 600; cursor: pointer;
    transition: background .2s; text-align: center;
  }
  .btn:hover { background: var(--accent-hover); }
  .btn:disabled { opacity: .4; cursor: not-allowed; }
  .btn-ghost {
    background: transparent; color: var(--text-2);
    border: 1px solid var(--border-light);
  }
  .btn-ghost:hover { border-color: var(--text-2); background: var(--surface-2); }
  .btn-danger { background: transparent; color: var(--danger); border: 1px solid var(--danger); }
  .btn-danger:hover { background: rgba(248,113,113,.1); }
  .msg {
    margin-top: 14px; padding: 12px 14px;
    border-radius: var(--radius-sm); font-size: 13px; line-height: 1.8;
    display: none; word-break: break-all;
  }
  .key-box {
    background: var(--bg); padding: 12px 14px;
    border-radius: var(--radius-sm); border: 1px solid var(--border-light);
    font-family: monospace; font-size: 14px; user-select: all;
    word-break: break-all; cursor: pointer;
  }
  .badge {
    display: inline-block; padding: 3px 10px;
    border-radius: 999px; font-size: 11px; font-weight: 600;
  }
  .badge-green { background: var(--accent-dim); color: var(--accent); }
  .badge-gray { background: var(--surface-2); color: var(--text-3); }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th {
    text-align: left; padding: 10px 12px;
    color: var(--text-3); font-weight: 500; font-size: 11px;
    text-transform: uppercase; letter-spacing: .05em;
    border-bottom: 1px solid var(--border);
  }
  td { padding: 12px; border-bottom: 1px solid var(--surface-2); }
  tr:hover td { background: var(--surface-2); }
  .hint { font-size: 12px; color: var(--text-3); margin-top: 10px; line-height: 1.8; }
  .success { color: var(--accent); }
  .error { color: var(--danger); }
`;

export function shell(title: string, body: string, extraCss = ""): string {
  return `<!DOCTYPE html>
<html lang="zh-CN" class="publy-web"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>${BASE_CSS}${extraCss}${WEB_CSS}</style>
</head><body>${body}<script>${WEB_JS}</script></body></html>`;
}

export function purchasePage(publicIp = "你的服务器公网 IP"): string {
  const body = `
<div style="max-width:560px;margin:0 auto;padding:48px 20px 64px">
  <div style="text-align:center;margin-bottom:36px">
    <div style="font-size:28px;font-weight:700;margin-bottom:4px">Publy</div>
    <div style="font-size:13px;color:var(--text-3)">agent 时代的公众号发布管线</div>
  </div>

  <div class="card">
    <h3>选择套餐</h3>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:4px">
      <div class="plan" data-plan="personal" data-months="1">
        <div style="font-size:12px;color:var(--text-2)">个人 Personal · 月付</div>
        <div style="font-size:26px;font-weight:700;margin:6px 0">¥29</div>
        <div style="font-size:11px;color:var(--text-3)">1 账号 · 30 次发布/月</div>
      </div>
      <div class="plan" data-plan="personal" data-months="12">
        <div style="font-size:12px;color:var(--text-2)">个人 Personal · 年付</div>
        <div style="font-size:26px;font-weight:700;margin:6px 0">¥290</div>
        <div style="font-size:11px;color:var(--text-3)">同月付 · 折合 ¥24.2/月</div>
      </div>
      <div class="plan" data-plan="studio" data-months="1">
        <div style="font-size:12px;color:var(--text-2)">工作室 Studio · 月付</div>
        <div style="font-size:26px;font-weight:700;margin:6px 0">¥79</div>
        <div style="font-size:11px;color:var(--text-3)">3 账号 · 150 次发布/月</div>
      </div>
      <div class="plan" data-plan="studio" data-months="12">
        <div style="font-size:12px;color:var(--text-2)">工作室 Studio · 年付</div>
        <div style="font-size:26px;font-weight:700;margin:6px 0">¥790</div>
        <div style="font-size:11px;color:var(--text-3)">同月付 · 折合 ¥65.8/月</div>
      </div>
    </div>
    <label style="margin-top:18px">联系方式（订单关联与找回）</label>
    <input id="contact" placeholder="邮箱 / 手机号 / 微信号">
    <button id="buy" disabled style="width:100%;margin-top:18px">选择套餐后支付</button>
    <div class="msg" id="msg"></div>
  </div>

  <div class="card" id="key-card" style="display:none">
    <h3>🎉 开通成功</h3>
    <label>你的 API key</label>
    <div class="key-box" id="user-key"></div>
    <label style="margin-top:14px">接入命令</label>
    <div class="key-box" id="setup-cmd"></div>
    <div id="bind-section" style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border)">
      <h3 style="border:0;padding:0;margin:0 0 4px">绑定公众号（自助，2 分钟）</h3>
      <label>AppID</label><input id="bind-appid" placeholder="wx 开头">
      <label>AppSecret</label><input id="bind-secret" placeholder="重置后复制">
      <label>账号名</label><input id="bind-name" placeholder="默认用 AppID">
      <button class="btn" style="width:100%;margin-top:14px" onclick="bindAccount()">验证并绑定</button>
      <div class="msg" id="bind-msg"></div>
    </div>
  </div>

  <details class="card">
    <summary style="cursor:pointer;font-weight:600;font-size:14px">📘 首次绑定前：添加 IP 白名单</summary>
    <ol style="margin:14px 0 4px 18px;line-height:2.2;font-size:13px;color:var(--text-2)">
      <li>登录 <a href="https://mp.weixin.qq.com" target="_blank">mp.weixin.qq.com</a> → <b>设置与开发</b> → <b>基本配置</b></li>
      <li>找到 <b>IP 白名单</b> → 修改 → 添加：
        <div class="key-box" style="cursor:pointer;margin:6px 0" onclick="navigator.clipboard.writeText('${publicIp}');this.style.borderColor='var(--accent)'" title="点击复制">${publicIp}</div>
      </li>
      <li>同页面 <b>开发者密码</b> → 重置 → 扫码 → 复制（只显示一次）</li>
    </ol>
    <p style="font-size:12px;color:var(--text-3);margin-top:8px">以后发布报 40164 = IP 白名单需要更新，错误信息里会给 IP。</p>
  </details>

  <div class="card">
    <label>找回 key：输入购买时的联系方式</label>
    <div style="display:flex;gap:8px"><input id="lk-contact" placeholder="联系方式"><button id="lookup" class="btn btn-ghost" style="width:auto;margin:0;padding:10px 16px">查询</button></div>
    <div class="msg" id="lk-msg"></div>
  </div>

  <div style="text-align:center;margin-top:28px;font-size:12px;color:var(--text-3);line-height:2">
    CLI / 自托管全功能免费 · 公开托管开售前，本页仅用于内部与试点结算<br>
    仅走微信公众号官方 API · AppSecret 加密存储永不下发<br>
    <a href="https://github.com/turlamai/publy">GitHub</a> · <a href="https://themes.publy.jrtx.site">主题画廊</a> · <a href="https://publy.jrtx.site">publy.jrtx.site</a>
  </div>
</div>
<script>
var plan = null, months = 0, userKey = '';
var PRICE = { 'personal': { 1: 29, 12: 290 }, 'studio': { 1: 79, 12: 790 } };
document.querySelectorAll('.plan').forEach(function (el) {
  el.onclick = function () {
    document.querySelectorAll('.plan').forEach(function (p) { p.classList.remove('sel'); });
    el.classList.add('sel');
    plan = el.dataset.plan; months = +el.dataset.months;
    var b = document.getElementById('buy'); b.disabled = false;
    b.textContent = '支付 ¥' + PRICE[plan][months];
  };
});
document.querySelectorAll('.plan')[0].classList.add('sel');
plan = 'personal'; months = 1;
document.getElementById('buy').disabled = false;
document.getElementById('buy').textContent = '支付 ¥29';

function show(id, html) { var el = document.getElementById(id); el.style.display = 'block'; el.innerHTML = html; }
function pollKey(orderId, btn, interval) {
  var timer = setInterval(async function () {
    var o = await (await fetch('/order/' + orderId)).json();
    if (o.status === 'paid') {
      clearInterval(timer);
      userKey = o.apiKey;
      document.getElementById('user-key').textContent = o.apiKey;
      document.getElementById('setup-cmd').textContent = 'publy config set server ' + location.origin + '\\npubly config set api_key ' + o.apiKey;
      document.getElementById('key-card').style.display = 'block';
      document.getElementById('bind-section').style.display = 'block';
      show('msg', '');
      btn.textContent = '已开通';
    }
  }, interval);
}
document.getElementById('buy').onclick = async function () {
  var contact = document.getElementById('contact').value.trim();
  if (!contact) return show('msg', '请先填写联系方式');
  var b = document.getElementById('buy'); b.disabled = true; b.textContent = '正在创建订单…';
  try {
    var r = await fetch('/purchase', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contact: contact, plan: plan, months: months }) });
    var d = await r.json();
    if (d.qrDataUrl) {
      var remark = String(d.orderId).slice(-6).toUpperCase();
      show('msg', '请用支付宝扫码支付 ¥' + PRICE[plan][months] + '，备注编号 ' + remark + '。管理员确认后本页自动开通。\\n\\n<img src="' + d.qrDataUrl + '" style="width:260px;background:var(--card);padding:10px;border-radius:10px">');
      pollKey(d.orderId, b, 3000);
    } else if (d.payUrl) {
      show('msg', '订单已创建，<a href="' + d.payUrl + '" target="_blank">点击完成支付</a>。支付完成后本页自动显示 key。');
      pollKey(d.orderId, b, 2500);
    } else if (d.manual) {
      show('msg', '订单已提交（' + d.orderId + '）。支付通道未开启，请联系管理员。');
    } else {
      show('msg', '创建失败：' + (d.message || d.code || r.status)); b.disabled = false;
    }
  } catch (e) { show('msg', '网络错误：' + e.message); b.disabled = false; }
};
document.getElementById('lookup').onclick = async function () {
  var c = document.getElementById('lk-contact').value.trim();
  if (!c) return show('lk-msg', '请输入联系方式');
  var r = await (await fetch('/lookup?contact=' + encodeURIComponent(c))).json();
  show('lk-msg', r.keys && r.keys.length
    ? r.keys.map(function (k) { return '<div class="key">publy_' + '\\u2022'.repeat(20) + k.slice(-4) + '</div>'; }).join('')
    : '未找到该联系方式的订单');
};
async function bindAccount() {
  var g = function (id) { return document.getElementById(id); };
  var appId = g('bind-appid').value, secret = g('bind-secret').value, name = g('bind-name').value;
  if (!appId || !secret) return show('bind-msg', '请填写 AppID 和 AppSecret');
  var out = g('bind-msg'); out.style.display = 'block';
  out.textContent = '验证中…（服务器会真实调用一次微信 API）';
  try {
    var r = await fetch('/v1/bind', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': userKey },
      body: JSON.stringify({ appId: appId, appSecret: secret, accountName: name }) });
    var d = await r.json();
    if (d.ok) {
      out.innerHTML = '<span class="success">✅ 绑定成功！账号名: ' + d.accountName + '</span>\\n现在可以用 publy publish 发布了';
    } else if (d.code === 'NEEDS_WHITELIST') {
      out.innerHTML = '<span class="error">❌ IP 未加白名单：请在公众号后台添加 <b>' + (d.ip || 'IP') + '</b> 后重试</span>';
    } else {
      out.textContent = '❌ ' + (d.message || d.code || r.status);
    }
  } catch (e) { out.textContent = '网络错误: ' + e.message; }
}
</script>`.replace(/\$\{contact\}/g, "${contact}");
  return shell("Publy · 购买", body);
}

/** Hosted purchase page. It is intentionally usable only when a Commerce
 * checkout is configured; the disabled state is explicit, never a fake pay
 * button. Payment confirmation still happens through Commerce/Permit. */
export function hostedPurchasePage(available: boolean, publicUrl?: string, direct = false): string {
  if (direct) return hostedDirectPurchasePage(available);
  const offers = (Object.entries(HOSTED_OFFERS) as Array<[HostedOfferId, (typeof HOSTED_OFFERS)[HostedOfferId]]>)
    .map(([id, offer], index) => `
      <label class="plan">
        <input type="radio" name="offer" value="${id}" ${index === 0 ? "checked" : ""}>
        <span class="plan-name">${offer.label}</span>
        <span class="plan-price">${formatFen(offer.fen)}</span>
        <span class="plan-meta">${offer.plan === "studio" ? "多账号与更高额度" : "个人写作与排程"} · 一次性支付</span>
      </label>`).join("");
  return `<!doctype html><html lang="zh-CN" class="publy-web"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Publy 托管投递 · 开通</title>
<style>
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif}
.wrap{max-width:860px;margin:0 auto;padding:40px 22px 70px}a{color:var(--green)}h1{font:600 34px/1.2 var(--sans);margin:8px 0 10px}
.lead{color:var(--muted);max-width:600px}.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:24px;margin-top:22px}
.notice{border:1px solid #ecd6a6;background:var(--amber-tint);color:var(--amber);border-radius:12px;padding:14px 16px;font-size:13px;margin-top:20px}
.notice.ok{border-color:#cfe3cd;background:var(--tint);color:var(--green)}
.plans{display:grid;grid-template-columns:1fr 1fr;gap:10px}.plan{border:1px solid var(--line);border-radius:12px;padding:14px;display:grid;grid-template-columns:auto 1fr auto;gap:4px 10px;align-items:center;cursor:pointer}
.plan input{margin:0}.plan-name{font-weight:650;font-size:13px}.plan-price{font-weight:750;font-size:15px}.plan-meta{grid-column:2 / 4;color:var(--muted);font-size:12px}
label.field{display:block;margin-top:16px;font-size:12px;color:var(--muted)}input[type=text]{width:100%;margin-top:6px;padding:10px 12px;border:1px solid var(--line);border-radius:9px;font:inherit;background:var(--card)}
button{border:0;border-radius:10px;background:var(--green);color:#fff;font:inherit;font-weight:650;padding:11px 18px;cursor:pointer;margin-top:18px}button:disabled{opacity:.55;cursor:not-allowed}
#msg{font-size:13px;margin-top:12px;color:var(--muted)}#msg.err{color:var(--danger)}
.small{font-size:12px;color:var(--muted);margin-top:16px}.steps{margin:12px 0 0;padding-left:20px;color:var(--muted);font-size:13px}.steps li{margin:2px 0}.steps a{color:var(--green)}.small li{margin:4px 0}.foot{margin-top:28px;font-size:12px;color:var(--muted)}
@media(max-width:560px){.plans{grid-template-columns:1fr}h1{font-size:27px}}
${WEB_CSS}</style></head><body><div class="wrap">
<a href="https://publy.jrtx.site/">← Publy</a>
<h1>托管投递，按需开通。</h1>
<p class="lead">Publy 只把 Markdown 变成你公众号里的草稿，不群发、不公开发布。托管版负责稳定出口、凭据保管、排程和未知结果恢复。</p>
<ol class="steps"><li>填写联系方式，点下方按钮开户</li><li>支付宝扫码支付 ¥29，当月自动生效</li><li>按教程把 API Key 填进插件、绑定公众号，发出第一篇草稿</li></ol>
${available ? `<div class="notice ok">支付通道已配置。付款成功后，服务权益由 Commerce/Permit 确认；支付返回页本身不代表已开通。</div>` :
  `<div class="notice">支付通道正在接入，暂不可购买。当前可以先使用免费的自托管路径：<a href="https://publy.jrtx.site/start.html">开始使用</a>。</div>`}
${available ? `<form class="card" id="buy" >
  <div class="plans">${offers}</div>
  <label class="field">联系方式（邮箱或手机号，用于开户与对账）
    <input type="text" id="contact" name="contact" autocomplete="email" placeholder="you@example.com" required>
  </label>
  <button type="submit" id="pay">去支付宝付款</button>
  <div id="msg" role="status" aria-live="polite"></div>
</form>` : ""}
<div class="card">
  <strong>付款前请确认</strong>
  <ul class="small">
    <li>Publy 只创建草稿，最终发布仍由你在微信后台完成。</li>
    <li>先核对公众号的官方草稿接口权限，再<a href="/setup">连接公众号、复制本服务出口 IP</a>。<a href="https://publy.jrtx.site/wechat.html?lang=zh">白名单手把手教程</a>。</li>
    <li>额度按账号、按自然月计算；退款与到期规则以服务条款为准。</li>
    <li>开户后会生成 API key（付款前即可拿到）；请像密码一样保管，不要发到公开渠道。</li>
  </ul>
</div>
<p class="foot"><a href="/setup">连接公众号</a> · <a href="https://publy.jrtx.site/wechat.html?lang=zh">首次使用与恢复</a> · 运营者：Publy · <a href="https://github.com/turlamai/publy/blob/main/PRICING.md">定价与服务说明</a> · <a href="https://publy.jrtx.site/terms.html?lang=zh">服务条款</a> · <a href="https://publy.jrtx.site/privacy.html?lang=zh">隐私说明</a></p>
</div>
<script>
var KEY = 'publy_hosted_api_key';
var form = document.getElementById('buy'), msg = document.getElementById('msg'), button = document.getElementById('pay');
function say(text, bad) { msg.textContent = text; msg.className = bad ? 'err' : ''; }
function post(url, body, apiKey) {
  return fetch(url, { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, apiKey ? { 'x-api-key': apiKey } : {}), body: JSON.stringify(body) });
}
if (form) form.addEventListener('submit', async function (event) {
  event.preventDefault();
  button.disabled = true;
  say('正在创建订单…');
  try {
    var contact = document.getElementById('contact').value.trim();
    var apiKey = sessionStorage.getItem(KEY);
    if (!apiKey) {
      var signup = await post('/v1/signup', { contact: contact });
      var account = await signup.json();
      if (signup.status === 409) throw new Error('该联系方式已开户；如已购买，请联系运营者找回 key。');
      if (!signup.ok) throw new Error(account.message || account.code || '开户失败');
      apiKey = account.apiKey;
      sessionStorage.setItem(KEY, apiKey);
    }
    var offer = form.querySelector('input[name=offer]:checked').value;
    // Reuse one request id across transport/unknown-outcome retries; a new id
    // could create a second order for the same purchase intent.
    var requestKey = 'publy_hosted_request:' + offer;
    var requestId = sessionStorage.getItem(requestKey);
    if (!requestId) {
      requestId = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2)).replace(/-/g, '');
      sessionStorage.setItem(requestKey, requestId);
    }
    var response = await post('/v1/hosted/checkout', { offer: offer, requestId: requestId }, apiKey);
    var result = await response.json();
    if (response.status !== 200 || result.status !== 'ready') throw new Error(result.message || result.code || '支付通道暂不可用');
    var pay = document.createElement('form');
    pay.method = 'POST'; pay.action = result.gateway;
    Object.keys(result.fields).forEach(function (name) {
      var input = document.createElement('input'); input.type = 'hidden'; input.name = name; input.value = result.fields[name]; pay.appendChild(input);
    });
    document.body.appendChild(pay); pay.submit();
  } catch (error) {
    button.disabled = false;
    say(error.message, true);
  }
});
</script><script>${WEB_JS}</script></body></html>`;
}

/** Small result page for the hosted return. It never includes credentials or
 * payment parameters; the server has already re-checked Commerce/Permit. */
export function hostedResultPage(title: string, message: string, ok: boolean): string {
  return `<!doctype html><html lang="zh-CN" class="publy-web"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · Publy</title><style>body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.7 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}
main{max-width:620px;margin:12vh auto;padding:0 22px}h1{font:600 30px/1.2 var(--sans);margin:0 0 10px}p{color:var(--muted)}
.card{background:var(--card);border:1px solid #dce5d9;border-radius:14px;padding:24px;margin-top:18px}.ok{border-color:var(--line);background:var(--tint)}
a{color:#176842}${WEB_CSS}</style></head><body><main><h1>${escapeHtml(title)}</h1><div class="card ${ok ? "ok" : ""}"><p>${escapeHtml(message)}</p></div>
<p style="margin-top:18px"><a href="https://publy.jrtx.site/start.html">返回使用指南</a> · <a href="/hosted">账户与权益</a> · <a href="/setup">连接公众号</a></p></main><script>${WEB_JS}</script></body></html>`;
}

function hostedDirectPurchasePage(available: boolean): string {
  if (!available) return hostedPurchasePage(false);
  return `<!doctype html><html lang="zh-CN" class="publy-web"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Publy 托管版 · ¥29/月</title>
<style>
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif}
.wrap{max-width:680px;margin:0 auto;padding:40px 22px 70px}a{color:var(--green)}h1{font:600 30px/1.25 var(--sans);margin:8px 0 10px}
.lead{color:var(--muted)}.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:24px;margin-top:20px}
label.field{display:block;margin-top:16px;font-size:12px;color:var(--muted)}input[type=text],input[type=password]{width:100%;margin-top:6px;padding:10px 12px;border:1px solid var(--line);border-radius:8px;font:inherit;background:var(--card)}
button{border:0;border-radius:8px;background:var(--green);color:var(--on-accent);font:inherit;font-weight:650;padding:11px 18px;cursor:pointer;margin-top:18px}button:disabled{opacity:.55;cursor:not-allowed}
#msg{font-size:13px;margin-top:12px;color:var(--muted)}#msg.err{color:var(--danger)}
.small{font-size:12px;color:var(--muted);margin-top:14px}.small li{margin:4px 0}.foot{margin-top:28px;font-size:12px;color:var(--muted)}
#direct-qr{max-width:100%;height:auto}input{min-height:44px}
input:focus-visible,button:focus-visible,a:focus-visible{outline:2px solid var(--green);outline-offset:3px}
#copy-key,#refresh{background:transparent;color:var(--green);border:1px solid var(--line);font-weight:500;min-height:44px}
[hidden]{display:none!important}
${WEB_CSS}</style></head><body><div class="wrap">
<a href="https://publy.jrtx.site/">← Publy</a>
<h1>托管版 Personal · ¥29 / 月</h1>
<p class="lead">在 Obsidian 里写完，草稿一键直达公众号草稿箱：排版、图片上传、白名单、凭据保管、失败恢复全部由托管服务处理。每月含 30 次成功投递，只创建草稿，不群发。</p>
<form class="card" id="buy">
  <label class="field" for="contact">联系方式（仅首次开户填写，用于找回账户）
    <input type="text" id="contact" name="contact" autocomplete="email" placeholder="you@example.com">
  </label>
  <div id="restore-block" hidden>
    <label class="field" for="existingKey" id="restore-label">已有账户 API Key（用于恢复同一账户）</label><input type="password" id="existingKey" autocomplete="off"><button type="button" id="copy-key" disabled>复制 API Key 并妥善保存</button>
  </div>
  <button type="submit" id="pay">扫码支付 ¥29</button>
  <p class="small">付款后自动开通，退款即撤销权益。<a href="#" id="restore-toggle">已有账户？用 API Key 恢复</a></p>
  <div id="msg" role="status" aria-live="polite"></div><section id="direct-result" hidden><p id="direct-state"></p><img id="direct-qr" alt="支付宝购买二维码" width="240" height="240"><p><button type="button" id="refresh">已完成付款，刷新权益</button></p></section>
</form>
<div class="card">
  <strong>付款后，三步发出第一篇草稿</strong>
  <ul class="small">
    <li>复制上方 API Key，填进 <a href="https://publy.jrtx.site/start.html?lang=zh">Obsidian 插件或 CLI</a>。</li>
    <li>在 <a href="/setup">连接页</a>绑定公众号，把服务出口 IP 加进微信白名单（<a href="https://publy.jrtx.site/wechat.html?lang=zh">手把手教程</a>）。</li>
    <li>在 Obsidian 里发送草稿，到微信草稿箱确认。</li>
  </ul>
</div>
<p class="foot"><a href="https://publy.jrtx.site/">首页</a> · <a href="/setup">连接公众号</a> · <a href="https://publy.jrtx.site/terms.html?lang=zh">服务条款</a> · <a href="https://publy.jrtx.site/privacy.html?lang=zh">隐私说明</a> · 运营者：Publy</p>
</div>
<script>
var KEY = 'publy_hosted_api_key';
var form = document.getElementById('buy'), msg = document.getElementById('msg'), button = document.getElementById('pay');
var section = document.getElementById('direct-result'), state = document.getElementById('direct-state'), qr = document.getElementById('direct-qr');
var apiKey = '', timer, revision = 0;
try { apiKey = sessionStorage.getItem(KEY) || ''; } catch (_) {}
document.getElementById('existingKey').value = apiKey;
document.getElementById('copy-key').disabled = !apiKey;
if (apiKey) { document.getElementById('restore-block').hidden = false; }
document.getElementById('restore-toggle').addEventListener('click', function (e) {
  e.preventDefault();
  var block = document.getElementById('restore-block');
  block.hidden = !block.hidden;
  if (!block.hidden) document.getElementById('existingKey').focus();
});
document.getElementById('existingKey').addEventListener('input', function () {
  revision++; clearTimeout(timer); apiKey = ''; section.hidden = true; qr.hidden = true; qr.removeAttribute('src');
  var link = document.getElementById('purchase-link'); if (link) link.remove();
  document.getElementById('copy-key').disabled = !this.value.trim();
  say('账户凭据已更改，请重新查看权益。');
});
function say(text, bad) { msg.textContent = text; msg.className = bad ? 'err' : ''; }
async function post(url, body) {
  var response = await fetch(url, { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, apiKey ? { 'x-api-key': apiKey } : {}), body: JSON.stringify(body) });
  var value = await response.json();
  if (!response.ok) throw new Error(value.code === 'UNAUTHORIZED' ? 'API Key 无效，请检查账户凭据。' : '当前无法确认权益，请稍后刷新。');
  return value;
}
async function refresh() {
  if (!apiKey) return;
  var current = revision;
  clearTimeout(timer); button.disabled = true;
  try {
    var result = await post('/v1/hosted/status', {});
    if (current !== revision) return;
    section.hidden = false; qr.hidden = true;
    var oldLink = document.getElementById('purchase-link'); if (oldLink) oldLink.remove();
    if (result.status === 'active') {
      state.textContent = '已开通 Personal 月包，有效期至 ' + new Date(result.validUntil).toLocaleString() + '。有效期内无需再次购买。';
      say('请保存你的 API Key，用于 CLI、插件或换设备恢复账户。');
    } else {
      state.textContent = '尚未开通。¥29 / 一个月，不自动续费。';
      if (result.qrDataUrl) { qr.src = result.qrDataUrl; qr.hidden = false; }
      if (result.purchaseUrl) {
        var link = document.createElement('a'); link.id = 'purchase-link'; link.textContent = '打开支付宝购买'; link.href = result.purchaseUrl;
        link.rel = 'noopener noreferrer'; link.target = '_blank'; section.appendChild(link);
      }
      say(result.purchaseUrl || result.qrDataUrl ? '请在支付宝确认商品与金额；付款后返回此页刷新权益。' : '暂未开放购买，请稍后再试。');
    }
  } catch (error) { if (current === revision) say(error.message, true); }
  finally { button.disabled = false; }
}
if (form) form.addEventListener('submit', async function (event) {
  event.preventDefault(); button.disabled = true; var attempt = revision;
  try {
    apiKey = document.getElementById('existingKey').value.trim();
    if (!apiKey) {
      var contact = document.getElementById('contact').value.trim();
      if (!contact) throw new Error('首次开户请填写联系方式；已有账户请填写 API Key。');
      var response = await fetch('/v1/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ contact: contact }) });
      var account = await response.json();
      if (!response.ok) throw new Error(response.status === 409 ? '此联系方式已开户，请使用原 API Key 恢复账户。' : '暂时无法开户，请稍后重试。');
      if (attempt !== revision) return;
      apiKey = account.apiKey;
    }
    await post('/v1/hosted/session', {});
    if (attempt !== revision) return;
    try { sessionStorage.setItem(KEY, apiKey); } catch (_) {}
    document.getElementById('existingKey').value = apiKey;
    document.getElementById('copy-key').disabled = false;
    document.getElementById('restore-block').hidden = false;
    document.getElementById('restore-label').textContent = '你的 API Key（复制并妥善保存，换设备恢复要用）';
    await refresh();
    var checks = 0;
    async function poll() {
      if (attempt !== revision) return;
      if (document.visibilityState === 'visible') await refresh();
      if (++checks < 12) timer = setTimeout(poll, 10000);
    }
    if (attempt === revision) timer = setTimeout(poll, 10000);
  } catch (error) { if (attempt === revision) say(error.message, true); }
  finally { button.disabled = false; }
});
var refreshButton = document.getElementById('refresh');
if (refreshButton) refreshButton.addEventListener('click', refresh);

var copy = document.getElementById("copy-key"); if (copy) copy.addEventListener("click", async function () { try { var value = document.getElementById("existingKey").value.trim(); if (!value) { say("还没有 API Key，请先开户或恢复账户。", true); return; } await navigator.clipboard.writeText(value); say("已复制，请保存在密码管理器中。"); } catch (_) { say("请手动复制 API Key 并妥善保存。"); } });
</script><script>${WEB_JS}</script></body></html>`;
}

