#lang racket/base

;; One-shot admission verifier for the Publy server. It reads JSON on stdin
;; and writes only the verified decision; it never reads payment credentials.
(require json permit/trust "publy-hosted-admission.rkt" "publy-hosted-snapshot.rkt")

(define (main)
  (with-handlers ([exn:fail? (lambda (_) (write-json (hasheq 'status "denied" 'authorizes_use #f)))])
    (unless (= (vector-length (current-command-line-arguments)) 1)
      (error 'publy-hosted-admission-cli "trust store required"))
    (define input (read-json))
    (define trust (read-trust-store (vector-ref (current-command-line-arguments) 0)))
    (define purpose (hash-ref input 'purpose "admission"))
    (write-json
     (cond
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
