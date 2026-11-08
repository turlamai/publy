// Admin console — a zero-dependency single-page operator tool.
//
// Tabs for overview, scheduled drafts, users, orders, accounts, and a LIVE feed wired to
// the publy-ws event gateway (same admin key). Auth is the admin key in
// sessionStorage; every data call carries it as x-api-key.

import { shell } from "./pages.js";

export function adminPage(): string {
  const body = `
<div id="login-card" class="login-view">
  <div class="login-panel">
    <div class="brand-large">
      <span class="brand-mark">P</span>
      <div><strong>Publy</strong><small>Operator Console</small></div>
    </div>
    <h1>登录运营控制台</h1>
    <p class="muted">使用 <code>server.json</code> 中的 admin key 登录。密钥只保存在当前标签页的 sessionStorage，不会写入服务器。</p>
    <label for="key">Admin key</label>
    <div class="login-row">
      <input id="key" type="password" autocomplete="current-password" placeholder="粘贴 admin key">
      <button class="btn" id="login-btn">进入</button>
    </div>
    <div class="form-error" id="login-error" role="alert"></div>
    <div class="login-foot">仅限自托管运营者 · 开发内测版 · 公开托管与收款尚未开放</div>
  </div>
</div>

<div id="app" class="app" style="display:none">
  <aside class="sidebar">
    <div class="sidebar-brand">
      <span class="brand-mark">P</span>
      <div><strong>Publy</strong><small>运营控制台</small></div>
    </div>
    <nav class="nav" id="tabs" aria-label="主导航">
      <div class="nav-label">总览</div>
      <button class="tab nav-item active" data-tab="overview">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6v-9h-6v9Zm0-16v5h6V4h-6Z"/></svg>
        <span>概览</span>
      </button>
      <button class="tab nav-item" data-tab="jobs">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10a2 2 0 0 1 2 2v14l-7-3-7 3V5a2 2 0 0 1 2-2Z"/></svg>
        <span>草稿任务</span><span class="nav-badge" id="nav-jobs-badge"></span>
      </button>
      <button class="tab nav-item" data-tab="claims">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 3 7v6c0 5 4 8 9 9 5-1 9-4 9-9V7l-9-5Zm-1 13-3-3 1.4-1.4L11 12.2l4.6-4.6L17 9l-6 6Z"/></svg>
        <span>待核对</span><span class="nav-badge" id="nav-claims-badge"></span>
      </button>
      <div class="nav-label">客户</div>
      <button class="tab nav-item" data-tab="users">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 11c1.7 0 3-1.3 3-3s-1.3-3-3-3-3 1.3-3 3 1.3 3 3 3Zm-8 0c1.7 0 3-1.3 3-3S9.7 5 8 5 5 6.3 5 8s1.3 3 3 3Zm0 2c-2.3 0-7 1.2-7 3.5V19h14v-2.5c0-2.3-4.7-3.5-7-3.5Zm8 0c-.3 0-.6 0-1 .1 1.2.9 2 2 2 3.4V19h6v-2.5c0-2.3-4.7-3.5-7-3.5Z"/></svg>
        <span>用户</span>
      </button>
      <button class="tab nav-item" data-tab="orders">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12a2 2 0 0 1 2 2v18l-4-2-4 2-4-2-4 2V4a2 2 0 0 1 2-2Zm2 6h8v2H8V8Zm0 4h8v2H8v-2Z"/></svg>
        <span>订单</span>
      </button>
      <div class="nav-label">配置与运维</div>
      <button class="tab nav-item" data-tab="accounts">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm6.9 9h-3a15 15 0 0 0-1.2-5.1A8 8 0 0 1 18.9 11ZM12 4.2c.8 1 1.6 3 1.9 6.8h-3.8c.3-3.8 1.1-5.8 1.9-6.8ZM5.1 13h3c.2 2.2.6 4 1.2 5.1A8 8 0 0 1 5.1 13Zm3-2h-3a8 8 0 0 1 4.2-5.1A15 15 0 0 0 8.1 11Zm3.9 8.8c-.8-1-1.6-3-1.9-6.8h3.8c-.3 3.8-1.1 5.8-1.9 6.8Zm1.8-1.7c.6-1.1 1-2.9 1.2-5.1h3a8 8 0 0 1-4.2 5.1Z"/></svg>
        <span>公众号账号</span>
      </button>
      <button class="tab nav-item" data-tab="feed">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h3v-3H4v3Zm0-6h3v-3H4v3Zm0-6h3V5H4v3Zm6 12h10v-3H10v3Zm0-6h10v-3H10v3Zm0-9v3h10V5H10Z"/></svg>
        <span>实时动态</span>
      </button>
    </nav>
    <div class="sidebar-foot">
      <div class="server-line"><span class="dot" id="server-dot"></span><span id="server-pill">连接中…</span></div>
      <div class="server-version" id="server-version">Publy —</div>
      <button class="btn btn-ghost btn-sm sidebar-logout" id="logout">退出登录</button>
    </div>
  </aside>

  <div class="main">
    <header class="topbar">
      <div class="page-heading">
        <h1 id="page-title">概览</h1>
        <p id="page-sub">服务状态与今日动态</p>
      </div>
      <div class="top-actions">
        <span class="badge badge-green" id="conn-badge" style="display:none">实时已连接</span>
        <button class="btn btn-ghost btn-sm" id="refresh-btn">刷新</button>
      </div>
    </header>

    <main class="content">
      <section id="tab-overview" class="panel">
        <div id="overview-status" class="status-line" role="status" aria-live="polite"></div>
        <div class="kpi-grid" id="stat-grid"></div>
        <div class="dash-grid">
          <div class="card chart-card">
            <div class="card-head">
              <div><h3>投递趋势</h3><p class="card-sub">最近 14 天 · Asia/Shanghai</p></div>
              <div class="legend">
                <span><i class="legend-dot ok"></i>草稿确认</span>
                <span><i class="legend-dot err"></i>失败</span>
                <span><i class="legend-dot warn"></i>结果未知</span>
              </div>
            </div>
            <div id="chart" class="chart" role="img" aria-label="最近 14 天投递趋势图"></div>
          </div>
          <div class="card system-card">
            <div class="card-head"><h3>服务状态</h3><span class="badge badge-green" id="system-state">运行中</span></div>
            <dl class="kv" id="system-panel"></dl>
          </div>
        </div>
        <div class="dash-grid">
          <div class="card">
            <div class="card-head"><h3>最近动态</h3><button class="btn btn-ghost btn-sm" onclick="switchTab('feed')">查看全部</button></div>
            <div id="ov-activity" class="activity-list"><div class="empty">暂无事件</div></div>
          </div>
          <div class="card">
            <div class="card-head"><h3>快捷操作</h3></div>
            <div class="quick-grid">
              <button class="quick" onclick="switchTab('jobs')"><b>草稿任务</b><span>查看待投递与历史结果</span></button>
              <button class="quick" onclick="switchTab('claims')"><b>核对未知结果</b><span>读取草稿箱并确认</span></button>
              <button class="quick" onclick="switchTab('users')"><b>开通 / 延期</b><span>管理本地用户与配额</span></button>
              <button class="quick" onclick="switchTab('accounts')"><b>公众号账号</b><span>查看绑定与来源</span></button>
            </div>
            <p class="hint">笔记仍在原文件夹或 Obsidian 中管理；草稿请到微信后台查看。此处仅管理自托管服务，公开托管与收款尚未开放。</p>
          </div>
        </div>
      </section>

      <section id="tab-jobs" class="panel" style="display:none">
        <div class="card">
          <div class="card-head">
            <div><h3>草稿任务</h3><p class="card-sub">服务端排程任务，时间为本机时区</p></div>
            <button class="btn btn-ghost btn-sm" id="jobs-refresh">刷新</button>
          </div>
          <div class="toolbar">
            <input id="jobs-search" class="search" placeholder="搜索标题、公众号或任务编号">
            <select id="jobs-filter" aria-label="按状态筛选">
              <option value="">全部状态</option>
              <option value="pending">等待投递</option>
              <option value="running">投递中</option>
              <option value="done">草稿已确认</option>
              <option value="failed">失败</option>
              <option value="cancelled">已取消</option>
              <option value="interrupted">结果未知</option>
            </select>
            <span id="jobs-status" class="status-line" role="status" style="margin:0"></span>
          </div>
          <div class="table-wrap"><table>
            <thead><tr><th>标题</th><th>公众号</th><th>计划时间</th><th>状态</th><th>任务编号</th><th class="right">操作</th></tr></thead>
            <tbody id="j-rows"></tbody>
          </table></div>
        </div>
        <div class="card">
          <div class="card-head">
            <div><h3>最近投递记录</h3><p class="card-sub">最近 100 条服务事件；以微信回执为准</p></div>
          </div>
          <div class="toolbar">
            <input id="history-search" class="search" placeholder="搜索标题或公众号">
            <select id="history-filter" aria-label="按结果筛选">
              <option value="">全部结果</option>
              <option value="published">草稿已确认</option>
              <option value="failed">失败</option>
              <option value="unknown">结果未知</option>
              <option value="scheduled">已排程</option>
              <option value="cancelled">已取消</option>
              <option value="deduped">重复已处理</option>
            </select>
            <span id="history-status" class="status-line" role="status" style="margin:0"></span>
          </div>
          <div class="table-wrap"><table>
            <thead><tr><th>时间</th><th>标题</th><th>公众号</th><th>结果</th></tr></thead>
            <tbody id="h-rows"></tbody>
          </table></div>
        </div>
      </section>

      <section id="tab-claims" class="panel" style="display:none">
        <div class="banner">
          <strong>只读核对，不重发。</strong> 这些请求提交时丢失了回执，草稿可能已经创建。核对会实时读取对应公众号的草稿箱；只有确认后才释放或标记请求身份，客户端才能安全重试。
        </div>
        <div class="card">
          <div class="card-head">
            <div><h3>待核对的即时发布</h3><p class="card-sub" id="claims-summary">—</p></div>
            <button class="btn btn-ghost btn-sm" id="claims-refresh">刷新</button>
          </div>
          <div id="claims-status" class="status-line" role="status" aria-live="polite"></div>
          <div class="table-wrap"><table>
            <thead><tr><th>发生时间</th><th>用户</th><th>公众号</th><th>标题</th><th>请求编号</th><th class="right">操作</th></tr></thead>
            <tbody id="c-rows"></tbody>
          </table></div>
        </div>
      </section>

      <section id="tab-users" class="panel" style="display:none">
        <div class="summary-row" id="user-summary"></div>
        <div class="card">
          <div class="card-head">
            <div><h3>用户</h3><p class="card-sub">本地用户、key 与旧版套餐字段</p></div>
            <div class="toolbar-right">
              <input id="u-search" class="search" placeholder="搜索联系方式…">
              <button class="btn btn-sm" id="mk-btn">开通 / 延期</button>
            </div>
          </div>
          <div class="table-wrap"><table>
            <thead><tr><th>联系方式</th><th>套餐</th><th>本月用量</th><th>到期</th><th>状态</th><th>API key</th><th class="right">操作</th></tr></thead>
            <tbody id="u-rows"></tbody>
          </table></div>
        </div>
      </section>

      <section id="tab-orders" class="panel" style="display:none">
        <div class="summary-row" id="order-summary"></div>
        <div class="card">
          <div class="card-head">
            <div><h3>历史 / 测试订单</h3><p class="card-sub">本地记录，不代表真实收款或当前权益</p></div>
            <select id="o-filter" aria-label="按订单状态筛选">
              <option value="pending">待确认</option>
              <option value="paid">已支付</option>
              <option value="">全部</option>
            </select>
          </div>
          <div class="table-wrap"><table>
            <thead><tr><th>编号</th><th>联系方式</th><th>套餐</th><th>金额</th><th>渠道</th><th>时间</th><th class="right">操作</th></tr></thead>
            <tbody id="o-rows"></tbody>
          </table></div>
        </div>
      </section>

      <section id="tab-accounts" class="panel" style="display:none">
        <div class="card">
          <div class="card-head">
            <div><h3>公众号账号</h3><p class="card-sub">凭据只保存在服务器，不在此展示</p></div>
            <button class="btn btn-sm" id="acc-btn">新增账号</button>
          </div>
          <div class="table-wrap"><table>
            <thead><tr><th>账号名</th><th>AppID</th><th>归属</th><th>来源</th><th class="right">操作</th></tr></thead>
            <tbody id="a-rows"></tbody>
          </table></div>
          <p class="hint">数据库账号的 AppSecret 是否加密取决于服务器 secretKey；server.json 中的账号凭据按配置文件原样保存。请保护配置与备份。</p>
        </div>
      </section>

      <section id="tab-feed" class="panel" style="display:none">
        <div class="card">
          <div class="card-head">
            <div class="feed-title"><h3>实时动态</h3><span class="dot" id="ws-dot"></span><span id="ws-state" class="muted">未连接</span></div>
            <div class="toolbar-right">
              <input id="ws-url" class="search" title="publy-ws 网关地址（改过端口就改这里，存 localStorage）" placeholder="wss://…/events">
              <button class="btn btn-sm btn-ghost" id="ws-reconnect">重连</button>
            </div>
          </div>
          <div id="feed" class="feed"><div class="empty">连接网关后，发布 / 支付 / 绑定事件会实时出现在这里。</div></div>
          <p class="hint">网关 = publy-ws 进程（默认端口 = API 端口 + 1）。未开启网关时这里保持安静，不影响草稿投递。</p>
        </div>
      </section>
    </main>
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
  approvedWsOrigins.clear();
  document.getElementById('key').value = '';
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-card').style.display = 'flex';
  document.getElementById('login-error').textContent = '';
}
function gv(id) { return document.getElementById(id).value.trim(); }

/* ---------- auth ---------- */
document.getElementById('login-btn').onclick = login;
document.getElementById('key').addEventListener('keydown', function (e) { if (e.key === 'Enter') login(); });
document.getElementById('logout').onclick = logout;
async function login() {
  KEY = gv('key');
  var error = document.getElementById('login-error');
  error.textContent = '';
  if (!KEY) { error.textContent = '请输入 admin key。'; return; }
  try {
    var r = await fetch('/v1/admin/overview', { headers: H() });
    if (!r.ok) { error.textContent = r.status === 401 ? 'admin key 不正确。' : '无法登录（HTTP ' + r.status + '）。'; return; }
    sessionStorage.setItem('publy_admin_key', KEY);
    enter();
  } catch (e) { error.textContent = '网络错误：' + e.message; }
}
function enter() {
  document.getElementById('login-card').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  switchTab('overview');
}

/* ---------- tabs ---------- */
var TAB_META = {
  overview: ['概览', '服务状态与今日动态'],
  jobs: ['草稿任务', '排程任务与最近投递记录'],
  claims: ['待核对', '回执丢失、需要人工读取草稿箱的请求'],
  users: ['用户', '本地用户、key 与配额'],
  orders: ['订单', '历史与测试订单记录'],
  accounts: ['公众号账号', '已绑定的公众号与来源'],
  feed: ['实时动态', '通过 publy-ws 网关接收的实时事件']
};
function switchTab(name) {
  if (!TAB_META[name]) return;
  document.querySelectorAll('.tab').forEach(function (t) {
    t.classList.toggle('active', t.dataset.tab === name);
  });
  document.querySelectorAll('.panel').forEach(function (p) { p.style.display = 'none'; });
  document.getElementById('tab-' + name).style.display = 'block';
  document.getElementById('page-title').textContent = TAB_META[name][0];
  document.getElementById('page-sub').textContent = TAB_META[name][1];
  if (name === 'overview') loadOverview();
  if (name === 'jobs') refreshDrafts();
  if (name === 'claims') loadClaims();
  if (name === 'users') loadUsers();
  if (name === 'orders') loadOrders();
  if (name === 'accounts') loadAccounts();
  if (name === 'feed') wsEnsure();
}
document.querySelectorAll('.tab').forEach(function (t) {
  t.onclick = function () { switchTab(t.dataset.tab); };
});
document.getElementById('refresh-btn').onclick = function () {
  var active = document.querySelector('.tab.active');
  switchTab(active && active.dataset.tab ? active.dataset.tab : 'overview');
};

/* ---------- formatting ---------- */
function fmtBytes(bytes) {
  if (!bytes && bytes !== 0) return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
  return (bytes / 1073741824).toFixed(2) + ' GB';
}
function fmtDuration(seconds) {
  if (seconds == null || Number.isNaN(Number(seconds))) return '—';
  var s = Math.max(0, Math.floor(Number(seconds)));
  var d = Math.floor(s / 86400); s -= d * 86400;
  var h = Math.floor(s / 3600); s -= h * 3600;
  var m = Math.floor(s / 60);
  if (d) return d + ' 天 ' + h + ' 小时';
  if (h) return h + ' 小时 ' + m + ' 分';
  return m + ' 分';
}
function fmtDateTime(value) {
  var d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
}
function setBadge(id, count) {
  var el = document.getElementById(id);
  if (!el) return;
  el.textContent = count > 99 ? '99+' : String(count);
  el.classList.toggle('show', count > 0);
}

/* ---------- overview ---------- */
var KPI_ICONS = {
  users: '<path d="M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm0 2c-2.3 0-7 1.2-7 3.5V19h14v-2.5C15 14.2 10.3 13 8 13Zm8 0c-.3 0-.6 0-1 .1 1.2.9 2 2 2 3.4V19h6v-2.5c0-2.3-4.7-3.5-7-3.5Z"/>',
  drafts: '<path d="M6 2h9l5 5v15H6V2Zm8 1.5V8h4.5L14 3.5ZM8 12h8v2H8v-2Zm0 4h8v2H8v-2Z"/>',
  events: '<path d="M13 2 3 14h7v8l10-12h-7l0-8Z"/>',
  claims: '<path d="M12 2 3 7v6c0 5 4 8 9 9 5-1 9-4 9-9V7l-9-5Zm-1 13-3-3 1.4-1.4L11 12.2l4.6-4.6L17 9l-6 6Z"/>',
  jobs: '<path d="M7 3h10a2 2 0 0 1 2 2v14l-7-3-7 3V5a2 2 0 0 1 2-2Z"/>',
  accounts: '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 4.2c.8 1 1.6 3 1.9 6.8h-3.8c.3-3.8 1.1-5.8 1.9-6.8ZM5.1 13h3c.2 2.2.6 4 1.2 5.1A8 8 0 0 1 5.1 13Zm3-2h-3a8 8 0 0 1 4.2-5.1A15 15 0 0 0 8.1 11Zm3.9 8.8c-.8-1-1.6-3-1.9-6.8h3.8c-.3 3.8-1.1 5.8-1.9 6.8Zm1.8-1.7c.6-1.1 1-2.9 1.2-5.1h3a8 8 0 0 1-4.2 5.1Z"/>'
};
function kpiCard(label, value, meta, icon) {
  return '<div class="kpi"><div class="kpi-label">' + esc(label) + '</div>'
    + '<div class="kpi-value">' + esc(value) + '</div>'
    + '<div class="kpi-meta">' + esc(meta) + '</div>'
    + '<div class="kpi-icon"><svg viewBox="0 0 24 24" aria-hidden="true">' + (KPI_ICONS[icon] || '') + '</svg></div></div>';
}
async function loadOverview() {
  var status = document.getElementById('overview-status');
  var g = document.getElementById('stat-grid');
  status.textContent = '正在读取服务概览…';
  g.innerHTML = '';
  try {
    var overviewResponse = await api('/v1/admin/overview');
    if (!overviewResponse.ok) throw new Error('overview unavailable');
    var d = await overviewResponse.json();
    var extras = await Promise.all([
      api('/v1/admin/system').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
      api('/v1/admin/metrics?days=14').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
      api('/v1/history?limit=8').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
    ]);
    var system = extras[0], metrics = extras[1], history = extras[2];
    var pendingJobs = system && system.jobs ? (system.jobs.pending || 0) + (system.jobs.running || 0) + (system.jobs.interrupted || 0) : 0;
    g.innerHTML = [
      kpiCard('用户', d.users.total, (d.users.pro || 0) + ' 个付费记录' + (d.users.disabled ? ' · ' + d.users.disabled + ' 停用' : ''), 'users'),
      kpiCard('本月草稿', d.publishes.monthTotal, '全部用户合计', 'drafts'),
      kpiCard('今日事件', d.eventsToday, '审计流 24h 窗口', 'events'),
      kpiCard('待核对', (d.claims || {}).pending || 0, '回执丢失，需要人工核对', 'claims'),
      kpiCard('待投递任务', pendingJobs, '等待 / 投递中 / 未决', 'jobs'),
      kpiCard('公众号账号', d.accounts.total, '请保护凭据与备份', 'accounts')
    ].join('');
    setBadge('nav-claims-badge', (d.claims || {}).pending || 0);
    setBadge('nav-jobs-badge', pendingJobs);
    renderSystem(system);
    renderChart(metrics);
    renderActivity(history);
    status.textContent = '';
  } catch (error) {
    status.textContent = '无法读取服务概览，请检查连接后刷新。';
    g.innerHTML = '';
  }
}
function renderSystem(system) {
  var el = document.getElementById('system-panel');
  var state = document.getElementById('system-state');
  var version = document.getElementById('server-version');
  var pill = document.getElementById('server-pill');
  var dot = document.getElementById('server-dot');
  if (!system) {
    el.innerHTML = '<dt>状态</dt><dd>不可用</dd>';
    state.textContent = '不可用';
    state.className = 'badge badge-red';
    return;
  }
  state.textContent = '运行中';
  state.className = 'badge badge-green';
  if (version) version.textContent = 'Publy ' + (system.version || '—') + ' · ' + (system.platform || '');
  if (pill) pill.textContent = '在线 ' + fmtDuration(system.uptimeSec);
  if (dot) dot.className = 'dot on';
  el.innerHTML = [
    ['版本', system.version || '—'],
    ['运行时长', fmtDuration(system.uptimeSec)],
    ['Node', system.node || '—'],
    ['内存 RSS', fmtBytes(system.memory && system.memory.rssBytes)],
    ['数据目录', fmtBytes(system.dataDir && system.dataDir.bytes)],
    ['审计事件', (system.history && system.history.lines) || 0],
    ['任务队列', (system.jobs && (system.jobs.pending || 0)) + ' 等待 · ' + (system.jobs && (system.jobs.running || 0)) + ' 投递中'],
    ['待核对', (system.claims && system.claims.pending) || 0]
  ].map(function (row) { return '<dt>' + esc(row[0]) + '</dt><dd>' + esc(row[1]) + '</dd>'; }).join('');
}
function renderChart(metrics) {
  var el = document.getElementById('chart');
  if (!metrics || !Array.isArray(metrics.series) || !metrics.series.length) {
    el.innerHTML = '<div class="chart-empty">暂无趋势数据</div>';
    return;
  }
  var series = metrics.series;
  var max = 1;
  series.forEach(function (day) { max = Math.max(max, (day.published || 0) + (day.failed || 0) + (day.unknown || 0)); });
  var W = 620, H = 230, padL = 34, padR = 10, padT = 12, padB = 28;
  var plotW = W - padL - padR, plotH = H - padT - padB;
  var step = plotW / series.length;
  var bars = [];
  var labels = [];
  var grid = '';
  for (var i = 0; i <= 3; i++) {
    var value = Math.round(max * i / 3);
    var y = padT + plotH - (plotH * i / 3);
    grid += '<line x1="' + padL + '" y1="' + y + '" x2="' + (W - padR) + '" y2="' + y + '" stroke="#e6eee3"/>'
      + '<text x="' + (padL - 6) + '" y="' + (y + 3) + '" text-anchor="end" font-size="9" fill="#8a9a8f">' + value + '</text>';
  }
  series.forEach(function (day, index) {
    var x = padL + index * step + step * 0.22;
    var width = step * 0.56;
    var total = (day.published || 0) + (day.failed || 0) + (day.unknown || 0);
    var y = padT + plotH;
    var segs = [
      ['published', '#176842'], ['failed', '#b23b3b'], ['unknown', '#b7791f']
    ];
    var tip = day.date + '：确认 ' + (day.published || 0) + ' · 失败 ' + (day.failed || 0) + ' · 未知 ' + (day.unknown || 0);
    bars.push('<g><title>' + esc(tip) + '</title>');
    segs.forEach(function (seg) {
      var value = day[seg[0]] || 0;
      if (!value) return;
      var h = plotH * value / max;
      y -= h;
      bars.push('<rect x="' + x + '" y="' + y + '" width="' + width + '" height="' + h + '" rx="2" fill="' + seg[1] + '"/>');
    });
    if (!total) bars.push('<rect x="' + x + '" y="' + (padT + plotH - 2) + '" width="' + width + '" height="2" rx="1" fill="#e6eee3"/>');
    bars.push('</g>');
    if (index % 2 === 0 || index === series.length - 1) {
      labels.push('<text x="' + (x + width / 2) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="9" fill="#8a9a8f">'
        + esc(day.date.slice(5)) + '</text>');
    }
  });
  el.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="最近 ' + series.length + ' 天投递趋势">'
    + grid + bars.join('') + labels.join('') + '</svg>';
}
function renderActivity(history) {
  var el = document.getElementById('ov-activity');
  var items = history && Array.isArray(history.history) ? history.history.slice().sort(function (a, b) { return new Date(b.ts) - new Date(a.ts); }).slice(0, 8) : [];
  if (!items.length) { el.innerHTML = '<div class="empty">暂无事件</div>'; return; }
  var labels = { published: '草稿确认', failed: '失败', scheduled: '已排程', cancelled: '已取消', deduped: '重复已处理',
    'outcome-unknown': '结果未知', 'claim-reconciled': '人工核对', 'purchase-paid': '支付', 'purchase-completed': '订单完成' };
  var kinds = { published: 'badge-green', failed: 'badge-red', 'outcome-unknown': 'badge-amber', scheduled: 'badge-blue' };
  el.innerHTML = items.map(function (entry) {
    var label = Object.prototype.hasOwnProperty.call(labels, entry.event) ? labels[entry.event] : entry.event;
    var kind = kinds[entry.event] || 'badge-gray';
    var detail = [entry.title, entry.account, entry.contact].filter(Boolean).join(' · ');
    var when = entry.ts ? new Date(entry.ts) : null;
    return '<div class="activity-item"><span class="badge ' + kind + '">' + esc(label) + '</span>'
      + '<span class="activity-main">' + esc(detail || '—') + '</span>'
      + '<span class="activity-time">' + esc(when && !Number.isNaN(when.getTime()) ? relTime(when.getTime()) : '') + '</span></div>';
  }).join('');
}

/* ---------- scheduled drafts ---------- */
var jobsCache = [];
var historyCache = [];
var JOB_LABELS = { pending: ['等待投递', 'badge-blue'], running: ['投递中', 'badge-amber'],
  done: ['草稿已确认', 'badge-green'], failed: ['失败', 'badge-red'], cancelled: ['已取消', 'badge-gray'],
  interrupted: ['结果未知，请检查草稿箱', 'badge-amber'] };
async function loadJobs() {
  var status = document.getElementById('jobs-status'), rows = document.getElementById('j-rows');
  status.textContent = '正在读取任务…';
  rows.innerHTML = '';
  try {
    var response = await api('/v1/jobs');
    if (!response.ok) throw new Error('HTTP ' + response.status);
    var data = await response.json();
    if (!Array.isArray(data.jobs)) throw new Error('任务数据格式错误');
    jobsCache = data.jobs;
    var pending = jobsCache.filter(function (job) { return job.status === 'pending' || job.status === 'running' || job.status === 'interrupted'; }).length;
    setBadge('nav-jobs-badge', pending);
    renderJobs();
    status.textContent = '共 ' + jobsCache.length + ' 个任务';
  } catch (error) {
    jobsCache = [];
    status.textContent = '无法读取任务，请检查服务连接和权限后刷新。';
  }
}
function renderJobs() {
  var rows = document.getElementById('j-rows');
  if (!rows) return;
  var filter = document.getElementById('jobs-filter') ? document.getElementById('jobs-filter').value : '';
  var query = document.getElementById('jobs-search') ? document.getElementById('jobs-search').value.trim().toLowerCase() : '';
  var list = jobsCache.filter(function (job) {
    if (filter && job.status !== filter) return false;
    if (!query) return true;
    return [job.title, job.account, job.id].filter(Boolean).join(' ').toLowerCase().indexOf(query) >= 0;
  });
  if (!list.length) {
    rows.innerHTML = '<tr><td colspan="6" class="empty">' + (jobsCache.length ? '没有匹配的任务' : '暂无排程任务') + '</td></tr>';
    return;
  }
  rows.innerHTML = list.map(function (job, index) {
    var when = new Date(job.runAt);
    var meta = JOB_LABELS[job.status] || ['状态未知', 'badge-gray'];
    var action = job.status === 'pending' && typeof job.id === 'string'
      ? '<button class="btn btn-ghost btn-sm" data-cancel-job="' + index + '">取消任务</button>' : '<span class="dim">—</span>';
    return '<tr><td><b>' + esc(job.title) + '</b></td><td>' + esc(job.account) + '</td><td>'
      + esc(fmtDateTime(job.runAt)) + '</td><td><span class="badge ' + meta[1] + '">'
      + esc(meta[0]) + '</span></td><td class="key">' + esc(job.id) + '</td><td class="td-actions">' + action + '</td></tr>';
  }).join('');
  rows.querySelectorAll('[data-cancel-job]').forEach(function (button) {
    var job = list[Number(button.dataset.cancelJob)];
    button.onclick = function () { confirmCancelJob(job); };
  });
}
function confirmCancelJob(job) {
  confirmBox('取消「' + (job.title || '未命名任务') + '」的排程？已开始投递的任务无法在此取消。', async function () {
    try {
      var response = await api('/v1/jobs/' + encodeURIComponent(job.id), { method: 'DELETE' });
      if (!response.ok) throw new Error('not cancelled');
      var result = await response.json();
      if (result.ok !== true) throw new Error('not confirmed');
      toast('任务已取消', 'ok');
    } catch (error) {
      toast('未能确认取消结果，请刷新任务状态后再操作。', 'err');
    }
    refreshDrafts();
  });
}
var HISTORY_LABELS = { published: ['草稿已确认', 'badge-green'], 'scheduled-published': ['排程草稿已确认', 'badge-green'],
  failed: ['失败', 'badge-red'], 'scheduled-failed': ['排程失败', 'badge-red'],
  'outcome-unknown': ['结果未知，请检查草稿箱', 'badge-amber'], 'scheduled-outcome-unknown': ['结果未知，请检查草稿箱', 'badge-amber'],
  deduped: ['重复请求已处理', 'badge-gray'], 'scheduled-deduped': ['排程草稿已确认', 'badge-green'],
  scheduled: ['已排程', 'badge-blue'], cancelled: ['已取消', 'badge-gray'], 'claim-reconciled': ['人工核对', 'badge-blue'] };
async function loadDraftHistory() {
  var status = document.getElementById('history-status'), rows = document.getElementById('h-rows');
  status.textContent = '正在读取记录…';
  rows.innerHTML = '';
  try {
    var response = await api('/v1/history?limit=100');
    if (!response.ok) throw new Error('HTTP ' + response.status);
    var data = await response.json();
    if (!Array.isArray(data.history)) throw new Error('记录格式错误');
    historyCache = data.history.filter(function (entry) { return entry && Object.prototype.hasOwnProperty.call(HISTORY_LABELS, entry.event); }).sort(function (a, b) { return new Date(b.ts) - new Date(a.ts); });
    renderHistory();
    status.textContent = '显示 ' + historyCache.length + ' 条记录';
  } catch (error) {
    historyCache = [];
    status.textContent = '无法读取记录，请检查服务连接和权限后刷新。';
  }
}
function renderHistory() {
  var rows = document.getElementById('h-rows');
  if (!rows) return;
  var filter = document.getElementById('history-filter') ? document.getElementById('history-filter').value : '';
  var query = document.getElementById('history-search') ? document.getElementById('history-search').value.trim().toLowerCase() : '';
  var list = historyCache.filter(function (entry) {
    if (filter) {
      if (filter === 'unknown') { if (entry.event.indexOf('outcome-unknown') < 0) return false; }
      else if (entry.event !== filter && entry.event !== 'scheduled-' + filter) return false;
    }
    if (!query) return true;
    return [entry.title, entry.account].filter(Boolean).join(' ').toLowerCase().indexOf(query) >= 0;
  });
  if (!list.length) rows.innerHTML = '<tr><td colspan="4" class="empty">最近没有可显示的投递记录</td></tr>';
  else rows.innerHTML = list.map(function (entry) {
    var when = new Date(entry.ts);
    var meta = HISTORY_LABELS[entry.event] || [entry.event, 'badge-gray'];
    return '<tr><td>' + esc(fmtDateTime(entry.ts)) + '</td><td><b>'
      + esc(entry.title) + '</b></td><td>' + esc(entry.account) + '</td><td><span class="badge ' + meta[1] + '">'
      + esc(meta[0]) + '</span></td></tr>';
  }).join('');
}
function refreshDrafts() { void loadJobs(); void loadDraftHistory(); }
document.getElementById('jobs-filter').onchange = renderJobs;
document.getElementById('jobs-search').addEventListener('input', renderJobs);
document.getElementById('history-filter').onchange = renderHistory;
document.getElementById('history-search').addEventListener('input', renderHistory);

document.getElementById('jobs-refresh').onclick = refreshDrafts;

/* ---------- users ---------- */
var usersCache = [];
async function loadUsers() {
  try {
    var d = await (await api('/v1/admin/users')).json();
    usersCache = Array.isArray(d.users) ? d.users : [];
    var active = usersCache.filter(function (u) { return !u.disabled; }).length;
    var paid = usersCache.filter(function (u) { return u.plan !== 'free'; }).length;
    var summary = document.getElementById('user-summary');
    if (summary) summary.innerHTML = [
      ['总用户', usersCache.length], ['正常', active], ['已停用', usersCache.length - active], ['付费记录', paid]
    ].map(function (c) { return '<span class="summary-chip">' + esc(c[0]) + ' <b>' + esc(c[1]) + '</b></span>'; }).join('');
    renderUsers();
  } catch (error) {
    toast('无法读取用户列表，请检查连接后刷新。', 'err');
  }
}
function renderUsers() {
  var q = gv('u-search').toLowerCase();
  var tb = document.getElementById('u-rows');
  var list = usersCache.filter(function (u) { return !q || u.contact.toLowerCase().indexOf(q) >= 0; });
  if (!list.length) { tb.innerHTML = '<tr><td colspan="7" class="empty">' + (q ? '没有匹配的用户' : '还没有用户') + '</td></tr>'; return; }
  tb.innerHTML = list.map(function (u) {
    var expired = u.expiresAt && u.expiresAt < Date.now();
    var exp = u.expiresAt
      ? new Date(u.expiresAt).toLocaleDateString() + ' <span class="dim">(' + (expired ? '已过期' : '剩 ' + daysLeft(u.expiresAt) + ' 天') + ')</span>'
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
        var r = await api('/v1/admin/users/' + b.dataset.rot + '/rotate-key', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
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
  try {
    var st = document.getElementById('o-filter').value;
    var d = await (await api('/v1/admin/orders' + (st ? '?status=' + st : ''))).json();
    var orders = Array.isArray(d.orders) ? d.orders : [];
    var pending = orders.filter(function (o) { return o.status === 'pending'; }).length;
    var paid = orders.filter(function (o) { return o.status === 'paid'; });
    var summary = document.getElementById('order-summary');
    if (summary) summary.innerHTML = [
      ['当前筛选', orders.length], ['待确认', pending], ['已支付标记', paid.length],
      ['金额合计', '¥' + (paid.reduce(function (a, o) { return a + o.amountFen; }, 0) / 100).toFixed(0)]
    ].map(function (c) { return '<span class="summary-chip">' + esc(c[0]) + ' <b>' + esc(c[1]) + '</b></span>'; }).join('');
    renderOrders(orders);
  } catch (error) {
    toast('无法读取订单，请检查连接后刷新。', 'err');
  }
}
function renderOrders(orders) {
  var tb = document.getElementById('o-rows');
  if (!orders.length) { tb.innerHTML = '<tr><td colspan="7" class="empty">没有订单</td></tr>'; return; }
  tb.innerHTML = orders.map(function (o) {
    return '<tr><td class="key" title="' + esc(o.id) + '">' + esc(o.id.slice(0, 8)) + '</td>'
      + '<td>' + esc(o.contact) + '</td>'
      + '<td>' + esc(o.plan) + ' × ' + o.months + ' 月</td>'
      + '<td>¥' + (o.amountFen / 100).toFixed(0) + '</td>'
      + '<td>' + esc(o.provider || '—') + '</td>'
      + '<td>' + relTime(o.createdAt) + '</td>'
      + '<td class="td-actions">'
      + '<span class="badge ' + (o.status === 'paid' ? 'badge-green' : 'badge-amber') + '">'
      + esc(o.status === 'paid' ? '已支付（历史）' : '待确认（历史/测试）') + '</span>'
      + '</td></tr>';
  }).join('');
}
document.getElementById('o-filter').onchange = loadOrders;

/* ---------- accounts ---------- */
async function loadAccounts() {
  try {
    var d = await (await api('/v1/admin/accounts')).json();
    var tb = document.getElementById('a-rows');
    var accounts = Array.isArray(d.accounts) ? d.accounts : [];
    if (!accounts.length) { tb.innerHTML = '<tr><td colspan="5" class="empty">还没有账号</td></tr>'; return; }
    tb.innerHTML = accounts.map(function (a, index) {
      return '<tr><td><b>' + esc(a.name) + '</b></td><td class="key">' + esc(a.appId) + '</td>'
        + '<td>' + (a.owner ? esc(a.owner) : '<span class="badge badge-gray">管理员</span>') + '</td>'
        + '<td><span class="badge ' + (a.source === 'config' ? 'badge-blue' : 'badge-green') + '">'
        + esc(a.source === 'config' ? 'server.json' : '数据库') + '</span></td>'
        + '<td class="td-actions"><button class="btn btn-ghost btn-sm" data-verify="' + index + '">测试连接</button></td></tr>';
    }).join('');
    tb.querySelectorAll('[data-verify]').forEach(function (button) {
      var account = accounts[Number(button.dataset.verify)];
      button.onclick = async function () {
        button.disabled = true;
        var original = button.textContent;
        button.textContent = '测试中…';
        try {
          var response = await api('/v1/admin/accounts/' + encodeURIComponent(account.name) + '/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
          var result = await response.json();
          if (result.ok) toast('「' + account.name + '」微信连通正常' + (result.ip ? ' · 出口 IP ' + result.ip : ''), 'ok');
          else toast('「' + account.name + '」验证失败：' + (result.message || result.errcode || '未知错误'), 'err');
        } catch (error) {
          toast('测试连接失败：' + error.message, 'err');
        } finally {
          button.disabled = false;
          button.textContent = original;
        }
      };
    });
  } catch (error) {
    toast('无法读取公众号账号，请检查连接后刷新。', 'err');
  }
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

/* ---------- unresolved immediate claims ---------- */
var claimsCache = [];
async function loadClaims() {
  var status = document.getElementById('claims-status'), rows = document.getElementById('c-rows');
  var summary = document.getElementById('claims-summary');
  status.textContent = '正在读取待核对请求…';
  rows.innerHTML = '';
  if (summary) summary.textContent = '正在读取…';
  try {
    var response = await api('/v1/admin/claims');
    if (!response.ok) throw new Error('HTTP ' + response.status);
    var data = await response.json();
    if (!Array.isArray(data.claims)) throw new Error('待核对数据格式错误');
    claimsCache = data.claims;
    setBadge('nav-claims-badge', claimsCache.length);
    if (summary) summary.textContent = '核对会实时读取公众号草稿箱，只读，不修改微信内容。';
    if (!claimsCache.length) {
      rows.innerHTML = '<tr><td colspan="6" class="empty">当前没有待核对的发布</td></tr>';
      status.textContent = '共 ' + claimsCache.length + ' 条待核对';
      return;
    }
    rows.innerHTML = claimsCache.map(function (claim, index) {
      var when = claim.createdAt ? new Date(claim.createdAt) : null;
      return '<tr><td>' + esc(fmtDateTime(claim.createdAt)) + '</td>'
        + '<td>' + esc(claim.ownerContact || claim.owner) + '</td>'
        + '<td>' + esc(claim.account || '—') + '</td>'
        + '<td>' + esc(claim.title || '—') + '</td>'
        + '<td class="key">' + esc(claim.key) + '</td>'
        + '<td class="td-actions"><button class="btn btn-ghost btn-sm" data-inspect="' + index + '">核对草稿箱</button></td></tr>';
    }).join('');
    rows.querySelectorAll('[data-inspect]').forEach(function (button) {
      var claim = claimsCache[Number(button.dataset.inspect)];
      button.onclick = function () { openClaimInspection(claim); };
    });
    status.textContent = '共 ' + claimsCache.length + ' 条待核对';
  } catch (error) {
    status.textContent = '无法读取待核对请求，请检查服务连接和权限后刷新。';
  }
}
function claimErrorText(code, message) {
  var known = {
    CLAIM_NOT_VERIFIED: '该草稿不在当前公众号的草稿箱中。请重新读取草稿箱后再选。',
    CLAIM_STILL_PRESENT: '草稿箱里仍有同标题草稿，不能按「不存在」处理；如果就是它，请确认草稿存在。',
    CLAIM_ABSENCE_UNPROVEN: '草稿箱没有完整读取，无法证明草稿不存在。请归档旧草稿后重试，或按 media_id 确认。',
    CLAIM_CONTEXT_MISSING: '这条请求缺少公众号或标题上下文，无法自动核对。请保持原样，不要重发。',
    CLAIM_NOT_PENDING: '这条请求已经被处理或过期，请刷新列表。',
    ACCOUNT_NOT_FOUND: '这条请求的公众号已不在本服务中，无法读取草稿箱。请保持原样。',
    NOT_FOUND: '服务端没有这条待核对请求，请刷新列表。'
  };
  if (Object.prototype.hasOwnProperty.call(known, code)) return known[code];
  if (typeof code === 'string' && code.indexOf('WECHAT_') === 0) {
    return '微信接口暂时不可用（' + code + '），没有修改任何状态，请稍后再核对。';
  }
  if (typeof message === 'string' && message) return message;
  return '操作未完成，请稍后刷新再试。';
}
function openClaimInspection(claim) {
  openModal('<h3>核对微信草稿箱</h3>'
    + '<p class="hint">公众号：' + esc(claim.account || '未知') + '　标题：' + esc(claim.title || '未知') + '</p>'
    + '<p class="hint">请求编号 <span class="key">' + esc(claim.key) + '</span></p>'
    + '<div id="claim-body"><div class="hint">读取草稿箱是只读操作，不会修改微信内容。请先读取，再根据结果确认「已存在」或「不存在」。</div>'
    + '<button class="btn btn-sm" id="claim-load">读取草稿箱</button></div>');
  document.getElementById('claim-load').onclick = function () { void inspectClaim(claim, false); };
}
async function inspectClaim(claim, includeAll) {
  var body = document.getElementById('claim-body');
  body.innerHTML = '<div class="hint">正在读取微信草稿箱…</div>';
  try {
    var response = await api('/v1/admin/claims/' + encodeURIComponent(claim.key) + '/candidates' + (includeAll ? '?includeAll=1' : ''));
    var data = await response.json();
    if (!response.ok) throw new Error(claimErrorText(data.code, data.message));
    renderClaimCandidates(claim, data, includeAll);
  } catch (error) {
    body.innerHTML = '<div class="msg" style="display:block">无法读取草稿箱：' + esc(error.message) + '。该请求仍保持待核对，不要直接重发。</div>'
      + '<button class="btn btn-ghost btn-sm" id="claim-retry">重新读取</button>';
    document.getElementById('claim-retry').onclick = function () { void inspectClaim(claim, includeAll); };
  }
}
function renderClaimCandidates(claim, data, includeAll) {
  var body = document.getElementById('claim-body');
  var items = data.candidates || [];
  var head = '<p class="hint">已读取 ' + esc(data.scanned) + ' / ' + esc(data.totalCount) + ' 个草稿'
    + (data.complete ? '' : '（未能完整读取，暂不能确认「不存在」）')
    + (data.sameTitleCount === 0 ? '；没有同标题草稿' : '；同标题 ' + esc(data.sameTitleCount) + ' 个') + '。</p>';
  var list = items.length
    ? items.map(function (candidate, index) {
        return '<label style="display:flex;gap:8px;align-items:flex-start;padding:8px 0;border-bottom:1px solid var(--surface-2)">'
          + '<input type="radio" name="claim-pick" value="' + index + '">'
          + '<span><b>' + esc(candidate.title || '（无标题）') + '</b>'
          + '<span class="dim" style="display:block">' + esc(candidate.mediaId) + '</span></span></label>';
      }).join('')
    : '<div class="hint">当前列表中没有草稿。</div>';
  body.innerHTML = head
    + (includeAll
      ? '<button class="btn btn-ghost btn-sm" id="claim-same">只看同标题草稿</button>'
      : '<button class="btn btn-ghost btn-sm" id="claim-all">显示该账号全部草稿</button>')
    + '<div style="max-height:36vh;overflow:auto;margin:12px 0">' + list + '</div>'
    + '<label>核对说明（必填，会写入审计记录）</label>'
    + '<textarea id="claim-note" rows="2" style="width:100%" placeholder="例如：已按标题和创建时间在草稿箱核对"></textarea>'
    + '<div class="msg" id="claim-out" style="display:none"></div>'
    + '<div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:14px">'
    + '<button class="btn btn-ghost btn-sm" id="claim-absent">没有这篇草稿</button>'
    + '<button class="btn btn-sm" id="claim-delivered">确认是这篇草稿</button></div>';
  var allButton = document.getElementById('claim-all'), sameButton = document.getElementById('claim-same');
  if (allButton) allButton.onclick = function () { void inspectClaim(claim, true); };
  if (sameButton) sameButton.onclick = function () { void inspectClaim(claim, false); };
  document.getElementById('claim-delivered').onclick = function () {
    var picked = body.querySelector('input[name="claim-pick"]:checked');
    if (!picked) {
      toast('请先选中草稿箱里的那篇草稿', 'err');
      return;
    }
    return reconcileClaim(claim, 'delivered', items[Number(picked.value)].mediaId);
  };
  document.getElementById('claim-absent').onclick = function () { return reconcileClaim(claim, 'absent', null); };
}
async function reconcileClaim(claim, outcome, mediaId) {
  var out = document.getElementById('claim-out');
  var note = gv('claim-note');
  if (note.length < 4) {
    out.style.display = 'block';
    out.textContent = '请先填写核对说明（至少 4 个字），说明你是怎么核对的。';
    return;
  }
  out.style.display = 'block';
  out.textContent = '正在提交核对结果…';
  var payload = { outcome: outcome, note: note };
  if (mediaId) payload.mediaId = mediaId;
  try {
    var response = await api('/v1/admin/claims/' + encodeURIComponent(claim.key) + '/reconcile', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload)
    });
    var data = await response.json();
    if (!response.ok) {
      out.textContent = claimErrorText(data.code, data.message);
      return;
    }
    toast(outcome === 'delivered' ? '已确认草稿存在，原请求会去重' : '已确认草稿不存在，原请求可以重试', 'ok');
    closeModal();
    loadClaims();
  } catch (error) {
    out.textContent = '提交失败：' + error.message + '。请刷新后再核对，不要直接重发草稿。';
  }
}
document.getElementById('claims-refresh').onclick = loadClaims;

/* ---------- live feed (publy-ws gateway) ---------- */
var ws = null, wsTimer = null, wsGeneration = 0, approvedWsOrigins = new Set();
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
    var target = new URL(url);
    if ((target.protocol !== 'ws:' && target.protocol !== 'wss:') || target.username || target.password || target.hash)
      throw new Error('网关地址无效，请使用 ws 或 wss 地址');
    if (location.protocol === 'https:' && target.protocol !== 'wss:') throw new Error('HTTPS 页面需要加密的 wss 连接');
    var localTarget = ['localhost', '127.0.0.1', '[::1]'].indexOf(target.hostname) !== -1;
    var needsApproval = target.hostname !== location.hostname || (target.protocol === 'ws:' && !localTarget);
    if (needsApproval && !approvedWsOrigins.has(target.origin)) {
      if (!window.confirm('实时动态将连接到 ' + target.origin + ' 并发送临时连接凭证。'
          + (target.protocol === 'ws:' ? '此连接未加密。' : '') + '请确认这是你的网关。')) {
        wsSetState('', '未连接'); return;
      }
      approvedWsOrigins.add(target.origin);
    }
    var response = await api('/v1/ws-ticket', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    if (!response.ok) throw new Error('无法获取短期凭证（HTTP ' + response.status + '）');
    var data = await response.json();
    if (!KEY || KEY !== keyAtStart || generation !== wsGeneration) return;
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
  :root {
    --bg: #f4f7f3;
    --surface: #ffffff;
    --surface-2: #eef3ec;
    --border: #dde6da;
    --border-light: #cbd8c9;
    --text: #16271e;
    --text-2: #50655a;
    --text-3: #7a8b80;
    --accent: #176842;
    --accent-hover: #0d5030;
    --accent-dim: #e3f2e8;
    --danger: #b23b3b;
    --warn: #b7791f;
    --radius: 14px;
    --radius-sm: 8px;
    --sidebar: #0e1511;
    --sidebar-2: #16211b;
    --sidebar-text: #c7d4cc;
    --sidebar-muted: #7e9187;
  }
  body { font-size: 14px; background: var(--bg); color: var(--text); }
  code, .mono { font-family: "SF Mono", ui-monospace, Menlo, Consolas, monospace; }
  button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible, .tab:focus-visible {
    outline: 3px solid #d99445; outline-offset: 2px;
  }
  .muted { color: var(--text-3); font-size: 12px; }
  .right { text-align: right; }
  .btn { border-radius: 8px; padding: 9px 16px; font-size: 13px; font-weight: 600; }
  .btn-sm { padding: 7px 12px; font-size: 12px; }
  .btn-ghost { background: transparent; color: var(--text-2); border: 1px solid var(--border-light); }
  .btn-ghost:hover { background: var(--surface-2); color: var(--text); }
  .btn-danger-solid { background: var(--danger); }

  /* ---- login ---- */
  .login-view { min-height: 100vh; display: flex; align-items: center; justify-content: center;
    padding: 32px 18px; background: radial-gradient(900px 520px at 20% 0%, #1d3b2b 0%, #0b120e 55%, #070b08 100%); }
  .login-panel { width: 100%; max-width: 460px; background: #fff; border-radius: 18px;
    padding: 34px 34px 26px; box-shadow: 0 30px 80px rgba(0,0,0,.35); }
  .brand-large { display: flex; align-items: center; gap: 12px; margin-bottom: 26px; }
  .brand-large strong { display: block; font-size: 17px; letter-spacing: -.02em; }
  .brand-large small { display: block; color: var(--text-3); font-size: 11px; letter-spacing: .08em; text-transform: uppercase; }
  .brand-mark { width: 38px; height: 38px; border-radius: 11px; background: var(--accent);
    color: #fff; display: inline-flex; align-items: center; justify-content: center;
    font-weight: 800; font-size: 18px; box-shadow: 0 6px 16px rgba(23,104,66,.25); }
  .login-panel h1 { font-size: 24px; letter-spacing: -.03em; margin-bottom: 6px; }
  .login-panel .muted { line-height: 1.7; margin-bottom: 22px; }
  .login-row { display: flex; gap: 8px; }
  .login-row input { flex: 1; }
  .login-row .btn { white-space: nowrap; }
  .login-foot { margin-top: 22px; padding-top: 16px; border-top: 1px solid var(--border);
    color: var(--text-3); font-size: 11px; line-height: 1.7; }
  .form-error { color: var(--danger); font-size: 12px; min-height: 18px; margin-top: 8px; }

  /* ---- shell ---- */
  .app { display: flex; min-height: 100vh; }
  .sidebar { width: 244px; flex: 0 0 244px; background: var(--sidebar); color: var(--sidebar-text);
    display: flex; flex-direction: column; padding: 18px 14px; position: sticky; top: 0; height: 100vh; }
  .sidebar-brand { display: flex; align-items: center; gap: 10px; padding: 4px 8px 18px; }
  .sidebar-brand strong { display: block; color: #fff; font-size: 15px; letter-spacing: -.01em; }
  .sidebar-brand small { display: block; color: var(--sidebar-muted); font-size: 10px; letter-spacing: .1em; text-transform: uppercase; }
  .nav { display: flex; flex-direction: column; gap: 3px; flex: 1; overflow-y: auto; }
  .nav-label { color: var(--sidebar-muted); font-size: 10px; font-weight: 700; letter-spacing: .14em;
    text-transform: uppercase; padding: 16px 10px 6px; }
  .nav-item { display: flex; align-items: center; gap: 10px; width: 100%; border: 0; cursor: pointer;
    background: transparent; color: var(--sidebar-text); border-radius: 9px; padding: 9px 10px;
    font-size: 13px; text-align: left; transition: background .15s, color .15s; }
  .nav-item svg { width: 17px; height: 17px; fill: currentColor; opacity: .75; flex: 0 0 17px; }
  .nav-item span { flex: 1; }
  .nav-item:hover { background: var(--sidebar-2); color: #fff; }
  .nav-item.active { background: rgba(7,193,96,.14); color: #fff; box-shadow: inset 2px 0 0 #07C160; }
  .nav-item.active svg { opacity: 1; color: #07C160; }
  .nav-badge { flex: 0 0 auto !important; min-width: 18px; height: 18px; padding: 0 6px; border-radius: 999px;
    background: #d97706; color: #fff; font-size: 10px; font-weight: 700; display: none;
    align-items: center; justify-content: center; }
  .nav-badge.show { display: inline-flex; }
  .sidebar-foot { border-top: 1px solid rgba(255,255,255,.08); padding: 14px 8px 2px; margin-top: 10px; }
  .server-line { display: flex; align-items: center; gap: 7px; color: var(--sidebar-muted); font-size: 11px; }
  .server-version { color: var(--sidebar-muted); font-size: 10px; margin: 6px 0 10px; letter-spacing: .04em; }
  .sidebar-logout { width: 100%; color: var(--sidebar-text); border-color: rgba(255,255,255,.14); }
  .sidebar-logout:hover { background: var(--sidebar-2); color: #fff; }
  .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--text-3); }
  .dot.on { background: #07C160; box-shadow: 0 0 0 3px rgba(7,193,96,.16); }
  .dot.wait { background: #eab308; }
  .dot.err { background: #ef4444; }

  .main { flex: 1; min-width: 0; }
  .topbar { position: sticky; top: 0; z-index: 10; display: flex; align-items: center;
    justify-content: space-between; gap: 18px; padding: 18px 30px; background: rgba(244,247,243,.92);
    backdrop-filter: blur(10px); border-bottom: 1px solid var(--border); }
  .page-heading h1 { font-size: 22px; letter-spacing: -.03em; line-height: 1.25; }
  .page-heading p { color: var(--text-3); font-size: 12px; margin-top: 2px; }
  .top-actions { display: flex; align-items: center; gap: 8px; }
  .content { padding: 26px 30px 70px; max-width: 1320px; margin: 0 auto; }

  .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
    padding: 20px; margin-bottom: 16px; box-shadow: 0 1px 2px rgba(20,45,30,.04); }
  .card h3 { font-size: 14px; font-weight: 650; color: var(--text); border: 0; padding: 0; margin: 0; }
  .card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px;
    margin-bottom: 16px; }
  .card-sub { color: var(--text-3); font-size: 11px; margin-top: 3px; }
  .status-line { color: var(--text-3); font-size: 12px; margin: 10px 0; min-height: 16px; }
  .hint { color: var(--text-3); font-size: 12px; line-height: 1.8; margin-top: 12px; }

  .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(178px, 1fr)); gap: 12px; margin-bottom: 16px; }
  .kpi { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
    padding: 16px 18px; box-shadow: 0 1px 2px rgba(20,45,30,.04); position: relative; overflow: hidden; }
  .kpi-label { color: var(--text-3); font-size: 11px; letter-spacing: .03em; }
  .kpi-value { font-size: 27px; font-weight: 700; letter-spacing: -.03em; line-height: 1.2; margin: 4px 0 2px; }
  .kpi-meta { color: var(--text-3); font-size: 11px; }
  .kpi-icon { position: absolute; right: 14px; top: 14px; width: 30px; height: 30px; border-radius: 9px;
    background: var(--accent-dim); color: var(--accent); display: flex; align-items: center; justify-content: center; }
  .kpi-icon svg { width: 16px; height: 16px; fill: currentColor; }

  .dash-grid { display: grid; grid-template-columns: minmax(0, 1.65fr) minmax(280px, 1fr); gap: 16px; }
  .chart { width: 100%; min-height: 230px; }
  .chart svg { width: 100%; height: 230px; display: block; }
  .chart-empty { color: var(--text-3); font-size: 12px; padding: 60px 0; text-align: center; }
  .legend { display: flex; gap: 14px; color: var(--text-3); font-size: 11px; }
  .legend span { display: inline-flex; align-items: center; gap: 5px; }
  .legend-dot { width: 8px; height: 8px; border-radius: 2px; display: inline-block; }
  .legend-dot.ok { background: #176842; }
  .legend-dot.err { background: #b23b3b; }
  .legend-dot.warn { background: #b7791f; }
  .kv { display: grid; grid-template-columns: auto 1fr; gap: 9px 14px; font-size: 12px; }
  .kv dt { color: var(--text-3); }
  .kv dd { text-align: right; font-weight: 600; word-break: break-all; }
  .activity-list { display: flex; flex-direction: column; }
  .activity-item { display: flex; align-items: center; gap: 10px; padding: 9px 0;
    border-bottom: 1px solid var(--surface-2); font-size: 12px; }
  .activity-item:last-child { border-bottom: 0; }
  .activity-main { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .activity-time { color: var(--text-3); font-size: 11px; white-space: nowrap; }
  .quick-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .quick { text-align: left; background: var(--surface-2); border: 1px solid transparent;
    border-radius: 10px; padding: 12px; cursor: pointer; display: flex; flex-direction: column; gap: 3px; }
  .quick:hover { border-color: var(--accent); background: var(--accent-dim); }
  .quick b { font-size: 12px; color: var(--text); }
  .quick span { font-size: 11px; color: var(--text-3); line-height: 1.5; }

  .toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
  .toolbar-right { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .search { width: 280px; max-width: 100%; padding: 8px 12px; font-size: 12px; }
  select { width: auto; padding: 8px 12px; background: var(--surface); color: var(--text);
    border: 1px solid var(--border-light); border-radius: 8px; font-size: 12px; }
  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { text-align: left; padding: 10px 12px; color: var(--text-3); font-weight: 600; font-size: 10px;
    text-transform: uppercase; letter-spacing: .06em; border-bottom: 1px solid var(--border); white-space: nowrap; }
  td { padding: 12px; border-bottom: 1px solid var(--surface-2); vertical-align: middle; }
  tbody tr:hover td { background: #f8fbf7; }
  tbody tr:last-child td { border-bottom: 0; }
  .empty { color: var(--text-3); padding: 30px; text-align: center; font-size: 12px; }
  .key { font-family: "SF Mono", ui-monospace, Menlo, monospace; font-size: 11px; cursor: pointer; color: var(--text-2); }
  span.key:hover { color: var(--accent); }
  .td-actions { text-align: right; white-space: nowrap; }
  .td-actions .btn { margin-left: 4px; }
  .badge { display: inline-flex; align-items: center; gap: 4px; padding: 3px 9px; border-radius: 999px;
    font-size: 10px; font-weight: 650; letter-spacing: .01em; white-space: nowrap; }
  .badge-green { background: var(--accent-dim); color: var(--accent); }
  .badge-gray { background: var(--surface-2); color: var(--text-3); }
  .badge-red { background: #fbeaea; color: var(--danger); }
  .badge-amber { background: #fdf3e2; color: var(--warn); }
  .badge-blue { background: #e8f0fb; color: #2b5f9e; }
  .bar { height: 6px; background: var(--surface-2); border-radius: 3px; overflow: hidden;
    margin-bottom: 4px; width: 110px; display: inline-block; vertical-align: middle; }
  .bar-in { height: 100%; background: var(--accent); border-radius: 3px; }
  .bar-in.hot { background: var(--danger); }
  .summary-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
  .summary-chip { background: var(--surface); border: 1px solid var(--border); border-radius: 999px;
    padding: 6px 12px; font-size: 11px; color: var(--text-2); }
  .summary-chip b { color: var(--text); }
  .banner { background: #fff8e8; border: 1px solid #efd9a8; color: #7a5a12;
    border-radius: 12px; padding: 12px 16px; font-size: 12px; line-height: 1.8; margin-bottom: 14px; }

  #modal-mask { position: fixed; inset: 0; background: rgba(8,18,12,.55); z-index: 50;
    display: flex; align-items: center; justify-content: center; padding: 20px; }
  #modal { background: var(--surface); border: 1px solid var(--border); border-radius: 16px;
    padding: 24px; width: 100%; max-width: 480px; max-height: 86vh; overflow: auto;
    box-shadow: 0 30px 80px rgba(0,0,0,.25); }
  #modal h3 { font-size: 16px; margin-bottom: 4px; }
  #modal label { display: block; font-size: 11px; font-weight: 600; color: var(--text-2); margin: 14px 0 5px; }
  #modal input, #modal select, #modal textarea { width: 100%; padding: 9px 11px; font-size: 13px;
    background: var(--bg); color: var(--text); border: 1px solid var(--border-light); border-radius: 8px; }
  .msg { margin-top: 12px; font-size: 12px; color: var(--text-2); }
  #toasts { position: fixed; bottom: 20px; right: 20px; z-index: 99; display: flex; flex-direction: column; gap: 8px; }
  .toast { background: #12201a; color: #eaf3ee; border-left: 3px solid #07C160;
    padding: 11px 16px; border-radius: 8px; font-size: 12px; box-shadow: 0 12px 30px rgba(0,0,0,.25);
    opacity: 0; transform: translateY(8px); transition: all .25s; }
  .toast.show { opacity: 1; transform: none; }
  .toast.err { border-left-color: #ef4444; }
  .feed { max-height: 60vh; overflow: auto; }
  .feed-title { display: flex; align-items: center; gap: 8px; }
  .ev { display: flex; gap: 10px; align-items: center; padding: 9px 2px;
    border-bottom: 1px solid var(--surface-2); font-size: 12px; }
  .ev:last-child { border-bottom: 0; }
  .ev-b { flex: 0 0 auto; }
  .ev-b.ok { background: var(--accent-dim); color: var(--accent); }
  .ev-b.err { background: #fbeaea; color: var(--danger); }
  .ev-b.gold { background: #fdf3e2; color: var(--warn); }
  .ev-b.dim { background: var(--surface-2); color: var(--text-3); }
  .ev-main { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dim { color: var(--text-3); font-size: 11px; }

  @media (max-width: 1080px) {
    .dash-grid { grid-template-columns: 1fr; }
  }
  @media (max-width: 860px) {
    .app { flex-direction: column; }
    .sidebar { width: 100%; height: auto; flex: none; position: sticky; top: 0; z-index: 20;
      flex-direction: row; align-items: center; padding: 8px 12px; gap: 6px; overflow-x: auto; }
    .sidebar-brand, .sidebar-foot, .nav-label { display: none; }
    .nav { flex-direction: row; gap: 2px; overflow-x: auto; flex: 1; }
    .nav-item { width: auto; padding: 9px; gap: 0; position: relative; }
    .nav-item span:not(.nav-badge) { display: none; }
    .nav-badge { position: absolute; top: 2px; right: 2px; margin: 0; }
    .topbar { position: static; padding: 14px 16px; }
    .content { padding: 18px 16px 60px; }
    .kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .search { width: 100%; }
    .toolbar, .toolbar-right { width: 100%; }
    .quick-grid { grid-template-columns: 1fr; }
  }
  @media (max-width: 520px) {
    .kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .kpi { padding: 13px 14px; }
    .kpi-value { font-size: 22px; }
    .page-heading h1 { font-size: 18px; }
    .top-actions .badge { display: none; }
    .legend { font-size: 10px; gap: 10px; }
  }
  @media (max-width: 380px) {
    .kpi-grid { grid-template-columns: 1fr; }
  }
`;
