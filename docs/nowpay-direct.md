# Optional NowPay Direct hosted month pack

[简体中文](nowpay-direct.zh-CN.md) · [pricing](../PRICING.md) · [server installation](../deploy/README.md)

This mode implements authorization decision `2026-10-auth-1` and the approved Personal offer: CNY 29, one calendar MONTH, manual purchase, no automatic renewal. Local rendering, the editor-independent CLI, Obsidian and self-hosted publishing keep their existing free terms. Installing this integration does not open public sales.

## Deployment and trust

The Direct issuer deployment is Linux/systemd with Unix-domain socket half-close framing. Windows named pipes are not a supported issuer transport; Windows still runs the platform-independent metering/verifier tests.

Install the versioned server archive and a separate released Commerce runtime using their standard installers. Commerce 0.1.2 / Permit 0.2.1 are the reviewed issuer baseline. Never deploy source links or borrow Pitboard's package scope. The `commerce-issuer` OS account owns the private provider credentials, Permit signing key, 0700 state directory and authorization SQLite database. Publy cannot read those keys or write that database. The issuer exposes only the packaged per-connection systemd Unix socket, mode 0660 for the product group. Back up both databases consistently and rehearse restoration before activation. Never roll an active Direct service back to a pre-Direct version: older binaries ignore the new configuration. Such a rollback requires stopping customer admission first and restoring the reviewed pre-activation configuration/state; an ordinary symlink change is insufficient.

Set this optional `hostedDirect` object in protected `server.json`; it is mutually exclusive with the Basic Collection checkout/admission and synthetic checkout:

```json
{
  "socketPath": "/run/commerce-nowpay.sock",
  "serviceId": "publy",
  "outProductId": "REPLACE_WITH_MANAGEMENT_PRODUCT_ID",
  "issuer": "REPLACE_WITH_REVIEWED_ISSUER",
  "racketExecutable": "/opt/commerce/current/racket/bin/racket",
  "verifierScript": "/opt/publy/server/current/racket/publy-hosted-admission-cli.rkt",
  "trustStore": "/etc/publy/permit-trust.json",
  "purchasingEnabled": false
}
```

The product ID must match the issuer's `out_product_id`, and service/issuer/trust must match its reviewed policy. Real IDs and private deployment records stay outside Git. Keep purchasing disabled in both services until the verified `charge.query` result reports ENABLED and the unique 29 CNY MONTH SKU, the merchant's receiving limits are known, and the current filing/application gates are satisfied. The issuer's optional `purchase_buyer_allowlist` supports named acceptance accounts without opening all customers. Product status may still display current ALLOW rights when new purchasing is disabled.

Every non-admin hosted submission, including a formerly free account, requires a fresh issuer query. The issuer signs a request-bound Permit entitlement only after its own live Alipay query; Publy independently verifies signature, account/product/service, monotonic revision, exact platform period and nonce freshness. A local paid-plan cache or browser return cannot grant access. The same check runs again before queued execution. Platform dates are converted from Asia/Shanghai to UTC, with an inclusive start and exclusive end; no invented 30-day month.

## Purchase and account recovery

Open `/hosted`. A first-time customer provides contact information and receives an API key before purchase. Keep that key in a password manager. An existing customer supplies the same key to restore the same account; contact information alone never discloses a key. Keys go in an authenticated request header and HttpOnly browser session, never a URL. The browser keeps the key only in its current session storage; closing it or changing devices requires the saved key. Operator-assisted key rotation remains the recovery path if it is lost.

`POST /v1/hosted/session` restores the browser session using the authenticated customer key. `POST /v1/hosted/status` queries current entitlement. Active rights return the exact validity and no purchase URL. PURCHASE_REQUIRED returns only a permitted official purchase URL and a locally generated QR image when both purchase gates allow it; the provider's QR field can be a web page, so it is not embedded as an image. DENY and unavailable responses grant nothing. The page offers refresh and a bounded visible-page polling window after purchase. After a server restart, use the API key to restore and query again. Payment on another device must return to the original purchase browser or restore that same account.

The return page performs a fresh check; it does not accept query-string payment claims. No card, annual, Studio or active-period repurchase is exposed in this mode. Expiry must be followed by a current PURCHASE_REQUIRED result before a later manual purchase.

## Metering and failures

Personal supports one bound Official Account, 30 successful draft tasks per provider-paid interval and 1 GB of active decoded attachment data. Reservations and immediate request claims share one SQLite transaction. Queued work reserves before admission and checks again at execution. An immutable operation key prevents a confirmed draft from being sent again after an old cache window or billing boundary. Known pre-draft failure or explicit remote rejection releases the slot; an unknown outcome holds both request identity and capacity until independently reconciled. A refund of an old purchase must never be simulated by deleting another period's local rights: current access is queried from the provider.

Successful work consumes one slot exactly once. Pending, sending and unknown work hold slots; bytes are held while attachments are active. No automatic overage charge is made. An operator's existing immediate-claim reconciliation verifies the live WeChat draft box before atomically settling the corresponding reservation. Scheduled unknown outcomes remain blocked; do not reset quota rows or force a resend to make an acceptance pass.

## Acceptance boundary

Synthetic tests cover socket identity binding, independent Permit verification, wrong nonce/service/product/subject, restart recovery, disabled purchase gates, current denial, request deduplication and atomic quota exhaustion. These do not prove a real Direct purchase or refund. Before public sales, record the real signed catalog result, a customer-confirmed purchase and exact active interval, restoration after restart, expiry/later purchase and the officially supported refund-to-withdrawal path. Basic Collection sandbox callbacks and refund tests are separate evidence. Retention/export, merchant limits, filing and real WeChat delivery gates remain in the existing launch issues. Do not claim them complete from library CI.
