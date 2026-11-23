#lang racket/base

;; One-shot admission verifier for the Publy server. It reads JSON on stdin
;; and writes only the verified decision; it never reads payment credentials.
(require json permit/trust permit/credential permit/envelope
         "publy-hosted-admission.rkt" "publy-hosted-snapshot.rkt")

;; Protocol verification stays independent of the local socket. These signed
;; extension fields also have to pass the Node admission freshness policy.
(define (inspect-direct input trust)
  (define denied (hasheq 'status "denied" 'authorizes_use #f))
  (define result (inspect-publy-hosted-admission (hash-ref input 'credential) trust
    #:account (hash-ref input 'account) #:plan (hash-ref input 'plan) #:at (hash-ref input 'at)
    #:expected-entitlement-id (hash-ref input 'entitlement_id #f)
    #:minimum-revision (hash-ref input 'minimum_revision #f)))
  (if (not (hash-ref result 'authorizes_use #f)) denied
    (let* ([verified (verify-credential (jsexpr->envelope (hash-ref input 'credential)) trust)]
           [claims (verified-credential-claims verified)]
           [ext (hash-ref (hash-ref claims 'extensions) 'jrtx.site/commerce/nowpay-direct #f)])
      (if (and (hash? ext) (equal? (hash-ref ext 'version #f) 1)
               (equal? (verified-credential-issuer verified) (hash-ref input 'issuer))
               (equal? (hash-ref ext 'request_nonce #f) (hash-ref input 'request_nonce))
               (equal? (hash-ref ext 'service_id #f) (hash-ref input 'service_id))
               (equal? (hash-ref ext 'provider_product_id #f) (hash-ref input 'provider_product_id))
               (equal? (hash-ref ext 'valid_from #f) (hash-ref claims 'not_before))
               (equal? (hash-ref ext 'valid_until #f) (hash-ref result 'use_expires_at))
               (equal? (hash-ref ext 'observed_at #f) (verified-credential-issued-at verified))
               (string? (hash-ref ext 'fresh_until #f))
               (regexp-match? #px"^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$" (hash-ref ext 'fresh_until))
               (string<=? (hash-ref ext 'observed_at) (hash-ref input 'at))
               (string<? (hash-ref input 'at) (hash-ref ext 'fresh_until)))
          (for/fold ([output result]) ([key '(request_nonce service_id provider_product_id valid_from valid_until observed_at fresh_until)])
            (hash-set output key (hash-ref ext key)))
          denied))))

(define (main)
  (with-handlers ([exn:fail? (lambda (_) (write-json (hasheq 'status "denied" 'authorizes_use #f)))])
    (unless (= (vector-length (current-command-line-arguments)) 1)
      (error 'publy-hosted-admission-cli "trust store required"))
    (define input (read-json))
    (define trust (read-trust-store (vector-ref (current-command-line-arguments) 0)))
    (define purpose (hash-ref input 'purpose "admission"))
    (write-json
     (cond
       [(equal? purpose "direct") (inspect-direct input trust)]
       [(equal? purpose "snapshot")
        ;; This mode authenticates a revision watermark only. It cannot
        ;; authorize use, including when the signed snapshot is a withdrawal.
        (inspect-publy-hosted-snapshot (hash-ref input 'credential) trust
         #:account (hash-ref input 'account) #:plan (hash-ref input 'plan)
         #:entitlement-id (hash-ref input 'entitlement_id)
         #:revision (hash-ref input 'revision))]
       [(equal? purpose "admission")
        (inspect-publy-hosted-admission (hash-ref input 'credential) trust
         #:account (hash-ref input 'account) #:plan (hash-ref input 'plan)
         #:at (hash-ref input 'at)
         #:expected-entitlement-id (hash-ref input 'entitlement_id #f)
         #:minimum-revision (hash-ref input 'minimum_revision #f))]
       [else (hasheq 'status "denied" 'authorizes_use #f)]))))

(module+ main (main))

(module+ test-support (provide inspect-direct))
