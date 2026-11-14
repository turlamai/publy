# Commerce interoperability probes

These probes are development checks, not Alipay sandbox transactions or
permission to open checkout. They use temporary keys/data and loopback
listeners; neither submits to an Alipay gateway nor creates a WeChat draft.

Build the workspace first. Use clean package checkouts at these exact commits:

- Commerce: `af6494a18109b96f94e53cac96fbb4769af9ccc4`
- Permit: `a55632bb5e380aebfc114b9069b7abd7218c2386`

Install these as ordinary Racket packages and run:

```sh
COMMERCE_ROOT=/path/to/commerce PERMIT_ROOT=/path/to/permit \
  node scripts/verify-commerce-checkout.mjs
COMMERCE_ROOT=/path/to/commerce PERMIT_ROOT=/path/to/permit \
  node scripts/verify-commerce-shadow.mjs
```

The checkout probe verifies real Racket-generated merchant page-pay fields in
Publy, then exercises authenticated scope, exact amount, same-order retry and
the sandbox-only Publy HTTP route. OpenAPI request signatures include
`sign_type`; asynchronous notification signatures exclude it. The reference
is [Alipay's official SDK signing implementation](https://github.com/alipay/alipay-sdk-nodejs-all/blob/master/src/util.ts).
Fixture signatures must not reuse the notification rule for outbound requests.

The shadow probe independently verifies signed Permit snapshots, withdrawal
and revision fencing, scope rejection, and durable conservative quota state.
It is not an end-to-end purchase/entitlement fulfilment demonstration. Both
probes run in the `commerce-shadow` CI job against the pinned packages.

Missing merchant approval, public callback/active-query reconciliation,
refund/recovery, authoritative hosted quota integration and real deployment
evidence remain tracked in Publy #17/#8 and Commerce #23/#4/#5. Never replace
those gates with synthetic probe success. No customer data or private keys
belong in probe output or Git.
