# Publy workbench (development)

Shared browser/Glaze frontend, following `design/prototype/preview-article.html`'s source/preview split. From the root after `pnpm install --frozen-lockfile`, run `node scripts/build-workbench.mjs`, then serve `packages/workbench/dist` with a local static HTTP server. Not linked from the public site. Text preview only; no images, math, copy or delivery yet. Source stays in memory and is never sent to a server. No account or payment integration in this slice. Browser and native WebView runtime acceptance pending.
