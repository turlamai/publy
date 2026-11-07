#lang racket/base
(require rackunit permit/issuer permit/envelope "publy-hosted-proof.rkt" "publy-hosted-snapshot.rkt")

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
  (inspect-publy-hosted-proof proof trust #:account account #:plan plan #:at at
                              #:expected-entitlement-id id #:minimum-revision minimum))
(define valid (fixture))
(check-equal? (hash-ref (inspect valid) 'status) "verified-local")
(check-false (hash-ref (inspect valid) 'authorizes_use))
(check-equal? (hash-ref (inspect valid #:id "entitlement-1" #:min 3) 'status) "verified-local")
(for ([result (in-list (list (inspect valid #:account "other")
                             (inspect valid #:plan "studio")
                             (inspect valid #:at "2027-01-01T00:00:00Z")
                             (inspect valid #:id "entitlement-1" #:min 4)
                             (inspect valid #:id "different" #:min 0)
                             (inspect valid #:id "entitlement-1")
                             (inspect (fixture #:product "other"))
                             (inspect (fixture #:expires 'null))
                             (inspect (fixture #:activation #t))
                             (inspect (fixture #:channel "trial"))
                             (inspect (hash-set valid 'payload "dGFtcGVyZWQ="))))])
  (check-equal? (hash-ref result 'status) "denied")
  (check-false (hash-ref result 'authorizes_use)))

;; An expired signed snapshot can advance an anti-rollback fence, but is
;; never admission. The response metadata must match the signed bytes.
(define expired (fixture #:expires "2026-10-02T00:00:00Z"))
(define (inspect-snapshot proof #:account [account "account-a"] #:plan [plan "personal"]
                          #:id [id "entitlement-1"] #:revision [revision 3])
  (inspect-publy-hosted-snapshot proof trust #:account account #:plan plan
                                  #:entitlement-id id #:revision revision))
(define signed-expired (inspect-snapshot expired))
(check-equal? (hash-ref signed-expired 'status) "verified-snapshot")
(check-false (hash-ref signed-expired 'authorizes_use))
(check-true (regexp-match? #px"^[a-f0-9]{64}$" (hash-ref signed-expired 'payload_sha256)))
(for ([result (in-list (list (inspect-snapshot expired #:account "other")
                             (inspect-snapshot expired #:plan "studio")
                             (inspect-snapshot expired #:id "other")
                             (inspect-snapshot expired #:revision 4)
                             (inspect-snapshot (fixture #:product "other"))
                             (inspect-snapshot (fixture #:activation #t))
                             (inspect-snapshot (hash-set expired 'payload "dGFtcGVyZWQ="))))])
  (check-equal? (hash-ref result 'status) "denied")
  (check-false (hash-ref result 'authorizes_use)))
