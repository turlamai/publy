#lang racket/base

;; Admission check for a hosted paid request. It verifies a signed Permit
;; entitlement locally, applies the Permit edition policy at a trusted UTC
;; instant, and returns authorizes_use=true only for a live, matching grant.
;; Commerce's current-state proof (refund/withdrawal/freshness) must still be
;; checked before this function is called; this is not a payment fact.

(require permit/credential
         permit/envelope
         permit/policy
         file/sha1)

(provide inspect-publy-hosted-admission)

(define (denied)
  (hasheq 'status "denied" 'authorizes_use #f))

(define (inspect-publy-hosted-admission envelope-json trust-store
                                        #:account account #:plan plan #:at at
                                        #:expected-entitlement-id [expected-id #f]
                                        #:minimum-revision [minimum #f])
  (with-handlers ([exn:fail? (lambda (_) (denied))])
    (unless (and (string? account) (<= 1 (string-length account) 256)
                 (member plan '("personal" "studio"))
                 (string? at)
                 (or (and (not expected-id) (not minimum))
                     (and (string? expected-id) (positive? (string-length expected-id))
                          (exact-nonnegative-integer? minimum))))
      (error 'inspect-publy-hosted-admission "invalid trusted inputs"))
    (define credential (verify-credential (jsexpr->envelope envelope-json) trust-store))
    (define claims (verified-credential-claims credential))
    (define constraints (hash-ref claims 'constraints))
    (define entitlement-id (verified-credential-entitlement-id credential))
    (define revision (verified-credential-revision credential))
    (define use-expires-at (verified-credential-use-expires-at credential))
    (if (and (equal? (verified-credential-type credential) "entitlement")
             (equal? (verified-credential-channel credential) "commercial")
             (equal? (verified-credential-subject-type credential) "account")
             (equal? (verified-credential-subject-id credential) account)
             (or (not expected-id) (equal? entitlement-id expected-id))
             (or (not minimum) (>= revision minimum))
             (string? use-expires-at)
             (eq? (hash-ref constraints 'updates_through) 'null)
             (eq? (hash-ref constraints 'features_through) 'null)
             (eq? (hash-ref constraints 'installation_id) 'null)
             (not (hash-ref constraints 'activation_required))
             (for/or ([g (in-list (hash-ref claims 'grants))])
               (and (member "publy" (hash-ref (hash-ref g 'scope) 'products))
                    (equal? (hash-ref g 'edition) plan)
                    (equal? (hash-ref g 'feature_policy) "explicit")))
             ;; The hosted plan must still be within its paid window at the
             ;; server's trusted instant; an expired snapshot is never admission.
             (edition-entitled? credential "publy" plan #:at at))
        (hasheq 'status "admitted" 'authorizes_use #t
                'entitlement_id entitlement-id 'revision revision
                'use_expires_at use-expires-at
                'payload_sha256 (bytes->hex-string (sha256-bytes (verified-credential-payload credential))))
        (denied))))
