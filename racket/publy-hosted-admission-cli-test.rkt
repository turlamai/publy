#lang racket/base
;; The same internal CLI can authenticate a watermark without granting use.
(require rackunit json racket/file racket/port racket/system racket/runtime-path
         permit/issuer permit/envelope)
(define-runtime-path cli "publy-hosted-admission-cli.rkt")
(define-values (private public) (generate-ed25519-keypair))
(define trust-json (hasheq 'protocol "permit-trust-store" 'version 1 'issuer "test"
 'keys (hasheq 'key (hasheq 'algorithm "Ed25519" 'public_key (public-key->base64 public)
 'status "active" 'purposes '("entitlement") 'not_before 'null 'not_after 'null))))
(define trust (jsexpr->trust-store trust-json))
(define credential (envelope->jsexpr (issue-credential
 (payload->bytes (entitlement-payload #:issuer "test" #:credential-id "test-credential"
  #:entitlement-id "test-entitlement" #:revision 4 #:subject (subject #:type "account" #:id "account-a")
  #:grants (list (grant #:products '("publy") #:edition "personal"))
  #:constraints (constraints #:use-expires-at "2026-12-01T00:00:00Z")
  #:issued-at "2026-10-01T00:00:00Z")) private "key" trust)))
(define dir (make-temporary-file "publy-cli-snapshot-~a" 'directory))
(dynamic-wind void
 (lambda ()
  (define trust-path (build-path dir "trust.json"))
  (call-with-output-file trust-path (lambda (out) (write-json trust-json out)))
  (define input (hasheq 'purpose "snapshot" 'credential credential 'account "account-a"
                       'plan "personal" 'entitlement_id "test-entitlement" 'revision 4))
  (define (run data)
   (define-values (child stdout stdin stderr)
    (subprocess #f #f #f (find-executable-path "racket") cli trust-path))
   (write-json data stdin) (close-output-port stdin)
   (define result (read-json stdout))
   (close-input-port stdout) (close-input-port stderr) (subprocess-wait child)
   (check-equal? (subprocess-status child) 0) result)
  (define result (run input))
  (check-equal? (hash-ref result 'status) "verified-snapshot")
  (check-false (hash-ref result 'authorizes_use))
  (check-equal? (hash-ref result 'revision) 4)
  (check-true (regexp-match? #px"^[a-f0-9]{64}$" (hash-ref result 'payload_sha256)))
  (for ([bad (in-list (list (hash-set input 'account "other")
                           (hash-set input 'plan "studio")
                           (hash-set input 'revision 99)
                           (hash-set input 'purpose "unknown")
                           (hash-set input 'credential (hasheq 'forged #t))))])
   (define refused (run bad))
   (check-equal? (hash-ref refused 'status) "denied")
   (check-false (hash-ref refused 'authorizes_use))))
 (lambda () (delete-directory/files dir)))
