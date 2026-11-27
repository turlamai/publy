# Publy data and privacy status

**English** · [简体中文](privacy.zh-CN.md)

Public hosted purchasing opened on 2026-11-26. For the operated service, Publy processes the account contact you register, your API key, the delivery-job metadata and payloads needed to create your drafts, service audit logs, and payment references returned by Alipay. Article content is only processed to deliver your draft; nothing is mass-sent or publicly posted. The self-hosting sections below describe the free path.

| Data | Actual boundary |
|---|---|
| Source Markdown/media | Kept locally; delivery sends rendered content/media through the selected server to WeChat |
| Client API key | Can be stored in ~/.publy/config.json; protect it as a secret |
| AppID / AppSecret | The static server.json example contains plaintext secrets; other binding paths need encryption/master-key review |
| Jobs, history and caches | Queues, history.jsonl, databases and caches can persist data; do not claim that no content is ever stored |
| External communication | Package/theme registries, the selected server, official WeChat APIs and configured webhooks have distinct data recipients |

Self-hosting operators own file permissions, HTTPS/private tunnels, authentication, log redaction, encrypted backups and verified restore. Never publish a WebSocket URL containing a key. Unbinding inside an app does not necessarily revoke a WeChat credential or delete old backup copies; rotate exposed credentials at their issuer.

The complete hosted data-handling terms — operator identity, per-field retention, export/deletion paths and incident response — are being finalised against the running implementation and will be published on this page. Until then, the hosted service processes the minimal set described above; paid accounts may request account deletion via the repository Issues (do not post personal data or credentials publicly).
