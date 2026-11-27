#lang racket/base
;; Real native WebView with a synthetic upstream. No live calls.
(require glaze json racket/file racket/runtime-path
         "draft-bridge.rkt" "hosted-transport.rkt")
(define-runtime-path bundle "../workbench/dist-desktop")
(define-runtime-path driver "native-smoke.js")
(define dir (make-temporary-file "publy-native-test~a" 'directory))
(define files (build-path dir "public"))
(define journal (build-path dir "pending.json"))
(define calls '())
(define sent #f)
(define valid-formula #f)
(define done #f)
(define (mock path method key body)
  (unless (equal? key "synthetic-key") (error 'synthetic "Unexpected key"))
  (set! calls (cons (cons method path) calls))
  (cond
    [(equal? path "/v1/accounts")
     (hasheq 'ok #t 'data (hasheq 'accounts (list (hasheq 'name "Test account"))))]
    [(equal? path "/v1/publish")
     (set! sent (read-json (open-input-bytes body)))
     (unless (equal? (hash-ref sent 'title) "Sample") (error 'synthetic "Unexpected title"))
     (set! valid-formula (= (length (hash-ref sent 'images)) 1))
     (error 'synthetic "Reply lost")]
    [else
     (hasheq 'ok #t 'data
             (hasheq 'status "confirmed" 'mediaId "synthetic-draft"
                     'account (hash-ref sent 'account) 'title (hash-ref sent 'title)
                     'requestId (hash-ref sent 'idempotencyKey)))]))
(define-api-routes tools
  [(POST "api/test/done" #:permission 'test:done)
   (testDone [message GString])
   (set! done message)
   (app-quit!)
   (hasheq 'ok #t)]
  [(POST "api/test/denied" #:permission 'test:denied)
   (testDenied)
   (set! done "ungranted handler executed")
   (hasheq 'ok #t)])
(dynamic-wind
  void
  (lambda ()
    (copy-directory/files bundle files)
    (call-with-output-file (build-path files "workbench.js")
      (lambda (out) (newline out) (display (file->string driver) out))
      #:exists 'append)
    (run-app #:public-dir files #:transport 'native #:title "Publy test"
             #:capability (make-capability "test" '(draft:read draft:prepare draft:send test:done))
             #:api (append (make-draft-routes journal (make-hosted-request mock)) tools))
    (unless (equal? done "passed")
      (error 'native-smoke "~a; upstream calls: ~a" done (reverse calls)))
    (unless (equal? (reverse calls)
                    (list '("GET" . "/v1/accounts") '("POST" . "/v1/publish")
                          (cons "GET" (string-append "/v1/publish-result/" (hash-ref sent 'idempotencyKey)))))
      (error 'native-smoke "Unexpected upstream calls: ~a" (reverse calls)))
    (unless valid-formula (error 'native-smoke "Missing formula attachment"))
    (displayln "Native workbench delivery/recovery smoke passed"))
  (lambda () (delete-directory/files dir)))
