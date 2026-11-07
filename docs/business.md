# Commercial design notes

**English** · [简体中文](business.zh-CN.md)

This file explains the tradeoff only. Root [PRICING.md](../PRICING.md) is the sole implementation policy for prices, authorization, quotas and launch gates. There are no actual users or open purchases. Earlier revenue forecasts, early-bird, team and unlimited plans are retired in Git history rather than retained as implementation instructions.

CLI, local rendering, default themes, Obsidian and self-hosting stay free. Future hosting charges for stable egress, credential custody, scheduling and recoverable delivery; a delivered draft is not a public post. No unlimited compute/delivery or theme marketplace is planned. Prove the single-account fixed-egress pilot in #8 before the idempotency, unknown-outcome recovery, tenant boundaries and deletion/recovery work in #7.

[Public use and limitations](USER-GUIDE.md). Customer navigation must not substitute these notes or draft prices for actual usage instructions.

## Commercialization audit (2026-11-07)

Outcome of issue #44. This classifies the product for the shared
Permit/Commerce gate; it is not permission to charge money.

- **Shipped surface.** A free/open-source CLI and local renderer (development
  build), the free self-hosted server, Racket sidecars and the Obsidian
  plugin. The CLI and plugin are distribution artifacts, not paid licences;
  the source licence is unchanged.
- **Paid edition.** None is activated. The only planned commercial service is
  the optional hosted WeChat-draft delivery subscription in [PRICING.md](../PRICING.md)
  (`2026-10-v2`, authorization decision `2026-10-auth-1`). There is no
  perpetual licence, trial lease, device or seat limit, or offline activation;
  local, BYOK and self-hosted use stays free.
- **Rights plumbing.** Commerce owns offers, payment evidence and refunds;
  Permit owns signed entitlement semantics; Publy owns authenticated account
  identity, current-right checks and atomic quota at admission and execution.
  Publy contains no second signer or payment authority, and no client flag,
  browser return or local order grants access.
- **Evidence and gaps.** Synthetic Commerce/Permit proof, tamper, stale
  revision and cross-account rejection, sandbox checkout, and a sandbox
  payment/refund reconciled by a signed provider query are recorded in #7 and
  the released integration work. They do not establish production entitlement
  enforcement, publicly reachable provider callbacks, merchant admission or
  service operations.
- **Decision.** Checkout and paid admission stay closed until #17 and the
  upstream gates [commerce#27](https://github.com/turlamai/commerce/issues/27)
  and [permit#15](https://github.com/turlamai/permit/issues/15) are satisfied,
  the fixed-egress pilot in #8 and readiness items in #7 are accepted, and
  retention, backup and merchant terms are published. Free paths remain
  available; no price, purchase link or availability claim may be published
  before that evidence exists.
