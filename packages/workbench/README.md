# Publy workbench (development)

Shared browser/Glaze frontend following the source/preview prototype. From the root after `pnpm install --frozen-lockfile`, run `node scripts/build-workbench.mjs`, then serve `packages/workbench/dist` over local HTTP.

Local Markdown, built-in themes, explicitly selected raster images and experimental rich clipboard are implemented. Author HTML and remote images are not loaded. Clipboard requires a secure context and browser support; warnings block copying and delivery. Basic TeX and AMS formulas render locally into PNG attachments. Card mode uses the same Core layout and bundled fonts as the CLI. It previews and downloads 1080 × 1440 PNGs, then sends those same bytes only after explicit image-draft confirmation. WeChat paste fidelity remains open.

The hosted dialog queries accounts, prepares an immutable request, requires explicit confirmation and reconciles uncertain outcomes without resending. Only request ID, account and title are persisted before submission; API keys and article data are never persisted. Origin-wide Web Locks serialize delivery and recovery; unsupported browsers fail closed. Pending results remain blocked until confirmed, and require reauthentication after reopening. Server CORS permits the exact public workbench origin on three endpoints. Local development does not grant production access.

The Linux matrix step in `ci.yml` runs real headless Chromium with intercepted synthetic hosted responses and a local static server. No production calls are permitted by that test. The Glaze smoke exercises native delivery, readback and the card preview using a synthetic upstream. Actual WeChat delivery and production deployment remain open.

Browser acceptance pins the Linux test matrix to Ubuntu 24.04 to match Playwright 1.51.1's supported operating systems. Ubuntu 26.04 runners failed before launching Chromium; keep the pin until the browser driver and runner are upgraded together.
