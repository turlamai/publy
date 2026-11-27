#lang racket/base
;; Restricted upstream transport. No caller-controlled origin, headers or redirects.
(require net/http-client openssl json racket/port racket/string)
(provide hosted-request make-hosted-request valid-key?)
(define host "publy-api.jrtx.site")
(define limit (* 30 1024 1024))
(define (valid-key? key)
  (and (string? key) (<= 1 (string-length key) 512)
       (regexp-match? #px"^[!-~]+$" key)))
(define (request-path operation id)
  (cond [(eq? operation 'accounts) "/v1/accounts"]
        [(eq? operation 'publish) "/v1/publish"]
        [(and (eq? operation 'result) (string? id)
              (regexp-match? #px"^[a-f0-9]{32}$" id))
         (string-append "/v1/publish-result/" id)]
        [else (error 'hosted-request "Invalid operation or request ID")]))
(define (upstream path method key body)
  (define-values (status _headers input)
    (http-sendrecv host path #:ssl? (ssl-secure-client-context)
                   #:port 443 #:method method
                   #:headers (append (list (string-append "X-API-Key: " key)
                                           "Accept: application/json")
                                     (if body (list "Content-Type: application/json") '()))
                   #:data body))
  (dynamic-wind
    void
    (lambda ()
      (define raw (read-bytes (add1 limit) input))
      (unless (and (bytes? raw) (<= (bytes-length raw) limit))
        (error 'hosted-request "Invalid upstream response size"))
      (define match (regexp-match #px#"^HTTP/[0-9.]+ ([0-9]{3})" status))
      (unless match (error 'hosted-request "Invalid upstream status"))
      (define status-code (string->number (bytes->string/utf-8 (cadr match))))
      (hasheq 'status status-code
              'ok (<= 200 status-code 299)
              'data (with-handlers ([exn:fail? (lambda (_) 'null)])
                      (read-json (open-input-bytes raw)))))
    (lambda () (close-input-port input))))
(define (make-hosted-request send)
  (lambda (operation key #:id [id #f] #:body [body #f])
    (unless (valid-key? key) (error 'hosted-request "Invalid API key"))
    (define path (request-path operation id))
    (define publish? (eq? operation 'publish))
    (unless (if publish?
                (and (string? body) (<= (bytes-length (string->bytes/utf-8 body)) limit))
                (not body))
      (error 'hosted-request "Invalid request body"))
    (send path (if publish? "POST" "GET") key
          (and body (string->bytes/utf-8 body)))))
(define (bounded-upstream path method key body)
  (define scope (make-custodian))
  (dynamic-wind
    void
    (lambda ()
      (define result (make-channel))
      (parameterize ([current-custodian scope])
        (thread (lambda ()
                  (channel-put result
                               (with-handlers ([exn:fail? values])
                                 (upstream path method key body))))))
      (define value (sync/timeout 45 result))
      (cond [(exn:fail? value) (raise value)]
            [value value]
            [else (error 'hosted-request "Upstream timeout")]))
    (lambda () (custodian-shutdown-all scope))))
(define hosted-request (make-hosted-request bounded-upstream))

(module+ test
  (require rackunit)
  (define calls '())
  (define mock (make-hosted-request
                (lambda args (set! calls (cons args calls))
                  (hasheq 'status 200 'ok #t 'data 'null))))
  (check-true (hash-ref (mock 'accounts "fake-key") 'ok))
  (check-equal? (car calls) (list "/v1/accounts" "GET" "fake-key" #f))
  (mock 'publish "fake-key" #:body "{}")
  (check-equal? (car calls) (list "/v1/publish" "POST" "fake-key" #"{}"))
  (mock 'result "fake-key" #:id (make-string 32 #\a))
  (check-equal? (caar calls) (string-append "/v1/publish-result/" (make-string 32 #\a)))
  (check-exn exn:fail? (lambda () (mock 'result "fake-key" #:id "../admin")))
  (check-exn exn:fail? (lambda () (mock 'accounts "bad\r\nheader")))
  (check-exn exn:fail? (lambda () (mock 'accounts "fake-key" #:body "{}")))
  (check-exn exn:fail? (lambda () (mock 'other "fake-key")))
  (check-equal? (length calls) 3))
