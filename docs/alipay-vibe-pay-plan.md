# Publy hosted checkout: Alipay Vibe Pay plan

Owner preference, 2026-11-04: offer Alipay Vibe Pay first and pursue
collection as an individual. This selects the integration target; it does not
mean the owner or Publy has been admitted for live transactions.

The [official Vibe Pay overview](https://aipay.alipay.com/docs/vibe-pay.html)
describes basic collection and a separate smart collection suite. The latter
currently requires a partner platform; independent access is not yet open.
Publy should use the **basic web collection** path with Commerce's existing
Alipay adapter. The [official web guide](https://aipay.alipay.com/docs/vibe-pay/ai-web-app-payment-qianyi/ai-web-app-payment-integration-guide.html)
describes individual collection and the page-pay, asynchronous notification
and order-query flow. Actual account capability, product category, applicable
fees, settlement and refund terms require confirmation in the owner's own
Alipay account. General support for individuals is not approval for this
specific product or payment method.

Commerce remains the owner of checkout, payment evidence and refund
reconciliation. Publy owns authenticated customer identity and service quota;
Permit owns signed entitlement semantics. Checkout creation must bind the
server-selected offer, exact amount and opaque account subject before any
payment request. A browser return, unsigned callback, reused API key or a
local order marked paid must never grant hosted use. Provider callbacks and
independently verified query results must be reconciled through Commerce;
current verified rights and quota are checked before work is accepted and
again before a queued job executes.

The initial reviewed Commerce adapter covers a one-time CNY desktop web
payment and synthetic verification. It is not proof of mobile browser
coverage, automatic renewal, merchant admission, live refunds or successful
settlement. Monthly and annual service periods may be purchased as separate
one-time transactions only after their exact offers and lifecycle have been
implemented and verified; do not call them automatic subscriptions unless a
separate provider contract actually supports and authorizes renewal.

Before accepting money, finish the Commerce signer boundary, authenticated
Publy checkout and identity binding, entitlement and quota admission,
webhook/query reconciliation, refund and recovery flows, privacy/retention
terms, and the provider and merchant gates. Complete a sandbox drill first.
The owner must perform any Alipay identity verification and approve the final
go-live and any real-money test. Do not put private keys, identity documents,
payment data or account credentials in this repository or chat. Until then,
public checkout remains closed and local/self-hosted use remains free.
