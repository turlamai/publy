# Publy product and pricing plan

**English** · [简体中文](PRICING.zh-CN.md)

## Launch status and implementation boundaries

- Policy version: `2026-11-personal-nowpay-direct-1`, 2026-11-20. The owner approved Personal CNY 29 for one month, purchased manually without automatic renewal. This replaces the earlier multi-tier launch target; there is no existing customer cohort to migrate. **The offer is approved for implementation, not on sale or evidence that all launch gates have passed.**
- Entitlements cover delivered platforms only. New commercial plans do not change the LICENSE of released source. Source use, modification and redistribution rights are separate from official products, updates and services.
- Security fixes and reading, backing up or exporting your own data must not require another purchase. BYOK keys, payment-provider secrets and issuer private keys have different owners. Native hosts do not collect payment or issue credentials directly.

## Decision

**Free CLI/self-hosting with a prepaid hosted publishing month**

The first offer is **Personal: CNY 29 for one calendar month, one-time payment, no automatic renewal**. Only this offer may be enabled for the first launch. Annual, Studio and USD offers remain unavailable; existing catalog entries or UI choices do not authorize their sale.

Stable egress, credential lifecycle, scheduling and recovery are continuous services. Do not offer lifetime hosting, a theme-market commission, unlimited accounts or an enterprise SLA.

The selected launch route is Alipay NowPay Direct. Product eligibility, an effective account whitelist, completed merchant/application requirements and a sellable product are separate gates; eligibility does not enable checkout. Configure one `ONE_TIME_DURATION` / `MONTH` offer at CNY29 in the official management mini-program. Require the actual product capability to be `ENABLED` before offering a new purchase. Collection closing must not erase already purchased rights.

Contract: [official Direct guide](https://aipay.alipay.com/docs/vibe-pay/nowpay/direct/nowpay-direct.html) and [signed access decision](https://aipay.alipay.com/docs/vibe-pay/nowpay/direct/api-list/purchase_consult.md).

## Free and paid scope

Free / evaluation: CLI, typesetting, card rendering, official default themes, the Obsidian plugin and a self-hosted server are free. Generated content always remains exportable. No charge per local typesetting operation.

Paid Personal scope: 1 WeChat Official Account, 30 successful publishing jobs per paid month and 1 GB of active attachments. Payment covers stable egress, credential custody, scheduling and failure recovery. One job delivers one article/card draft to one account. Failures, retries and duplicate callbacks never count twice. WeChat platform limits still apply; no additional platform permissions are promised.

## Paid-period boundaries

Hosted usage is metered by account, not device. Direct supplies the authoritative `valid_from` / `valid_until` window in its signed access decision. Parse the documented Asia/Shanghai timestamps and normalize them to UTC for Permit and metering; do not recompute the provider's month from a local payment timestamp. The interval includes its start and excludes its end. A month is not a fixed 30 days. Repeated reads or page returns must not extend it.

There is no recurring debit agreement, renewal scheduler or cancellation step needed to prevent another charge. A further purchase requires a fresh explicit customer action. Direct does not allow another duration purchase while rights remain valid. Offer a later manual purchase only after expiry and a fresh provider decision requiring purchase; do not offer early renewal or stacked time. After expiry, hosted compute stops; local data remains readable and exportable. No automatic overage charge or hidden fair-use restriction. Refund rules, retention/deletion periods and total price must be clear before real checkout and verified end to end.

## Authorization decision for implementation

Decision revision: `2026-10-auth-1` (2026-10-23). This is a service design, not evidence of a deployed subscription. Permit [owns credential semantics](https://github.com/turlamai/permit/blob/main/docs/entitlement-v1.md); the product owns identity, quota and request admission.

- **Hosted right:** Commerce's explicit issuer path produces a Protocol v1 `entitlement` scoped only to this hosted service and its paid plan. Bind it to the authenticated account's opaque stable subject (`subject.type="account"`). Set `use_expires_at=paid_through`, `activation_required=false`, `installation_id=null`, `updates_through=null` and `features_through=null`; use explicit plan/service grants. No desktop activation lease or hardware/device limit is needed for an already online service.
- **Server enforcement:** the hosted service verifies the signed credential and product/subject scope against trusted server time, then checks the current authoritative entitlement revision, refund/suspension state and atomic account quota. Check before accepting a new billable request and before a queued job starts. An old signed snapshot, a client boolean, a checkout redirect or a copied API token is insufficient. A session authenticates the caller; it does not itself grant paid rights.
- **Metering:** keep consumption, remaining allowance, idempotency and quota reset in server-side durable state, outside the copyable Permit credential. Preserve the successful-work/failure/retry accounting defined above. Enforce the published exhaustion behavior without automatic overage bills.
- **Expiry, refunds and outage:** expiry stops new hosted work and follows the stated export/retention rules. Refunds and suspensions affect future request admission through current server state; define treatment of in-flight work in the service contract. Refunding an older order must not remove an independently paid later period. If authoritative admission state is unavailable, refuse new paid jobs safely; local, BYOK and self-hosted capabilities remain under their existing free terms.
- **Integration gate:** maintain stable `entitlement_id` with increasing `revision` and complete replacement snapshots for renewal/plan changes, without duplicate-event window extension. Separate account recovery, payment secrets, Permit signing keys and product/service credentials. Pin the exact Permit/Commerce versions and Offer policy; prove wrong-account rejection, stale-snapshot replay, renewal/cancellation/refund, quota races, expiry in a queue, outage and export. This does not require adding Permit to a free client or self-hosted deployment.

## Next gate before sales

Complete idempotent publishing, duplicate prevention, credential rotation, revocation and quotas in #7. Quotas follow the provider-paid interval normalized to UTC, do not roll over, and stop new jobs when exhausted without silent overage charges. At expiry, stop new hosted jobs, allow 30 days to export content, then delete hosted content copies; backup/log retention must be separately published with definite periods. Local content is unaffected. Hosting is not on sale.

Before the first sale, #17 must prove signed Direct decision-to-Permit issuance, product/account/request binding, provider period handling, active-period purchase refusal, expiry and later purchase, supported refund-to-withdrawal behavior and offer allowlisting. A page return grants no rights; a fresh authenticated access decision is required. The basic page-pay sandbox, including its monthly and refund tests, does not validate the Direct adapter. Do not fabricate payment events from an unbound `ALLOW` response or assume the old refund API applies to Direct. Merchant approval, contract acceptance and application review remain separate gates; configuring production keys does not pass them.

Execution entry: [issue #7](https://github.com/turlamai/publy/issues/7). Complete this bounded slice before expanding commercial features.

Portfolio role and shared boundaries: [PORTFOLIO](https://github.com/turlamai/turlamai.github.io/blob/master/PORTFOLIO.md).
