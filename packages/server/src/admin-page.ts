// Admin console — a zero-dependency single-page operator tool.
//
// Five tabs: overview, users, orders, accounts, and a LIVE feed wired to
// the publy-ws event gateway (same admin key). Auth is the admin key in
// sessionStorage; every data call carries it as x-api-key.

import { shell } from "./pages.js";

export function adminPage(): string {
  const body = `
<div id="topbar">
  <div class="tb-inner">
    <div class="brand">Publy <span>Admin</span></div>
    <div class="tb-right">
      <span class="badge badge-green" id="conn-badge" style="display:none">实时已连接</span>
      <button class="btn btn-ghost btn-sm" id="logout">退出</button>
    </div>
  </div>
</div>
<div class="wrap">

<div class="card" id="login-card">
  <h3>操作员登录</h3>
  <label>Admin key（server.json 的 apiKey）</label>
  <div style="display:flex;gap:8px">
    <input id="key" type="password" style="flex:1" placeholder="粘贴后回车">
    <button class="btn" id="login-btn">进入</button>
  </div>
  <div class="hint">仅限自托管运营者。请通过 HTTPS 或可信私有网络访问；密钥保存在本标签页的会话存储中。公开托管和收款尚未开放。</div>
</div>

<div id="app" style="display:none">
  <nav class="tabs" id="tabs">
    <button data-tab="overview" class="tab active">概览</button>
    <button data-tab="users" class="tab">用户</button>
    <button data-tab="orders" class="tab">订单</button>
    <button data-tab="accounts" class="tab">账号</button>
    <button data-tab="feed" class="tab">动态</button>
  </nav>

  <section id="tab-overview" class="panel">
    <div class="stat-grid" id="stat-grid"></div>
    <div class="card">
      <h3>服务管理</h3>
      <p class="hint">笔记仍在原来的文件夹或 Obsidian 笔记库中管理；公众号草稿请在微信后台查看。此处是自托管服务的开发期管理工具，订单功能仅用于历史数据及隔离测试。</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" onclick="switchTab('users')">开通 / 延期用户</button>
        <button class="btn btn-ghost btn-sm" onclick="switchTab('orders')">查看历史订单</button>
        <button class="btn btn-ghost btn-sm" onclick="switchTab('accounts')">绑定公众号</button>
        <button class="btn btn-ghost btn-sm" onclick="switchTab('feed')">实时动态</button>
      </div>
      <div class="hint">概览数据在切回本页时自动刷新。</div>
    </div>
  </section>

  <section id="tab-users" class="panel" style="display:none">
    <div class="card">
      <div class="card-head">
        <h3>用户</h3>
        <div style="display:flex;gap:8px;align-items:center">
          <input id="u-search" placeholder="搜索联系方式…" style="width:220px">
          <button class="btn btn-sm" id="mk-btn">开通 / 延期</button>
        </div>
      </div>
      <table><thead><tr>
        <th>联系方式</th><th>套餐</th><th>本月用量</th><th>到期</th><th>状态</th><th>API key</th><th style="text-align:right">操作</th>
      </tr></thead><tbody id="u-rows"></tbody></table>
    </div>
  </section>

  <section id="tab-orders" class="panel" style="display:none">
    <div class="card">
      <div class="card-head">
        <h3>历史 / 测试订单</h3>
        <select id="o-filter" style="width:auto">
          <option value="pending">待确认</option>
          <option value="paid">已支付</option>
          <option value="">全部</option>
        </select>
      </div>
      <table><thead><tr>
        <th>编号</th><th>联系方式</th><th>套餐</th><th>金额</th><th>渠道</th><th>时间</th><th style="text-align:right">操作</th>
      </tr></thead><tbody id="o-rows"></tbody></table>
    </div>
  </section>

  <section id="tab-accounts" class="panel" style="display:none">
    <div class="card">
      <div class="card-head">
        <h3>公众号账号</h3>
        <button class="btn btn-sm" id="acc-btn">新增账号</button>
      </div>
      <table><thead><tr>
        <th>账号名</th><th>AppID</th><th>归属</th><th>来源</th>
      </tr></thead><tbody id="a-rows"></tbody></table>
      <div class="hint">数据库账号的 AppSecret 是否加密取决于服务器密钥配置；server.json 中的账号凭据按配置文件原样保存。请保护配置和备份。</div>
    </div>
  </section>

  <section id="tab-feed" class="panel" style="display:none">
    <div class="card">
      <div class="card-head">
        <h3>实时动态 <span class="dot" id="ws-dot"></span><span id="ws-state" class="hint" style="margin:0">未连接</span></h3>
        <div style="display:flex;gap:8px;align-items:center">
          <input id="ws-url" style="width:280px" title="publy-ws 网关地址（改过端口就改这里，存 localStorage）">
          <button class="btn btn-sm btn-ghost" id="ws-reconnect">重连</button>
        </div>
      </div>
      <div id="feed" class="feed"><div class="empty">连接网关后，所有发布 / 支付 / 绑定事件实时出现在这里。</div></div>
      <div class="hint">网关 = publy-ws 进程（默认端口 = API 端口 + 1）。没开网关时这里只是安静的列表。</div>
    </div>
  </section>
</div>
</div>

<div id="modal-mask" style="display:none">
  <div class="modal" id="modal"></div>
</div>
<div id="toasts"></div>

<script>
'use strict';
/* ---------- infra ---------- */
var KEY = sessionStorage.getItem('publy_admin_key') || '';
var H = function (extra) {
  return Object.assign({ 'x-api-key': KEY }, extra || {});
};
async function api(url, opts) {
  var r = await fetch(url, Object.assign({}, opts || {}, { headers: H(opts && opts.headers) }));
  if (r.status === 401) { logout(); throw new Error('key 失效，请重新登录'); }
  return r;
}
function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
function toast(msg, kind) {
  var t = document.createElement('div');
  t.className = 'toast ' + (kind || '');
  t.textContent = msg;
  document.getElementById('toasts').appendChild(t);
  setTimeout(function () { t.classList.add('show'); }, 10);
  setTimeout(function () { t.classList.remove('show'); setTimeout(function () { t.remove(); }, 300); }, 3200);
}
var modalOpener = null;
function showModal() {
  modalOpener = document.activeElement;
  document.getElementById('modal-mask').style.display = 'flex';
  var focusTarget = document.querySelector('#modal input, #modal select, #modal button');
  if (focusTarget) focusTarget.focus();
}
function confirmBox(text, onYes) {
  var mask = document.getElementById('modal-mask'), m = document.getElementById('modal');
  m.innerHTML = '<h3>确认操作</h3><p>' + esc(text) + '</p>'
    + '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:18px">'
    + '<button class="btn btn-ghost btn-sm" id="cf-no">取消</button>'
    + '<button class="btn btn-sm btn-danger-solid" id="cf-yes">确认</button></div>';
  showModal();
  document.getElementById('cf-no').onclick = closeModal;
  document.getElementById('cf-yes').onclick = function () { closeModal(); onYes(); };
}
function closeModal() {
  document.getElementById('modal-mask').style.display = 'none';
  if (modalOpener && modalOpener.isConnected) modalOpener.focus();
  modalOpener = null;
}
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape' && document.getElementById('modal-mask').style.display !== 'none') closeModal();
});
document.getElementById('modal-mask').onclick = function (e) { if (e.target.id === 'modal-mask') closeModal(); };
function copyText(text, tip) {
  navigator.clipboard.writeText(text).then(function () { toast(tip || '已复制', 'ok'); },
    function () { toast('复制失败，请手动选择', 'err'); });
}
function relTime(ts) {
  if (!ts) return '—';
  var diff = (Date.now() - ts) / 1000;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前';
  if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前';
  return new Date(ts).toLocaleDateString();
}
function daysLeft(ts) { return Math.ceil((ts - Date.now()) / 86400000); }
function logout() {
  sessionStorage.removeItem('publy_admin_key'); KEY = '';
  wsDown();
  document.getElementById('key').value = '';
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-card').style.display = 'block';
}
function gv(id) { return document.getElementById(id).value.trim(); }

/* ---------- auth ---------- */
document.getElementById('login-btn').onclick = login;
document.getElementById('key').addEventListener('keydown', function (e) { if (e.key === 'Enter') login(); });
document.getElementById('logout').onclick = logout;
async function login() {
  KEY = gv('key');
  if (!KEY) return toast('请输入 key', 'err');
  try {
    var r = await fetch('/v1/admin/overview', { headers: H() });
    if (!r.ok) return toast(r.status === 401 ? 'key 不对' : '无法登录（HTTP ' + r.status + '）', 'err');
    sessionStorage.setItem('publy_admin_key', KEY);
    enter();
  } catch (e) { toast('网络错误：' + e.message, 'err'); }
}
function enter() {
  document.getElementById('login-card').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  loadOverview();
}

/* ---------- tabs ---------- */
var loaded = {};
function switchTab(name) {
  document.querySelectorAll('.tab').forEach(function (t) {
    t.classList.toggle('active', t.dataset.tab === name);
  });
  document.querySelectorAll('.panel').forEach(function (p) { p.style.display = 'none'; });
  document.getElementById('tab-' + name).style.display = 'block';
  if (name === 'overview') loadOverview();
  if (name === 'users') loadUsers();
  if (name === 'orders') loadOrders();
  if (name === 'accounts') loadAccounts();
  if (name === 'feed') wsEnsure();
}
document.querySelectorAll('.tab').forEach(function (t) {
  t.onclick = function () { switchTab(t.dataset.tab); };
});

/* ---------- overview ---------- */
async function loadOverview() {
  var d = await (await api('/v1/admin/overview')).json();
  var cards = [
    ['用户', d.users.total, d.users.pro + ' 个付费套餐生效' + (d.users.disabled ? ' · ' + d.users.disabled + ' 停用' : '')],
    ['本月发布', d.publishes.monthTotal, '全部用户合计'],
    ['待确认订单', d.orders.pending, d.orders.paid + ' 笔已支付 · 收入 ¥' + (d.orders.revenueFen / 100).toFixed(0)],
    ['公众号账号', d.accounts.total, '请保护凭据与备份'],
    ['今日事件', d.eventsToday, '审计流 24h 窗口']
  ];
  var g = document.getElementById('stat-grid');
  g.innerHTML = cards.map(function (c) {
    return '<div class="stat"><div class="stat-n">' + esc(c[1]) + '</div>'
      + '<div class="stat-t">' + esc(c[0]) + '</div><div class="stat-s">' + esc(c[2]) + '</div></div>';
  }).join('');
}

/* ---------- users ---------- */
var usersCache = [];
async function loadUsers() {
  var d = await (await api('/v1/admin/users')).json();
  usersCache = d.users;
  renderUsers();
}
function renderUsers() {
  var q = gv('u-search').toLowerCase();
  var tb = document.getElementById('u-rows');
  var list = usersCache.filter(function (u) { return !q || u.contact.toLowerCase().indexOf(q) >= 0; });
  if (!list.length) { tb.innerHTML = '<tr><td colspan="7" class="empty">' + (q ? '没有匹配的用户' : '还没有用户') + '</td></tr>'; return; }
  tb.innerHTML = list.map(function (u) {
    var exp = u.expiresAt
      ? new Date(u.expiresAt).toLocaleDateString() + ' <span class="dim">(剩 ' + daysLeft(u.expiresAt) + ' 天)</span>'
      : '—';
    var pct = Math.min(100, Math.round(u.used / Math.max(u.limit, 1) * 100));
    var bar = '<div class="bar"><div class="bar-in' + (pct >= 90 ? ' hot' : '') + '" style="width:' + pct + '%"></div></div>'
      + '<span class="dim">' + u.used + ' / ' + u.limit + '</span>';
    return '<tr><td><b>' + esc(u.contact) + '</b><div class="dim">' + relTime(u.createdAt) + ' 创建</div></td>'
      + '<td>' + (u.plan === 'free' ? '<span class="badge badge-gray">Free</span>' : '<span class="badge badge-green">' + (u.plan === 'studio' ? 'Studio' : 'Personal') + '</span>') + '</td>'
      + '<td>' + bar + '</td><td>' + exp + '</td>'
      + '<td>' + (u.disabled ? '<span class="badge badge-gray">已停用</span>' : '<span class="badge badge-green">正常</span>') + '</td>'
      + '<td><span class="key" data-k="' + esc(u.apiKey) + '" title="点击复制完整 key">' + esc(u.apiKey.slice(0, 10)) + '…' + esc(u.apiKey.slice(-4)) + '</span></td>'
      + '<td class="td-actions">'
      + '<button class="btn btn-ghost btn-sm" data-copy="' + esc(u.apiKey) + '">复制key</button> '
      + '<button class="btn btn-ghost btn-sm" data-ext="' + u.id + '">延期</button> '
      + '<button class="btn btn-ghost btn-sm" data-rot="' + u.id + '">换key</button> '
      + (u.disabled
        ? '<button class="btn btn-sm" data-dis="' + u.id + '">启用</button>'
        : '<button class="btn btn-sm btn-danger-solid" data-dis="' + u.id + '">停用</button>')
      + '</td></tr>';
  }).join('');
  tb.querySelectorAll('.key').forEach(function (k) {
    k.onclick = function () { copyText(k.dataset.k, '完整 key 已复制'); };
  });
  tb.querySelectorAll('[data-copy]').forEach(function (b) {
    b.onclick = function () { copyText(b.dataset.copy, '完整 key 已复制'); };
  });
  tb.querySelectorAll('[data-dis]').forEach(function (b) {
    b.onclick = function () {
      var target = usersCache.find(function (u) { return u.id === b.dataset.dis; });
      var toDisabled = !target.disabled;
      confirmBox('确定' + (toDisabled ? '停用' : '启用') + '用户「' + target.contact + '」？', async function () {
        var r = await api('/v1/admin/users/' + b.dataset.dis + '/disable', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ disabled: toDisabled })
        });
        if (!r.ok) return toast('操作未完成（HTTP ' + r.status + '）', 'err');
        toast(toDisabled ? '已停用' : '已启用', 'ok');
        loadUsers();
      });
    };
  });
  tb.querySelectorAll('[data-ext]').forEach(function (b) {
    b.onclick = function () {
      var target = usersCache.find(function (u) { return u.id === b.dataset.ext; });
      openExtend(target);
    };
  });
  tb.querySelectorAll('[data-rot]').forEach(function (b) {
    b.onclick = function () {
      var target = usersCache.find(function (u) { return u.id === b.dataset.rot; });
      confirmBox('为「' + target.contact + '」换发新 key？旧 key 立即失效（已配置的客户端需更新）。', async function () {
        var r = await api('/v1/admin/users/' + b.dataset.rot + '/rotate-key', { method: 'POST' });
        var d = await r.json();
        if (d.ok) {
          copyText(d.apiKey, '新 key 已生成并复制');
          loadUsers();
        } else {
          toast('换 key 失败：' + (d.message || d.code || r.status), 'err');
        }
      });
    };
  });
}
document.getElementById('u-search').addEventListener('input', renderUsers);

function openModal(html) {
  var mask = document.getElementById('modal-mask'), m = document.getElementById('modal');
  m.innerHTML = html;
  showModal();
}
function openExtend(target) {
  openModal('<h3>开通 / 延期</h3>'
    + '<label>联系方式（已存在自动延期）</label><input id="m-contact" value="' + esc(target ? target.contact : '') + '">'
    + '<label>套餐</label><select id="m-plan"><option value="personal">Personal</option><option value="studio">Studio</option><option value="free">Free（评估）</option></select>'
    + '<label>月数</label><input id="m-months" value="1">'
    + '<div class="msg" id="m-out"></div>'
    + '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:18px">'
    + '<button class="btn btn-ghost btn-sm" onclick="closeModal()">取消</button>'
    + '<button class="btn btn-sm" id="m-go">执行</button></div>');
  document.getElementById('m-go').onclick = async function () {
    var button = this, out = document.getElementById('m-out'), completed = false;
    button.disabled = true;
    out.style.display = 'block';
    out.textContent = '处理中…';
    try {
      var r = await api('/v1/admin/users', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contact: gv('m-contact'), plan: gv('m-plan'), months: +gv('m-months') })
      });
      var d = await r.json();
      if (r.ok && d.apiKey) {
        completed = true;
        out.innerHTML = '<span class="success">' + (d.extended ? '已延期，到期 ' : '已开通，key: ') + '</span>'
          + (d.extended ? esc(d.expiresAt ? new Date(d.expiresAt).toLocaleDateString() : '') : '<span class="key" data-k2="' + esc(d.apiKey) + '">' + esc(d.apiKey) + '</span>');
        var k = document.querySelector('[data-k2]');
        if (k) k.onclick = function () { copyText(k.dataset.k2, '完整 key 已复制'); };
        loadUsers();
      } else {
        out.textContent = '操作未完成：' + (d.message || d.code || r.status);
      }
    } catch (e) {
      out.textContent = '连接中断，操作结果可能未知。请先刷新用户列表确认，再决定是否重试。';
    } finally {
      button.disabled = completed;
    }
  };
}
document.getElementById('mk-btn').onclick = function () { openExtend(null); };

/* ---------- orders ---------- */
async function loadOrders() {
  var st = document.getElementById('o-filter').value;
  var d = await (await api('/v1/admin/orders' + (st ? '?status=' + st : ''))).json();
  var tb = document.getElementById('o-rows');
  if (!(d.orders ?? []).length) { tb.innerHTML = '<tr><td colspan="7" class="empty">没有订单</td></tr>'; return; }
  tb.innerHTML = d.orders.map(function (o) {
    return '<tr><td class="key">' + esc(o.id.slice(0, 8)) + '</td>'
      + '<td>' + esc(o.contact) + '</td>'
      + '<td>' + esc(o.plan) + ' × ' + o.months + ' 月</td>'
      + '<td>¥' + (o.amountFen / 100).toFixed(0) + '</td>'
      + '<td>' + esc(o.provider || '—') + '</td>'
      + '<td>' + relTime(o.createdAt) + '</td>'
      + '<td class="td-actions">'
      + '<span class="badge badge-gray">' + esc(o.status === 'paid' ? '已支付（历史）' : '待确认（历史/测试）') + '</span>'
      + '</td></tr>';
  }).join('');

}
document.getElementById('o-filter').onchange = loadOrders;

/* ---------- accounts ---------- */
async function loadAccounts() {
  var d = await (await api('/v1/admin/accounts')).json();
  var tb = document.getElementById('a-rows');
  if (!(d.accounts ?? []).length) { tb.innerHTML = '<tr><td colspan="4" class="empty">还没有账号</td></tr>'; return; }
  tb.innerHTML = d.accounts.map(function (a) {
    return '<tr><td><b>' + esc(a.name) + '</b></td><td class="key">' + esc(a.appId) + '</td>'
      + '<td>' + (a.owner ? esc(a.owner) : '<span class="badge badge-gray">管理员</span>') + '</td>'
      + '<td>' + esc(a.source === 'config' ? 'server.json' : '数据库') + '</td></tr>';
  }).join('');
}
document.getElementById('acc-btn').onclick = function () {
  openModal('<h3>新增公众号账号</h3>'
    + '<label>账号名</label><input id="a-name">'
    + '<label>AppID</label><input id="a-appid" placeholder="wx 开头">'
    + '<label>AppSecret</label><input id="a-secret" type="password" autocomplete="off" placeholder="从公众号平台获取">'
    + '<label>所属用户联系方式（留空=管理员账号）</label><input id="a-owner">'
    + '<div class="msg" id="a-out"></div>'
    + '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:18px">'
    + '<button class="btn btn-ghost btn-sm" id="a-verify">① 验证连通性</button>'
    + '<button class="btn btn-sm" id="a-save">② 保存</button></div>');
  document.getElementById('a-verify').onclick = async function () {
    var out = document.getElementById('a-out');
    out.style.display = 'block';
    out.textContent = '验证中…（服务器会真实调用一次微信 API）';
    var r = await api('/v1/admin/verify-wechat', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ appId: gv('a-appid'), appSecret: gv('a-secret') })
    });
    var d = await r.json();
    out.innerHTML = (d.ok ? '<span class="success">✅ 连通</span>' : '<span class="error">❌ </span>' + esc(d.message))
      + (d.ip ? ' <span class="dim">（服务器出口 IP：' + esc(d.ip) + '）</span>' : '');
  };
  document.getElementById('a-save').onclick = async function () {
    var r = await api('/v1/admin/accounts', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: gv('a-name'), appId: gv('a-appid'), appSecret: gv('a-secret'), ownerContact: gv('a-owner') })
    });
    var d = await r.json();
    if (d.ok) { toast('已保存', 'ok'); closeModal(); loadAccounts(); }
    else document.getElementById('a-out').textContent = JSON.stringify(d);
  };
};

/* ---------- live feed (publy-ws gateway) ---------- */
var ws = null, wsTimer = null, wsGeneration = 0;
var EV_CLS = { published: 'ok', failed: 'err', scheduled: '', cancelled: 'dim', deduped: 'dim', 'purchase-paid': 'gold', 'purchase-completed': 'gold', bound: 'ok' };
function wsUrl() {
  var saved = localStorage.getItem('publy_ws_url');
  if (saved) return saved;
  var port = parseInt(location.port || '0', 10);
  var next = port ? String(port + 1) : '8081';
  return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.hostname + ':' + next + '/events';
}
function wsSetState(state, text) {
  var dot = document.getElementById('ws-dot'), st = document.getElementById('ws-state');
  dot.className = 'dot ' + state;
  st.textContent = text;
}
function wsDown() {
  wsGeneration++;
  var badge = document.getElementById('conn-badge');
  if (badge) badge.style.display = 'none';
  if (ws) { try { ws.onclose = null; ws.close(); } catch (e) {} ws = null; }
  if (wsTimer) { clearTimeout(wsTimer); wsTimer = null; }
  var dot = document.getElementById('ws-dot');
  if (dot) { dot.className = 'dot'; document.getElementById('ws-state').textContent = '未连接'; }
}
function wsEnsure() {
  var input = document.getElementById('ws-url');
  if (!input.value) input.value = localStorage.getItem('publy_ws_url') || wsUrl();
  if (ws && (ws.readyState === 1 || ws.readyState === 0)) return;
  wsConnect();
}
async function wsConnect() {
  var url = document.getElementById('ws-url').value.trim();
  if (!url) return;
  localStorage.setItem('publy_ws_url', url);
  wsDown();
  wsSetState('wait', '获取连接凭证…');
  var keyAtStart = KEY, generation = wsGeneration;
  try {
    var response = await api('/v1/ws-ticket', { method: 'POST' });
    if (!response.ok) throw new Error('无法获取短期凭证（HTTP ' + response.status + '）');
    var data = await response.json();
    if (!KEY || KEY !== keyAtStart || generation !== wsGeneration) return;
    var target = new URL(url);
    if (target.protocol !== 'ws:' && target.protocol !== 'wss:') throw new Error('地址必须使用 ws 或 wss');
    target.searchParams.set('key', data.ticket);
    wsSetState('wait', '连接中…');
    ws = new WebSocket(target.toString());
  } catch (e) { if (generation === wsGeneration) wsSetState('err', '连接失败：' + e.message); return; }
  ws.onopen = function () {
    wsSetState('on', '已连接');
    document.getElementById('conn-badge').style.display = 'inline-block';
    toast('实时动态已连接', 'ok');
  };
  ws.onmessage = function (e) {
    var d; try { d = JSON.parse(e.data); } catch (err) { return; }
    if (d.control === 'replay-done') return;
    if (d.event === 'hosts') return;
    feedPush(d);
  };
  ws.onclose = function () {
    wsSetState('err', '已断开');
    document.getElementById('conn-badge').style.display = 'none';
    wsTimer = setTimeout(function () { if (KEY && document.getElementById('tab-feed').style.display !== 'none') wsConnect(); }, 3000);
  };
  ws.onerror = function () { try { ws.close(); } catch (e) {} };
}
function feedPush(d) {
  var feed = document.getElementById('feed');
  var empty = feed.querySelector('.empty');
  if (empty) empty.remove();
  var cls = EV_CLS[d.event] || '';
  var el = document.createElement('div');
  el.className = 'ev';
  el.innerHTML = '<span class="badge ev-b ' + cls + '">' + esc(d.event) + '</span>'
    + '<span class="ev-main">' + esc([d.account, d.title, d.contact, d.orderId ? '订单 ' + d.orderId : '']
      .filter(Boolean).join(' · ')) + '</span>'
    + '<span class="dim">' + esc((d.ts || '').replace('T', ' ').slice(5, 19)) + '</span>';
  feed.prepend(el);
  while (feed.children.length > 200) feed.lastChild.remove();
}
document.getElementById('ws-reconnect').onclick = wsConnect;
document.getElementById('ws-url').addEventListener('keydown', function (e) { if (e.key === 'Enter') wsConnect(); });

/* ---------- boot ---------- */
if (KEY) {
  document.getElementById('key').value = KEY;
  login();
}
</script>`;

  return shell("Publy · Admin", body, ADMIN_CSS);
}

