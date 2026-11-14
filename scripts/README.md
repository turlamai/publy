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
COMMERCE_ROOT=/path/to/commerce PERMIT_ROOT=/path/to/permit \
  node scripts/verify-commerce-lifecycle.mjs
```

The checkout probe verifies real Racket-generated merchant page-pay fields in
Publy, then exercises authenticated scope, exact amount, same-order retry and
the sandbox-only Publy HTTP route. OpenAPI request signatures include
`sign_type`; asynchronous notification signatures exclude it. The reference
is [Alipay's official SDK signing implementation](https://github.com/alipay/alipay-sdk-nodejs-all/blob/master/src/util.ts).
Fixture signatures must not reuse the notification rule for outbound requests.

The shadow probe independently verifies signed Permit snapshots, withdrawal
and revision fencing, scope rejection, and durable conservative quota state.
It is not an end-to-end purchase/entitlement fulfilment demonstration.

The lifecycle probe joins actual Publy signup, checkout, browser return and
operator recovery to actual Commerce payment/Permit paths. The disposable
Racket fixture uses separate temporary merchant, provider and entitlement
keys; it verifies a synthetic callback and independently signed order query,
then journals, projects and issues with the issuer evidence verifier enabled.
An unpaid redirect and invalid callback grant nothing. Duplicate checkout,
payment and refund preserve the order and lineage; wrong-account recovery is
denied. After restarting Publy, verified operator recovery reuses revision 0.
A signed synthetic full-refund query produces withdrawal revision 1 and
blocks recovery and new hosted work. Read-only SQLite counts assert exactly
two journal rows, outbox rows and signed revisions after payment/refund.

All lifecycle controls travel over child-process stdin; only authenticated
Commerce endpoints listen on loopback. Node refuses outgoing fetches outside
those two fixture listeners. The existing running service and its config are
never accessed. Temporary keys, accounts and databases are deleted on exit.
The JSON result labels itself `synthetic-private-lifecycle` and explicitly
reports no real payment or WeChat draft. The fixture's one-day validity is a
test window, not implementation or approval of commercial monthly billing.

All three probes run in the `commerce-shadow` CI job against the pinned packages.
Private fixture success is the first evidence level. An Alipay **official
sandbox** drill with its own credentials/callback reachability is a separate
level; owner-approved real-money testing is a third. Invitation-only or
small-volume real sales must not be relabelled as sandbox testing or used to
bypass provider/hosting requirements. No live admission gate is changed here.

Missing merchant approval, public callback/active-query reconciliation,
refund/recovery, authoritative hosted quota integration and real deployment
evidence remain tracked in Publy #17/#8 and Commerce #23/#4/#5. Never replace
those gates with synthetic probe success. No customer data or private keys
belong in probe output or Git.
