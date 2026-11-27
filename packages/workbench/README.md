# Publy workbench (development)

Shared browser/Glaze frontend following the source/preview prototype. From the root after `pnpm install --frozen-lockfile`, run `node scripts/build-workbench.mjs`, then serve `packages/workbench/dist` over local HTTP.

Local Markdown, built-in themes, explicitly selected raster images and experimental rich clipboard are implemented. Author HTML and remote images are not loaded. Clipboard requires a secure context and browser support; warnings block copying and delivery. Math and WeChat paste fidelity remain open.

The hosted dialog queries accounts, prepares an immutable request, requires explicit confirmation and reconciles uncertain outcomes without resending. Only request ID, account and title are persisted before submission; API keys and article data are never persisted. Origin-wide Web Locks serialize delivery and recovery; unsupported browsers fail closed. Pending results remain blocked until confirmed, and require reauthentication after reopening. Server CORS permits the exact public workbench origin on three endpoints. Local development does not grant production access.

`workbench-browser.yml` runs real headless Chromium with intercepted synthetic hosted responses and a local static server. No production calls are permitted by that test. Actual WeChat delivery, production deployment, stable desktop storage and native WebView acceptance remain open. Not publicly linked.
