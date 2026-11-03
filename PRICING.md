# Publy product and pricing plan

**English** · [简体中文](PRICING.zh-CN.md)

## Launch status and implementation boundaries

- Policy version: `2026-10-v2`, 2026-10-23. The owner confirmed that every product is still in development and has no actual users. This document replaces conflicting previous pricing, early-bird and Pro proposals; there is no existing customer cohort to migrate. **Prices are launch targets, not live offers or claims that the listed features are implemented.**
- Entitlements cover delivered platforms only. New commercial plans do not change the LICENSE of released source. Source use, modification and redistribution rights are separate from official products, updates and services.
- Security fixes and reading, backing up or exporting your own data must not require another purchase. BYOK keys, payment-provider secrets and issuer private keys have different owners. Native hosts do not collect payment or issue credentials directly.

## Decision

**Free CLI/self-hosting with a hosted publishing subscription**

Launch target: **Personal: ¥29 / US$5 per month, or ¥290 / US$50 per year. Studio: ¥79 / US$12 per month, or ¥790 / US$120 per year**. CNY and USD are independently set regional targets, not a live exchange-rate conversion.

Stable egress, credential lifecycle, scheduling and recovery are continuous services. Use two subscription tiers rather than lifetime hosting, a theme-market commission, unlimited accounts or an enterprise SLA.

## Free and paid scope

Free / evaluation: CLI, typesetting, card rendering, official default themes, the Obsidian plugin and a self-hosted server are free. Generated content always remains exportable. No charge per local typesetting operation.

Paid: Personal: 1 WeChat Official Account, 30 successful publishing jobs per month and 1 GB of active attachments. Studio: 3 accounts, 150 successful jobs per month and 5 GB. Payment covers stable egress, credential custody, scheduling and failure recovery. One job delivers one article/card draft to one account. Failures, retries and duplicate callbacks never count twice. WeChat platform limits still apply; no additional platform permissions are promised.

## Subscription boundaries

Hosted usage is metered by account, not device. Service within the current monthly/annual period follows the published allowance. Cancellation stops renewal, while the paid period remains available. After expiry, hosted compute stops; local data remains readable and exportable. No lifetime hosting, automatic overage charge or hidden fair-use restriction. An annual prepayment does not reduce the obligation to provide the paid service. Cancellation/refund rules, retention/deletion periods, model lists and total price must be clear before real checkout and verified end to end.

## Authorization decision for implementation

Decision revision: `2026-10-auth-1` (2026-10-23). This is a service design, not evidence of a deployed subscription. Permit [owns credential semantics](https://github.com/turlamai/permit/blob/main/docs/entitlement-v1.md); the product owns identity, quota and request admission.

- **Hosted right:** Commerce's explicit issuer path produces a Protocol v1 `entitlement` scoped only to this hosted service and its paid plan. Bind it to the authenticated account's opaque stable subject (`subject.type="account"`). Set `use_expires_at=paid_through`, `activation_required=false`, `installation_id=null`, `updates_through=null` and `features_through=null`; use explicit plan/service grants. No desktop activation lease or hardware/device limit is needed for an already online service.
- **Server enforcement:** the hosted service verifies the signed credential and product/subject scope against trusted server time, then checks the current authoritative entitlement revision, refund/suspension state and atomic account quota. Check before accepting a new billable request and before a queued job starts. An old signed snapshot, a client boolean, a checkout redirect or a copied API token is insufficient. A session authenticates the caller; it does not itself grant paid rights.
- **Metering:** keep consumption, remaining allowance, idempotency and quota reset in server-side durable state, outside the copyable Permit credential. Preserve the successful-work/failure/retry accounting defined above. Enforce the published exhaustion behavior without automatic overage bills.
- **Cancellation and outage:** cancellation stops renewal, not the already paid period. Expiry stops new hosted work and follows the stated export/retention rules. Refunds and suspensions affect future request admission through current server state; define treatment of in-flight work in the service contract. If authoritative admission state is unavailable, refuse new paid jobs safely; local, BYOK and self-hosted capabilities remain under their existing free terms.
- **Integration gate:** maintain stable `entitlement_id` with increasing `revision` and complete replacement snapshots for renewal/plan changes, without duplicate-event window extension. Separate account recovery, payment secrets, Permit signing keys and product/service credentials. Pin the exact Permit/Commerce versions and Offer policy; prove wrong-account rejection, stale-snapshot replay, renewal/cancellation/refund, quota races, expiry in a queue, outage and export. This does not require adding Permit to a free client or self-hosted deployment.

## Next gate before sales

Complete idempotent publishing, duplicate prevention, credential rotation, revocation and quotas in #7. Quotas follow the UTC payment billing cycle, do not roll over, and stop new jobs when exhausted without silent overage charges. Cancellation leaves the paid period available. At expiry, stop new hosted jobs, allow 30 days to export content, then delete hosted content copies; backup/log retention must be separately published with definite periods. Local content is unaffected. Hosting is not on sale.

Execution entry: [issue #7](https://github.com/turlamai/publy/issues/7). Complete this bounded slice before expanding commercial features.

Portfolio role and shared boundaries: [PORTFOLIO](https://github.com/turlamai/turlamai.github.io/blob/master/PORTFOLIO.md).
