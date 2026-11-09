// Storefront (purchase) + admin console pages.
import { HOSTED_OFFERS, formatFen, type HostedOfferId } from "./hosted-offers.js";
//
// Design system: matches the publy.jrtx.site family — dark bg, green accent,
// generous spacing, clean typography. The shared <style> is embedded in both
// pages so the two always look like the same product.

const BASE_CSS = `
  :root {
    --bg: #0d0d0d;
    --surface: #171717;
    --surface-2: #1f1f1f;
    --border: #2a2a2a;
    --border-light: #333;
    --text: #ececec;
    --text-2: #aaa;
    --text-3: #777;
    --accent: #07C160;
    --accent-hover: #06ad56;
    --accent-dim: rgba(7,193,96,.08);
    --danger: #f87171;
    --radius: 10px;
    --radius-sm: 6px;
  }
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
    background: var(--accent); color: #fff;
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
<html lang="zh"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>${BASE_CSS}${extraCss}</style>
</head><body>${body}</body></html>`;
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
      show('msg', '请用支付宝扫码支付 ¥' + PRICE[plan][months] + '，备注编号 ' + remark + '。管理员确认后本页自动开通。\\n\\n<img src="' + d.qrDataUrl + '" style="width:260px;background:#fff;padding:10px;border-radius:10px">');
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
export function hostedPurchasePage(available: boolean, publicUrl?: string): string {
  const offers = (Object.entries(HOSTED_OFFERS) as Array<[HostedOfferId, (typeof HOSTED_OFFERS)[HostedOfferId]]>)
    .map(([id, offer], index) => `
      <label class="plan">
        <input type="radio" name="offer" value="${id}" ${index === 0 ? "checked" : ""}>
        <span class="plan-name">${offer.label}</span>
        <span class="plan-price">${formatFen(offer.fen)}</span>
        <span class="plan-meta">${offer.plan === "studio" ? "多账号与更高额度" : "个人写作与排程"} · 一次性支付</span>
      </label>`).join("");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Publy 托管投递 · 开通</title>
<style>
:root{--ink:#16271e;--muted:#5d6d64;--line:#dce5d9;--green:#176842;--tint:#eef5ec;--amber:#8a5a12}
*{box-sizing:border-box}body{margin:0;background:#f7f8f4;color:var(--ink);font:15px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif}
.wrap{max-width:860px;margin:0 auto;padding:40px 22px 70px}a{color:var(--green)}h1{font:500 34px/1.2 Georgia,serif;margin:8px 0 10px}
.lead{color:var(--muted);max-width:600px}.card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:24px;margin-top:22px}
.notice{border:1px solid #ecd6a6;background:#fdf3e2;color:var(--amber);border-radius:12px;padding:14px 16px;font-size:13px;margin-top:20px}
.notice.ok{border-color:#cfe3cd;background:var(--tint);color:var(--green)}
.plans{display:grid;grid-template-columns:1fr 1fr;gap:10px}.plan{border:1px solid var(--line);border-radius:12px;padding:14px;display:grid;grid-template-columns:auto 1fr auto;gap:4px 10px;align-items:center;cursor:pointer}
.plan input{margin:0}.plan-name{font-weight:650;font-size:13px}.plan-price{font-weight:750;font-size:15px}.plan-meta{grid-column:2 / 4;color:var(--muted);font-size:12px}
label.field{display:block;margin-top:16px;font-size:12px;color:var(--muted)}input[type=text]{width:100%;margin-top:6px;padding:10px 12px;border:1px solid var(--line);border-radius:9px;font:inherit;background:#fff}
button{border:0;border-radius:10px;background:var(--green);color:#fff;font:inherit;font-weight:650;padding:11px 18px;cursor:pointer;margin-top:18px}button:disabled{opacity:.55;cursor:not-allowed}
#msg{font-size:13px;margin-top:12px;color:var(--muted)}#msg.err{color:#a3341f}
.small{font-size:12px;color:var(--muted);margin-top:16px}.small li{margin:4px 0}.foot{margin-top:28px;font-size:12px;color:var(--muted)}
@media(max-width:560px){.plans{grid-template-columns:1fr}h1{font-size:27px}}
</style></head><body><div class="wrap">
<a href="https://publy.jrtx.site/">← Publy</a>
<h1>托管投递，按需开通。</h1>
<p class="lead">Publy 只把 Markdown 变成你公众号里的草稿，不群发、不公开发布。托管版负责稳定出口、凭据保管、排程和未知结果恢复。</p>
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
    <li>托管需要你的公众号 AppID 与 AppSecret，以及把本服务出口 IP 加入微信白名单。</li>
    <li>额度按账号、按自然月计算；退款与到期规则以服务条款为准。</li>
    <li>开户后会生成 API key（付款前即可拿到）；请像密码一样保管，不要发到公开渠道。</li>
  </ul>
</div>
<p class="foot">运营者：Publy 自托管项目 · <a href="https://github.com/turlamai/publy/blob/main/PRICING.md">定价与服务说明</a> · <a href="https://github.com/turlamai/publy/blob/main/docs/terms.md">服务条款</a></p>
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
</script></body></html>`;
}

/** Small result page for the hosted return. It never includes credentials or
 * payment parameters; the server has already re-checked Commerce/Permit. */
export function hostedResultPage(title: string, message: string, ok: boolean): string {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · Publy</title><style>body{margin:0;background:#f7f8f4;color:#16271e;font:16px/1.7 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}
main{max-width:620px;margin:12vh auto;padding:0 22px}h1{font:500 30px/1.2 Georgia,serif;margin:0 0 10px}p{color:#5d6d64}
.card{background:#fff;border:1px solid #dce5d9;border-radius:14px;padding:24px;margin-top:18px}.ok{border-color:#cfe3cd;background:#eef5ec}
a{color:#176842}</style></head><body><main><h1>${title}</h1><div class="card ${ok ? "ok" : ""}"><p>${message}</p></div>
<p style="margin-top:18px"><a href="https://publy.jrtx.site/start.html">返回使用指南</a> · <a href="/hosted">购买页</a></p></main></body></html>`;
}
