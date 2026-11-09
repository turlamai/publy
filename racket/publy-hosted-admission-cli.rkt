#lang racket/base

;; One-shot admission verifier for the Publy server. It reads JSON on stdin
;; and writes only the verified decision; it never reads payment credentials.
(require json permit/trust "publy-hosted-admission.rkt")

(define (main)
  (with-handlers ([exn:fail? (lambda (_) (write-json (hasheq 'status "denied" 'authorizes_use #f)))])
    (unless (= (vector-length (current-command-line-arguments)) 1)
      (error 'publy-hosted-admission-cli "trust store required"))
    (define input (read-json))
    (write-json
     (inspect-publy-hosted-admission
      (hash-ref input 'credential) (read-trust-store (vector-ref (current-command-line-arguments) 0))
      #:account (hash-ref input 'account) #:plan (hash-ref input 'plan)
      #:at (hash-ref input 'at)
      #:expected-entitlement-id (hash-ref input 'entitlement_id #f)
      #:minimum-revision (hash-ref input 'minimum_revision #f)))))

(module+ main (main))