const ADMIN_CSS = `
  #topbar { position: sticky; top: 0; z-index: 10; background: rgba(13,13,13,.92);
    backdrop-filter: blur(8px); border-bottom: 1px solid var(--border); }
  .tb-inner { max-width: 1080px; margin: 0 auto; padding: 14px 20px;
    display: flex; align-items: center; justify-content: space-between; }
  .brand { font-size: 17px; font-weight: 700; }
  .brand span { color: var(--accent); }
  .tb-right { display: flex; gap: 10px; align-items: center; }
  .wrap { max-width: 1080px; margin: 0 auto; padding: 24px 20px 64px; }
  .btn-sm { padding: 7px 14px; font-size: 13px; }
  .tabs { display: flex; gap: 4px; margin-bottom: 18px; border-bottom: 1px solid var(--border); }
  .tab { background: transparent; border: 0; color: var(--text-2); font-size: 14px;
    padding: 10px 18px; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; }
  .tab:hover { color: var(--text); }
  .tab.active { color: var(--accent); border-bottom-color: var(--accent); font-weight: 600; }
  .panel .card { margin-bottom: 16px; overflow-x: auto; }
  .tabs { overflow-x: auto; }
  .tab { white-space: nowrap; }
  .card-head { display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 14px; padding-bottom: 12px; border-bottom: 1px solid var(--border); }
  .card-head h3 { border: 0; padding: 0; margin: 0; font-size: 15px; }
  .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 12px; margin-bottom: 16px; }
  .stat { background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius); padding: 18px 20px; }
  .stat-n { font-size: 30px; font-weight: 700; line-height: 1.2; }
  .stat-t { font-size: 13px; color: var(--text-2); margin-top: 2px; }
  .stat-s { font-size: 11px; color: var(--text-3); margin-top: 6px; }
  .bar { height: 6px; background: var(--bg); border-radius: 3px; overflow: hidden;
    margin-bottom: 4px; width: 120px; display: inline-block; vertical-align: middle; }
  .bar-in { height: 100%; background: var(--accent); border-radius: 3px; }
  .bar-in.hot { background: var(--danger); }
  .dim { color: var(--text-3); font-size: 12px; }
  .td-actions { text-align: right; white-space: nowrap; }
  .td-actions .btn { margin-left: 4px; }
  .key { font-family: monospace; font-size: 12px; cursor: pointer; }
  span.key:hover { color: var(--accent); }
  .empty { color: var(--text-3); padding: 24px; text-align: center; }
  .modal-mask-fix {}
  #modal-mask { position: fixed; inset: 0; background: rgba(0,0,0,.6); z-index: 50;
    display: flex; align-items: center; justify-content: center; padding: 20px; }
  #modal { background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius); padding: 24px; width: 100%; max-width: 460px;
    max-height: 85vh; overflow: auto; }
  #modal h3 { font-size: 15px; margin-bottom: 6px; }
  .btn-danger-solid { background: var(--danger); color: #fff; border: 0; }
  .btn-danger-solid:hover { background: #ef5350; }
  #toasts { position: fixed; bottom: 20px; right: 20px; z-index: 99;
    display: flex; flex-direction: column; gap: 8px; }
  .toast { background: var(--surface-2); border: 1px solid var(--border);
    border-left: 3px solid var(--accent); color: var(--text);
    padding: 10px 16px; border-radius: var(--radius-sm); font-size: 13px;
    opacity: 0; transform: translateY(8px); transition: all .3s; }
  .toast.show { opacity: 1; transform: none; }
  .toast.err { border-left-color: var(--danger); }
  .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%;
    background: var(--text-3); margin-right: 6px; }
  .dot.on { background: var(--accent); }
  .dot.wait { background: #eab308; }
  .dot.err { background: var(--danger); }
  .feed { max-height: 60vh; overflow: auto; }
  .ev { display: flex; gap: 10px; align-items: baseline; padding: 9px 4px;
    border-bottom: 1px solid var(--surface-2); font-size: 13px; }
  .ev-b { flex: 0 0 auto; }
  .ev-b.ok { background: var(--accent-dim); color: var(--accent); }
  .ev-b.err { background: rgba(248,113,113,.12); color: var(--danger); }
  .ev-b.gold { background: rgba(234,179,8,.12); color: #eab308; }
  .ev-b.dim { background: var(--surface-2); color: var(--text-3); }
  .ev-main { flex: 1; word-break: break-all; }
  select { width: auto; padding: 8px 12px; background: var(--bg); color: var(--text);
    border: 1px solid var(--border-light); border-radius: var(--radius-sm); font-size: 13px; }
`;
