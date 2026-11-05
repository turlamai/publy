#lang racket/base

;; Authenticates a signed snapshot for an anti-rollback fence only. It does
;; not establish that Commerce's current state permits use or grant admission.
(require permit/credential permit/envelope file/sha1)
(provide inspect-publy-hosted-snapshot)

(define (inspect-publy-hosted-snapshot envelope-json trust-store
                                       #:account account #:plan plan
                                       #:entitlement-id expected-id
                                       #:revision expected-revision)
  (define (denied) (hasheq 'status "denied" 'authorizes_use #f))
  (with-handlers ([exn:fail? (lambda (_) (denied))])
    (unless (and (string? account) (<= 1 (string-length account) 256)
                 (member plan '("personal" "studio"))
                 (string? expected-id) (<= 1 (string-length expected-id) 256)
                 (exact-nonnegative-integer? expected-revision))
      (error 'inspect-publy-hosted-snapshot "invalid trusted inputs"))
    (define credential (verify-credential (jsexpr->envelope envelope-json) trust-store))
    (define claims (verified-credential-claims credential))
    (define constraints (hash-ref claims 'constraints))
    (if (and (equal? (verified-credential-type credential) "entitlement")
             (equal? (verified-credential-channel credential) "commercial")
             (equal? (verified-credential-subject-type credential) "account")
             (equal? (verified-credential-subject-id credential) account)
             (equal? (verified-credential-entitlement-id credential) expected-id)
             (= (verified-credential-revision credential) expected-revision)
             (string? (verified-credential-use-expires-at credential))
             (eq? (hash-ref constraints 'updates_through) 'null)
             (eq? (hash-ref constraints 'features_through) 'null)
             (eq? (hash-ref constraints 'installation_id) 'null)
             (not (hash-ref constraints 'activation_required))
             (for/or ([g (in-list (hash-ref claims 'grants))])
               (and (member "publy" (hash-ref (hash-ref g 'scope) 'products))
                    (equal? (hash-ref g 'edition) plan)
                    (equal? (hash-ref g 'feature_policy) "explicit"))))
        (hasheq 'status "verified-snapshot" 'authorizes_use #f
                'entitlement_id expected-id 'revision expected-revision
                'payload_sha256 (bytes->hex-string (sha256-bytes (verified-credential-payload credential))))
        (denied))))
