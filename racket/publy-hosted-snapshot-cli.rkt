#lang racket/base

;; Internal, one-shot verifier. It never authorizes a hosted action.
(require json permit/trust "publy-hosted-snapshot.rkt")

(define (main)
  (with-handlers ([exn:fail? (lambda (_) (write-json (hasheq 'status "denied" 'authorizes_use #f)))])
    (unless (= (vector-length (current-command-line-arguments)) 1)
      (error 'publy-hosted-snapshot-cli "trust store required"))
    (define input (read-json))
    (write-json
     (inspect-publy-hosted-snapshot
      (hash-ref input 'credential) (read-trust-store (vector-ref (current-command-line-arguments) 0))
      #:account (hash-ref input 'account) #:plan (hash-ref input 'plan)
      #:entitlement-id (hash-ref input 'entitlement_id) #:revision (hash-ref input 'revision)))))

(module+ main (main))
