# Hosted account identity (development)

Decision `2026-10-auth-1` binds a hosted subscription to an authenticated
account, not a contact address or API key. `HostedIdentityBindings` is an
internal SQLite component for that mapping, exposed only through internal
`Store` methods. It is not connected to an HTTP route, checkout, issuance or
admission and does not grant access.

Enrollment accepts a trusted local user ID only after the future caller has
authenticated the user. It creates a random opaque subject once for an active
user. Retries and concurrent enrollment return the same subject; credential
rotation and contact changes do not change it. A disabled or missing user
cannot enroll or resolve a subject. Re-enabling a user retains the previous
subject. The module has no reassign or delete operation.

The caller must not take the local user ID, subject ID, plan, issuer or offer
from an unauthenticated request. Commerce must independently authorize the
exact service, subject, issuer, offer and product. A subject alone is not
evidence of a purchase, valid Permit credential, current right or quota.
Before enabling hosted work, verify all of those independently, recheck the
account and current entitlement at admission and execution, and reserve quota
atomically under the product's policy. This component does not close the
signer-isolation, revocation-race, payment, restore or merchant gates.

The mapping lives beside local users in the operator-controlled database and
must be included in consistent encrypted backups. Restoring an older database
can lose newer bindings or revocations; keep hosted admission closed until the
operator reconciles restored users, bindings and Commerce lineage against
trusted current records. Never silently create a replacement binding for a
customer whose prior binding may have been lost. No automatic data deletion
or account recovery policy is implied by this development component.
