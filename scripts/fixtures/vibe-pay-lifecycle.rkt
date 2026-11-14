#lang racket/base

;; Disposable synthetic provider and issuer. This fixture is never deployed as
;; a payment service: controls arrive on stdin, and listeners bind loopback.
(require base64 json racket/date racket/file racket/list racket/string
         crypto crypto/libcrypto
         commerce commerce/admission commerce/alipay commerce/alipay/server
         commerce/alipay/refund commerce/alipay/checkout-http
         commerce/alipay/checkout-idempotency commerce/evidence commerce/issuer
         commerce/permit commerce/storage commerce/storage/sqlite
         commerce/hosted-http commerce/hosted-replay/sqlite
         permit/issuer)

(define args (current-command-line-arguments))
(define dir (string->path (vector-ref args 0)))
(define (file name) (build-path dir name))
(define offer-id "publy-personal-monthly")
(define issuer "fixture-issuer")
(define now (current-seconds))
(define (timestamp seconds [offset 0] [utc? #f])
  (define d (seconds->date (+ seconds offset) #f))
  (define (pad n width)
    (define s (number->string n))
    (string-append (make-string (max 0 (- width (string-length s))) #\0) s))
  (string-append (pad (date-year d) 4) "-" (pad (date-month d) 2) "-"
                 (pad (date-day d) 2) (if utc? "T" " ")
                 (pad (date-hour d) 2) ":" (pad (date-minute d) 2) ":"
                 (pad (date-second d) 2) (if utc? "Z" "")))
(define (save name value)
  (call-with-output-file (file name) #:exists 'error
    (lambda (out) (write-json value out))))
(define (rsa-key)
  (parameterize ([crypto-factories (list libcrypto-factory)])
    (generate-private-key (get-pk 'rsa) '((nbits 2048)))))
(define merchant (rsa-key))
(define provider (rsa-key))
(define (pem key)
  (string-append "-----BEGIN PUBLIC KEY-----\n"
    (bytes->string/utf-8 (base64-encode
      (pk-key->datum (pk-key->public-only-key key) 'SubjectPublicKeyInfo) #:line #f))
    "\n-----END PUBLIC KEY-----\n"))
(define (sign text)
  (bytes->string/utf-8 (base64-encode
    (parameterize ([crypto-factories (list libcrypto-factory)])
      (digest/sign provider 'sha256 (string->bytes/utf-8 text) #:pad 'pkcs1-v1.5)) #:line #f)))
(define (signed-response node data)
  (define raw (jsexpr->string data))
  (string->bytes/utf-8
    (string-append "{\"" node "\":" raw ",\"sign\":\"" (sign raw) "\"}")))
(save "merchant-public.json" (pem merchant))
(define-values (private public) (generate-ed25519-keypair))
(define trust-json (hasheq 'protocol "permit-trust-store" 'version 1 'issuer issuer
  'keys (hasheq 'test (hasheq 'algorithm "Ed25519" 'public_key (public-key->base64 public)
    'status "active" 'purposes '("entitlement") 'not_before 'null 'not_after 'null))))
(save "trust.json" trust-json)
(define trust (jsexpr->trust-store trust-json))
(define selected (offer offer-id "publy" 'one-time (money "CNY" 2900) "fixture-policy"))
;; One synthetic day, deliberately not a claim about the commercial month policy.
(define catalog (make-permit-policy-catalog (list selected)
  (list (make-permit-entitlement-policy "fixture-policy" 1 #:subject-type 'account
    #:grants (list (make-permit-grant-policy #:products '("publy") #:edition "personal"))
    #:constraints (make-permit-constraints-policy
      #:use-expires-at (timestamp (+ now 86400) 0 #t))))))
(save "admission.json" (hasheq 'version 1 'provider "alipay" 'environment "sandbox"
  'merchant_app_id "fixture-app" 'seller_id "fixture-seller" 'product_category "fixture"
  'admission_reference "synthetic-only" 'cost_reference "synthetic-only"
  'checkout_api "alipay.trade.page.pay" 'read_api "alipay.trade.query"
  'approved_at 1 'expires_at 4102444800
  'capabilities (list (hasheq 'offer_id offer-id 'product_id "publy" 'method "alipay"
    'transaction_type "one-time" 'currency "CNY" 'amount_minor 2900 'min_minor 1 'max_minor 100000))))
(define storage (open-sqlite-commerce-storage (file "commerce.sqlite")))
(define (scope service i type subject o product)
  (and (equal? service "fixture-service") (equal? i issuer) (equal? type "account")
       (equal? o offer-id) (equal? product "publy")
       (file-exists? (file "subject"))
       (equal? subject (string-trim (file->string (file "subject"))))))
(define (resolve-key id) (and (equal? id "fixture-service") (make-bytes 32 107)))
(initialize-sqlite-hosted-replay-store! (file "nonces.sqlite"))
(initialize-sqlite-alipay-checkout-claims! (file "claims.sqlite"))
(define replay! (make-sqlite-hosted-replay-claimer (file "nonces.sqlite")))
(define checkout (make-alipay-checkout-http-endpoint #:storage storage
  #:resolve-key resolve-key #:allow-scope scope #:claim-once! replay!
  #:checkout-claim! (make-sqlite-alipay-checkout-claimer (file "claims.sqlite"))
  #:resolve-offer (lambda (p o) (and (equal? p "publy") (equal? o offer-id) selected))
  #:title "Synthetic Publy test" #:admission (read-provider-admission (file "admission.json"))
  #:environment "sandbox" #:app-id "fixture-app" #:seller-id "fixture-seller"
  #:private-key merchant #:notify-url "https://example.test/notify" #:return-url "https://example.test/return"))
(define proof (make-hosted-proof-http-endpoint #:storage storage #:trust-store trust
  #:resolve-key resolve-key #:allow-scope scope #:claim-once! replay!))
(define worker (make-issuance-worker #:catalog catalog #:issuer issuer #:private-key private
  #:key-id "test" #:trust-store trust
  #:evidence-verifier (make-issuance-evidence-verifier #:catalog catalog
    #:alipay-public-key-pem (pem provider)
    #:binding-lookup (lambda (order) (storage-checkout-binding-ref storage order)))))
(define webhook (make-alipay-webhook-endpoint #:app-id "fixture-app" #:seller-id "fixture-seller"
  #:alipay-public-key (pem provider) #:storage storage
  #:query-order (lambda (binding)
    (signed-response "alipay_trade_query_response"
      (hasheq 'code "10000" 'app_id "fixture-app" 'seller_id "fixture-seller"
        'out_trade_no (alipay-binding-order-id binding) 'trade_no "fixture-trade"
        'trade_status "TRADE_SUCCESS" 'total_amount "29.00")))))
(define (binding order)
  (define stored (storage-checkout-binding-ref storage order))
  (unless stored (error 'fixture "checkout binding required"))
  (alipay-binding "fixture-app" "fixture-seller" order
    (checkout-binding-offer-id stored) (checkout-binding-subject-id stored) (money "CNY" 2900)))
(define (encode value)
  (for/fold ([v value]) ([p (in-list '(("%" . "%25") ("+" . "%2B") ("/" . "%2F") ("=" . "%3D") (" " . "+")))])
    (string-replace v (car p) (cdr p))))
(define (payment order)
  (define fields (list (cons "app_id" "fixture-app") (cons "seller_id" "fixture-seller")
    (cons "out_trade_no" order) (cons "trade_no" "fixture-trade")
    (cons "notify_id" "fixture-notify") (cons "gmt_payment" (timestamp (- now 60) 28800))
    (cons "trade_status" "TRADE_SUCCESS") (cons "total_amount" "29.00") (cons "sign_type" "RSA2")))
  (string->bytes/utf-8 (string-join
    (for/list ([p (in-list (cons (cons "sign" (sign (alipay-signing-content fields))) fields))])
      (string-append (car p) "=" (encode (cdr p)))) "&")))
(define (project-and-issue)
  (define projected (storage-project-next! storage #:processed-at (current-seconds)))
  (define result (process-issuance-work! worker storage))
  (when (and result (not (eq? (issuance-result-disposition result) 'completed)))
    (error 'fixture "issuer refused authenticated evidence"))
  (hasheq 'projected (and projected #t) 'issued (and result #t)
    'entitlement_id (if result (issuance-result-entitlement-id result) 'null)
    'revision (if result (issuance-result-revision result) 'null)))
(define (dispatch command)
  (define order (hash-ref command 'order))
  (define raw (payment order))
  (case (string->symbol (hash-ref command 'action))
    [(pay tamper)
     (define-values (status body) (handle-alipay-webhook-post webhook
       (if (equal? (hash-ref command 'action) "tamper") (bytes-append raw #"&app_id=forged") raw)))
     (unless (= status (if (equal? (hash-ref command 'action) "tamper") 401 200))
       (error 'fixture "unexpected webhook disposition"))
     (hash-set (project-and-issue) 'http_status status)]
    [(refund)
     (define response (signed-response "alipay_trade_fastpay_refund_query_response"
       (hasheq 'code "10000" 'out_trade_no order 'trade_no "fixture-trade"
         'out_request_no "fixture-refund" 'refund_amount "29.00" 'refund_status "REFUND_SUCCESS"
         'gmt_refund_pay (timestamp now 28800))))
     (journal-alipay-full-refund! storage response (pem provider) (binding order)
       "fixture-refund" #:received-at (current-seconds))
     (project-and-issue)]
    [else (error 'fixture "unsupported synthetic action")]))
(thread (lambda () (serve-alipay-checkout-http-endpoint checkout #:port (string->number (vector-ref args 1)))))
(thread (lambda () (serve-hosted-proof-http-endpoint proof #:port (string->number (vector-ref args 2)))))
(let loop ()
  (define command (read-json))
  (unless (eof-object? command)
    (define result (dispatch command))
    (display "FIXTURE ") (write-json result) (newline) (flush-output)
    (loop)))
(storage-close storage)
