#lang racket/base
(require rackunit permit/issuer permit/envelope
         (submod "publy-hosted-admission-cli.rkt" test-support))
(define-values (private public) (generate-ed25519-keypair))
(define trust (jsexpr->trust-store
  (hasheq 'protocol "permit-trust-store" 'version 1 'issuer "issuer_synthetic"
    'keys (hasheq 'test (hasheq 'algorithm "Ed25519" 'public_key (public-key->base64 public)
      'status "active" 'purposes '("entitlement") 'not_before 'null 'not_after 'null)))))
(define extension (hasheq 'version 1 'request_nonce (make-string 64 #\a)
 'service_id "publy" 'provider_product_id "product_synthetic"
 'valid_from "2026-11-01T00:00:00Z" 'valid_until "2026-12-01T00:00:00Z"
 'observed_at "2026-11-23T00:00:00Z" 'fresh_until "2026-11-23T00:00:30Z"))
(define (proof ext)
 (envelope->jsexpr (issue-credential (payload->bytes
  (entitlement-payload #:issuer "issuer_synthetic" #:credential-id "cred_synthetic"
   #:entitlement-id "ent_synthetic" #:revision 1 #:subject (subject #:type "account" #:id "buyer_synthetic")
   #:grants (list (grant #:products '("publy") #:edition "personal"))
   #:constraints (constraints #:use-expires-at "2026-12-01T00:00:00Z")
   #:not-before "2026-11-01T00:00:00Z" #:issued-at "2026-11-23T00:00:00Z"
   #:extensions (hasheq 'jrtx.site/commerce/nowpay-direct ext))) private "test" trust)))
(define input (hasheq 'credential (proof extension) 'account "buyer_synthetic" 'plan "personal"
 'at "2026-11-23T00:00:02Z" 'issuer "issuer_synthetic"
 'request_nonce (make-string 64 #\a) 'service_id "publy" 'provider_product_id "product_synthetic"))
(check-true (hash-ref (inspect-direct input trust) 'authorizes_use))
(for ([field '(request_nonce service_id provider_product_id account issuer)])
 (check-false (hash-ref (inspect-direct (hash-set input field "other_synthetic") trust) 'authorizes_use)))
(check-false (hash-ref (inspect-direct (hash-set input 'at "2026-11-23T00:00:30Z") trust) 'authorizes_use))
(for ([field '(request_nonce service_id provider_product_id valid_from valid_until observed_at fresh_until)])
 (check-false (hash-ref (inspect-direct (hash-set input 'credential (proof (hash-set extension field "2026-11-22T00:00:00Z"))) trust) 'authorizes_use)))
