// Build the Publy theme gallery (themes.publy.jrtx.site).
//
// Article themes are presented as LIVE rendered HTML in a fit-to-screen stage:
// the whole article is scaled to fit one viewport (page-thumbnail style, like
// Typora's theme gallery / mdnice print preview); clicking opens a native-size
// scrollable detail view. Card themes are real rendered PNG decks in a
// swipeable strip plus a full-screen paged lightbox.
//
// Usage: node scripts/build-gallery.mjs <publy-themes-repo-dir>
// The themes repo is written in place (previews/ + index.html); review and push.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const cli = path.join(repoRoot, "packages", "cli", "dist", "index.js");
const themesRepo = path.resolve(process.argv[2] ?? path.join(repoRoot, "..", "publy-themes"));

const ART_THEMES = ["claude", "medium", "wechat", "ink", "tech", "rose", "official", "fortune", "terminal", "news"];
const CARD_THEMES = ["naive", "claude", "wechat", "midnight"];

const articleSample = path.join(repoRoot, "packages", "cli", "samples", "article-sample.md");
const cardSample = path.join(repoRoot, "packages", "cli", "samples", "card-sample.md");

function run(cmd, args) {
  execFileSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
}

// --- render artifacts --------------------------------------------------------

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "publy-gallery-"));
const previewsDir = path.join(themesRepo, "previews");
fs.mkdirSync(previewsDir, { recursive: true });

const articles = {}; // theme -> html string
for (const theme of ART_THEMES) {
  const out = path.join(tmp, `${theme}.html`);
  // the dark terminal theme pairs with a dark code highlight
  const highlight = theme === "terminal" ? "github-dark" : "github";
  run("node", [cli, "render", articleSample, "--theme", theme, "--highlight", highlight, "-o", out]);
  articles[theme] = fs.readFileSync(out, "utf-8");
}

const decks = {}; // theme -> [{file, label}]
for (const theme of CARD_THEMES) {
  const deckDir = path.join(tmp, `cards-${theme}`);
  fs.rmSync(deckDir, { recursive: true, force: true });
  run("node", [cli, "card", cardSample, "--theme", theme, "--out", deckDir]);
  const pubDir = path.join(previewsDir, `cards-${theme}`);
  fs.rmSync(pubDir, { recursive: true, force: true });
  fs.cpSync(deckDir, pubDir, { recursive: true });
  decks[theme] = fs
    .readdirSync(deckDir)
    .filter((f) => f.endsWith(".png"))
    .sort()
    .map((f) => ({ file: `previews/cards-${theme}/${f}`, label: f.replace(/\.png$/, "") }));
  fs.copyFileSync(path.join(deckDir, decks[theme][0].file.split("/").pop()), path.join(previewsDir, `card-${theme}.png`));
}

// article html also published as standalone files (openable directly)
for (const theme of ART_THEMES) {
  fs.writeFileSync(path.join(previewsDir, `${theme}.article.html`), articles[theme]);
}

// --- gallery page -------------------------------------------------------------

function articleTemplates() {
  return ART_THEMES.map((t) => `<template id="art-${t}">${articles[t]}</template>`).join("\n");
}

function articleDarkDivs() {
  // hidden native-size copies for the 100% detail modal
  return ART_THEMES.map((t) => `<div id="full-${t}" style="display:none">${articles[t]}</div>`).join("\n");
}

function deckMarkup() {
  return CARD_THEMES.map((t) => {
    const imgs = decks[t]
      .map((c, i) => `<img src="${c.file}" alt="${t} ${i + 1}" loading="lazy" data-deck="${t}" data-idx="${i}">`)
      .join("\n      ");
    return `
    <div class="theme-block">
      <div class="theme-head"><h3>${t}</h3><button class="mini" onclick="openLightbox('${t}', 0)">全屏翻阅</button></div>
      <div class="deck" id="deck-${t}">
      ${imgs}
      </div>
    </div>`;
  }).join("\n");
}

