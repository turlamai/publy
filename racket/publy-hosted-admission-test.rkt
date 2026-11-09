#lang racket/base
(require rackunit permit/issuer permit/envelope "publy-hosted-admission.rkt")

(define-values (private public) (generate-ed25519-keypair))
(define trust (jsexpr->trust-store
  (hasheq 'protocol "permit-trust-store" 'version 1 'issuer "issuer"
          'keys (hasheq 'test (hasheq 'algorithm "Ed25519" 'public_key (public-key->base64 public)
                                      'status "active" 'purposes '("entitlement")
                                      'not_before 'null 'not_after 'null)))))
(define (fixture #:subject [account "account-a"] #:product [product "publy"]
                 #:plan [plan "personal"] #:expires [expires "2026-12-01T00:00:00Z"]
                 #:activation [activation #f] #:channel [channel "commercial"])
  (define payload
    (entitlement-payload #:issuer "issuer" #:credential-id "credential-1"
      #:entitlement-id "entitlement-1" #:revision 3
      #:subject (subject #:type "account" #:id account) #:channel channel
      #:grants (list (grant #:products (list product) #:edition plan))
      #:constraints (constraints #:use-expires-at expires #:activation-required? activation)
      #:issued-at "2026-10-01T00:00:00Z"))
  (envelope->jsexpr (issue-credential (payload->bytes payload) private "test" trust)))
(define (inspect proof #:account [account "account-a"] #:plan [plan "personal"]
                 #:at [at "2026-11-01T00:00:00Z"] #:id [id #f] #:min [minimum #f])
  (inspect-publy-hosted-admission proof trust #:account account #:plan plan #:at at
                                    #:expected-entitlement-id id #:minimum-revision minimum))
(define valid (fixture))
(check-equal? (hash-ref (inspect valid) 'status) "admitted")
(check-true (hash-ref (inspect valid) 'authorizes_use))
(check-equal? (hash-ref (inspect valid) 'entitlement_id) "entitlement-1")
(check-equal? (hash-ref (inspect valid) 'revision) 3)
(check-true (regexp-match? #px"^[a-f0-9]{64}$" (hash-ref (inspect valid) 'payload_sha256)))
(check-equal? (hash-ref (inspect valid #:id "entitlement-1" #:min 3) 'status) "admitted")
(for ([result (in-list (list (inspect valid #:account "other")
                             (inspect valid #:plan "studio")
                             (inspect valid #:at "2027-01-01T00:00:00Z")
                             (inspect valid #:id "entitlement-1" #:min 4)
                             (inspect valid #:id "different" #:min 0)
                             (inspect (fixture #:product "other"))
                             (inspect (fixture #:expires 'null))
                             (inspect (fixture #:activation #t))
                             (inspect (fixture #:channel "trial"))
                             (inspect (hash-set valid 'payload "dGFtcGVyZWQ="))))])
  (check-equal? (hash-ref result 'status) "denied")
  (check-false (hash-ref result 'authorizes_use)))
