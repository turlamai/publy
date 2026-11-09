# Hosted checkout configuration (Publy side)

Status: **wiring and UI implemented; paid admission is not yet enabled.** Do not
turn this on for customers until the Commerce hosted-entitlement admission and
Publy quota/admission slice is complete. A configured checkout can create a
real Alipay order; it does not by itself grant hosted rights.

## Flow

1. `GET /hosted` — public purchase page. Without `hostedCheckout` it shows
   “支付通道正在接入” and no prices or pay button.
2. `POST /v1/signup` — public, rate-limited (5/hour/IP), only when
   `hostedCheckout` exists. Creates a **free** local user, enrols a stable
   hosted subject, returns `{ userId, apiKey, subject }`. Duplicate contacts
   return `409 CONTACT_TAKEN` and never reveal an existing key.
3. `POST /v1/hosted/checkout` — authenticated with the user key and
   `{ offer, requestId }`. Amount comes from the server-owned offer table,
   never from the browser. Returns Commerce's signed Alipay fields.
4. The browser submits those fields to the Alipay gateway. A **browser return
   is display-only**; only the Commerce callback/query may confirm payment.

## `server.json`

```json
{
  "apiKey": "…",
  "accounts": [{ "name": "My Account", "appId": "wx…", "appSecret": "…" }],
  "publicUrl": "https://publy-api.example.com",
  "hostedCheckout": {
    "endpoint": "https://commerce.example.com/v1/hosted/alipay-checkout",
    "serviceId": "publy",
    "issuer": "example",
    "appId": "2026…",
    "merchantPublicKeyPem": "-----BEGIN PUBLIC KEY-----\n…\n-----END PUBLIC KEY-----",
    "notifyUrl": "https://commerce.example.com/webhooks/alipay",
    "returnUrl": "https://publy-api.example.com/hosted/return",
    "environment": "sandbox",
    "secretFile": "/etc/publy/commerce.hmac"
  }
}
```

- `secretFile` must be an absolute path to the raw 32–128 byte Commerce service
  HMAC key, readable only by the service user. It is never returned in config or
  logs. Do not inline the key in JSON.
- `endpoint` must end in `/v1/hosted/alipay-checkout`; HTTPS unless loopback.
- `environment` is `sandbox` or `production`; sandbox and production credentials
  must never be mixed.
- `merchantPublicKeyPem` verifies Commerce's response; it is a public key.

## Security / limits

- Signup does not verify the contact. It is an account-creation convenience for
  the purchase flow, not proof of identity; account recovery is not implemented.
- Request IDs are per user+subject and 16–128 chars. Reuse the same one across
  retries; a new ID may create another order.
- A 503 `CHECKOUT_OUTCOME_UNKNOWN` is not a failure: query/keep the same request
  ID and check Commerce before retrying.
- Do not enable this until the entitlement admission slice (`#17`) is live and
  the sandbox drill (payment → callback → Permit → publish → refund) passes.

## Tests

`packages/server/src/hosted-purchase.test.ts` covers config parsing, secret
non-disclosure, signup gating/duplicates, page closed/open states and a signed
Commerce checkout response.

## Admission / activation (current slice)

`hostedAdmission` is a second, independent config block:

```json
{
  "hostedAdmission": {
    "endpoint": "https://commerce.example.com/v1/hosted/proof",
    "serviceId": "publy",
    "secretFile": "/etc/publy/commerce.hmac",
    "issuer": "example",
    "offerId": "publy-personal-monthly",
    "racketExecutable": "/usr/bin/racket",
    "verifierScript": "/opt/publy/racket/publy-hosted-admission-cli.rkt",
    "trustStore": "/etc/publy/permit-trust.json",
    "enroll": false
  }
}
```

When set, a non-admin user on `personal`/`studio` must pass a current
Commerce proof plus the local Permit admission check before **every** immediate
publish and again when a scheduled job starts. The proof is queried for the
offer most recently recorded by `/v1/hosted/checkout` (falling back to the
configured `offerId`), and a durable fence rejects lower revisions, lineage
changes and replay.

`GET /hosted/return` (set `hostedCheckout.returnUrl` to it) can sync the local
plan after payment. It uses an HttpOnly, one-hour, in-memory session cookie,
re-queries Commerce for that exact offer, verifies the Permit edition at the
current time, and only then sets `users.plan/expires_at`. A URL return alone
never grants anything. Sessions do not survive a server restart; a paid user
whose return was lost is recovered by the operator (durable claim sessions are
a later slice).

The existing monthly user usage counter is still the quota source; the hosted
quota ledger is not yet wired. Do not open sales until the sandbox drill and
the quota slice pass.