const articleTabs = ART_THEMES.map(
  (t, i) => `<button class="tab${i === 0 ? " sel" : ""}" onclick="pickTheme('${t}', this)">${t}</button>`,
).join("\n      ");

const page = `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Publy Theme Gallery</title>
<meta name="description" content="Publy 主题画廊：整页缩略预览 + 100% 详览，文章主题真实 HTML 同篇对比；图片消息卡片真实出图滑动翻阅。">
<style>
  :root { --bg:#111; --card:#1c1c1c; --text:#eee; --muted:#999; --accent:#07C160; --border:#2a2a2a; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; padding: 48px 24px 80px; }
  .container { max-width: 1080px; margin: 0 auto; }
  h1 { font-size: 26px; margin-bottom: 8px; }
  .lead { color: var(--muted); margin-bottom: 36px; line-height: 1.7; font-size: 14px; }
  .lead code { color: var(--accent); }
  section { margin-bottom: 64px; }
  h2 { font-size: 14px; letter-spacing: 3px; text-transform: uppercase; color: var(--muted); margin-bottom: 16px; }
  .bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 12px; }
  .tab { padding: 8px 20px; background: var(--card); color: var(--text); border: 1px solid var(--border); border-radius: 999px; cursor: pointer; font-size: 14px; }
  .tab.sel { border-color: var(--accent); color: var(--accent); background: rgba(7,193,96,.08); }
  .wt { margin-left: auto; display: flex; gap: 6px; align-items: center; }
  .wt span { font-size: 12px; color: var(--muted); }
  .wt button { padding: 8px 14px; font-size: 12px; }
  .wt .sel { border-color: var(--accent); color: var(--accent); }
  .stage { height: 78vh; background: #060606; border: 1px solid var(--border); border-radius: 16px; display: flex; justify-content: center; align-items: flex-start; overflow: hidden; padding: 14px; cursor: zoom-in; position: relative; }
  .stage:hover::after { content: "点击进入 100% 详览"; position: absolute; right: 14px; bottom: 10px; font-size: 12px; color: var(--accent); background: rgba(0,0,0,.65); padding: 4px 10px; border-radius: 999px; }
  .sizer { position: relative; }
  .page { transform-origin: top left; position: absolute; top: 0; left: 0; box-shadow: 0 10px 40px rgba(0,0,0,.55); border-radius: 6px; overflow: hidden; }
  .toolbar { display: flex; gap: 14px; align-items: center; margin-top: 12px; font-size: 12px; color: var(--muted); flex-wrap: wrap; }
  .toolbar .mini { padding: 6px 14px; font-size: 12px; background: var(--card); color: var(--text); border: 1px solid var(--border); border-radius: 999px; cursor: pointer; }
  .toolbar .mini:hover { border-color: var(--accent); color: var(--accent); }
  .theme-block { margin-bottom: 44px; }
  .theme-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
  .theme-head h3 { font-size: 16px; }
  .mini { padding: 6px 14px; font-size: 12px; background: var(--card); color: var(--text); border: 1px solid var(--border); border-radius: 999px; cursor: pointer; }
  .mini:hover { border-color: var(--accent); color: var(--accent); }
  .deck { display: flex; gap: 14px; overflow-x: auto; scroll-snap-type: x mandatory; padding: 4px 2px 14px; }
  .deck img { height: 430px; border-radius: 14px; scroll-snap-align: start; cursor: zoom-in; box-shadow: 0 6px 24px rgba(0,0,0,.45); }
  .lightbox, .zoom { display: none; position: fixed; inset: 0; background: rgba(0,0,0,.92); z-index: 50; }
  .lightbox.open, .zoom.open { display: flex; }
  .lightbox { align-items: center; justify-content: center; }
  .lightbox img { max-height: 92vh; max-width: 88vw; border-radius: 10px; }
  .lb-btn { position: fixed; top: 50%; transform: translateY(-50%); font-size: 42px; color: #fff; background: none; border: 0; cursor: pointer; padding: 20px; user-select: none; }
  .lb-prev { left: 12px; } .lb-next { right: 12px; }
  .lb-close, .zoom-close { position: fixed; top: 18px; right: 24px; font-size: 28px; color: #fff; background: rgba(0,0,0,.4); border: 1px solid #444; border-radius: 999px; width: 44px; height: 44px; cursor: pointer; z-index: 61; }
  .zoom { flex-direction: column; }
  .zoom-bar { display: flex; gap: 10px; align-items: center; padding: 10px 18px; background: #161616; font-size: 13px; color: var(--muted); }
  .zoom-bar button { padding: 6px 14px; font-size: 12px; background: #222; color: #ddd; border: 1px solid #3a3a3a; border-radius: 999px; cursor: pointer; }
  .zoom-bar button.sel { border-color: var(--accent); color: var(--accent); }
  .zoom-body { flex: 1; overflow: auto; display: flex; justify-content: center; padding: 22px; }
  .zoom-page { width: 700px; box-shadow: 0 10px 40px rgba(0,0,0,.6); border-radius: 6px; overflow: hidden; }
  .hint { color: var(--muted); font-size: 12px; margin-top: 10px; line-height: 1.8; }
  footer { margin-top: 40px; text-align: center; color: var(--muted); font-size: 13px; }
  footer a { color: var(--accent); text-decoration: none; }
</style>
</head>
<body>
<div class="container">
  <h1>Publy Theme Gallery</h1>
  <p class="lead">文章主题以<strong>整页缩略图</strong>呈现——一篇的全貌一屏看尽，点击进入 100% 原大详览；同篇切主题即时对比。图片消息卡片是确定性引擎的真实出图，按真实翻阅方式滑动。本地试用：<code>publy theme preview &lt;name&gt;</code></p>

  <section>
    <h2>Article themes · 公众号文章排版</h2>
    <div class="bar">
      ${articleTabs}
      <span class="wt">
        <span>设计宽</span>
        <button class="tab sel" onclick="setWidth(700, this)">700</button>
        <button class="tab" onclick="setWidth(414, this)">414（手机）</button>
      </span>
    </div>
    <div class="stage" id="stage" onclick="openZoom()" title="点击进入 100% 详览">
      <div class="sizer" id="sizer">
        <div class="page" id="page"><div id="page-inner">${articles[ART_THEMES[0]]}</div></div>
      </div>
    </div>
    <div class="toolbar">
      <button class="mini" onclick="openZoom()">100% 原大详览</button>
      <span>整页缩略图：自动缩放至一屏看全 · 阅读体验以 100% 详览为准（缩略图字号缩小属正常）</span>
    </div>
  </section>

  <section>
    <h2>Card themes · 图片消息卡片</h2>
    ${deckMarkup()}
    <p class="hint">滑动查看整组卡片；点任意卡片全屏翻阅。发布时卡片组按此顺序上传，首图为封面。</p>
  </section>

  <footer>
    Powered by <a href="https://github.com/turlamai/publy">Publy</a> ·
    <a href="https://publy.jrtx.site/">产品主页</a> ·
    <a href="https://github.com/turlamai/publy-themes">提交主题 (PR)</a>
  </footer>
</div>

${articleTemplates()}
${articleDarkDivs()}

<div class="lightbox" id="lb" onclick="if(event.target===this)closeLb()">
  <button class="lb-close" onclick="closeLb()">✕</button>
  <button class="lb-btn lb-prev" onclick="step(-1)">‹</button>
  <img id="lb-img" src="" alt="">
  <button class="lb-btn lb-next" onclick="step(1)">›</button>
</div>

<div class="zoom" id="zm">
  <button class="zoom-close" onclick="closeZoom()">✕</button>
  <div class="zoom-bar">
    <strong id="zm-theme" style="color:#eee">claude</strong>
    <span>·</span><span>100% 原大</span>
    <span style="margin-left:14px">设计宽</span>
    <button class="sel" onclick="zmWidth(700, this)">700</button>
    <button onclick="zmWidth(414, this)">414（手机）</button>
    <span style="margin-left:auto"></span>
    <button onclick="closeZoom()">关闭</button>
  </div>
  <div class="zoom-body"><div class="zoom-page" id="zm-page"></div></div>
</div>

<script>
  let curTheme = ${JSON.stringify(ART_THEMES[0])};
  let designW = 700;
  const $ = (id) => document.getElementById(id);

  function injectArticle(containerId, theme) {
    const el = $(containerId);
    el.innerHTML = '';
    const src = $('full-' + theme);
    el.appendChild(src.firstElementChild.cloneNode(true));
  }

  function pickTheme(theme, btn) {
    curTheme = theme;
    document.querySelectorAll('.bar .tab').forEach(b => { if (!b.parentElement.classList.contains('wt')) b.classList.remove('sel'); });
    if (btn) btn.classList.add('sel');
    injectArticle('page-inner', theme);
    fit();
    $('zm-theme').textContent = theme;
    zmFill(theme);
  }

  function setWidth(w, btn) {
    designW = w;
    document.querySelectorAll('.wt .tab').forEach(b => b.classList.remove('sel'));
    if (btn) btn.classList.add('sel');
    fit();
    zmWidth(w, document.querySelectorAll('.zoom-bar button')[document.querySelectorAll('.zoom-bar button').length - 2]);
  }

  function fit() {
    const stage = $('stage'), sizer = $('sizer'), page = $('page');
    page.style.transform = 'none';
    page.style.width = designW + 'px';
    const h = page.scrollHeight;
    const availH = stage.clientHeight - 28;
    const availW = stage.clientWidth - 28;
    const s = Math.min(1, availH / h, availW / designW);
    page.style.transform = 'scale(' + s + ')';
    sizer.style.width = (designW * s) + 'px';
    sizer.style.height = (h * s) + 'px';
  }

  // --- 100% zoom modal ---
  let zmW = 700;
  function zmFill(theme) { injectArticle('zm-page', theme); $('zm-page').style.width = zmW + 'px'; }
  function openZoom() {
    zmFill(curTheme);
    $('zm-theme').textContent = curTheme;
    $('zm').classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeZoom() { $('zm').classList.remove('open'); document.body.style.overflow = ''; }
  function zmWidth(w, btn) {
    zmW = w;
    $('zm-page').style.width = w + 'px';
    const btns = document.querySelectorAll('.zoom-bar button');
    btns.forEach(b => b.classList.remove('sel'));
    if (btn) btn.classList.add('sel');
  }

  // --- card lightbox ---
  let lbDeck = null, lbIdx = 0;
  function openLightbox(deck, idx) { lbDeck = deck; lbIdx = idx; renderLb(); $('lb').classList.add('open'); }
  function renderLb() { $('lb-img').src = decks[lbDeck][lbIdx].file; }
  function step(d) { const list = decks[lbDeck]; lbIdx = (lbIdx + d + list.length) % list.length; renderLb(); }
  function closeLb() { $('lb').classList.remove('open'); }

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeLb(); closeZoom(); }
    if ($('lb').classList.contains('open')) {
      if (e.key === 'ArrowLeft') step(-1);
      if (e.key === 'ArrowRight') step(1);
    }
  });
  document.querySelectorAll('.deck img').forEach(img => img.onclick = () => openLightbox(img.dataset.deck, +img.dataset.idx));
  window.addEventListener('resize', fit);
  window.addEventListener('load', () => setTimeout(fit, 200));
  const decks = ${JSON.stringify(decks)};
  fit();
</script>
</body>
</html>`;

fs.writeFileSync(path.join(themesRepo, "index.html"), page);

// prune obsolete article screenshots
for (const theme of ART_THEMES) {
  fs.rmSync(path.join(previewsDir, `${theme}.png`), { force: true });
  fs.rmSync(path.join(previewsDir, `${theme}-shot.html`), { force: true });
}

console.log("gallery built →", themesRepo);
console.log("article themes (live html):", ART_THEMES.join(", "));
console.log("card decks:", CARD_THEMES.map((t) => `${t}(${decks[t].length})`).join(", "));
