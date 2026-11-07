#lang racket/base

;; Development-only independent Permit verification. A valid signature is
;; not current Commerce state or permission to admit a hosted request.
(require permit/credential
         permit/envelope
         permit/policy)

(provide inspect-publy-hosted-proof)

(define (inspect-publy-hosted-proof envelope-json trust-store
                                   #:account account #:plan plan #:at at
                                   #:expected-entitlement-id [expected-id #f]
                                   #:minimum-revision [minimum #f])
  (define (denied) (hasheq 'status "denied" 'authorizes_use #f))
  (with-handlers ([exn:fail? (lambda (_) (denied))])
    (unless (and (string? account) (positive? (string-length account))
                 (member plan '("personal" "studio"))
                 (string? at)
                 (or (and (not expected-id) (not minimum))
                     (and (string? expected-id) (positive? (string-length expected-id))
                          (exact-nonnegative-integer? minimum))))
      (error 'inspect-publy-hosted-proof "invalid trusted inputs"))
    (define credential (verify-credential (jsexpr->envelope envelope-json) trust-store))
    (define claims (verified-credential-claims credential))
    (define constraints (hash-ref claims 'constraints))
    (define entitlement-id (verified-credential-entitlement-id credential))
    (define revision (verified-credential-revision credential))
    (if (and (equal? (verified-credential-type credential) "entitlement")
             (equal? (verified-credential-channel credential) "commercial")
             (equal? (verified-credential-subject-type credential) "account")
             (equal? (verified-credential-subject-id credential) account)
             (or (not expected-id) (equal? entitlement-id expected-id))
             (or (not minimum) (>= revision minimum))
             ;; Hosted subscriptions are time-bounded and do not use desktop leases.
             (string? (verified-credential-use-expires-at credential))
             (eq? (hash-ref constraints 'updates_through) 'null)
             (eq? (hash-ref constraints 'features_through) 'null)
             (eq? (hash-ref constraints 'installation_id) 'null)
             (not (hash-ref constraints 'activation_required))
             (for/or ([g (in-list (hash-ref claims 'grants))])
               (and (member "publy" (hash-ref (hash-ref g 'scope) 'products))
                    (equal? (hash-ref g 'edition) plan)
                    (equal? (hash-ref g 'feature_policy) "explicit")))
             (edition-entitled? credential "publy" plan #:at at))
        (hasheq 'status "verified-local" 'authorizes_use #f
                'entitlement_id entitlement-id 'revision revision
                'use_expires_at (verified-credential-use-expires-at credential))
        (denied))))
