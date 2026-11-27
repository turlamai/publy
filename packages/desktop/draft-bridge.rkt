#lang racket/base
(require file/sha1 glaze json racket/list racket/string
         "hosted-transport.rkt" "recovery-journal.rkt")
(provide draft-permissions make-draft-routes)

(define draft-permissions '(draft:read draft:prepare draft:send))
(define (state status) (hasheq 'status status))
(define busy (state "busy"))
(define unavailable (state "storage-error"))
(define unknown (state "unknown"))
(define invalid (state "invalid"))
(define max-body (* 29 1024 1024))

(define (exact-fields? value fields)
  (and (hash? value) (= (hash-count value) (length fields))
       (andmap (lambda (field) (hash-has-key? value field)) fields)))

(define (read-draft body)
  (unless (<= (bytes-length (string->bytes/utf-8 body)) max-body)
    (error 'draft "Invalid article size"))
  (define in (open-input-string body))
  (define article (read-json in))
  (define cards? (and (hash? article) (equal? (hash-ref article 'type #f) "image_post")))
  (unless (and (eof-object? (read-json in))
               (if cards?
                   (exact-fields? article '(account type title html images cover))
                   (and (exact-fields? article '(account type title html images))
                        (equal? (hash-ref article 'type) "article")))
               (for/and ([field '(account title)])
                 (define text (hash-ref article field))
                 (and (string? text) (<= 1 (string-length text) 64)
                      (equal? text (string-trim text))))
               (string? (hash-ref article 'html))
               (list? (hash-ref article 'images))
               (if cards?
                   (<= 3 (length (hash-ref article 'images)) 9)
                   (<= (length (hash-ref article 'images)) 100))
               (for/and ([image (in-list (hash-ref article 'images))])
                 (and (exact-fields? image '(name contentType data))
                      (string? (hash-ref image 'name))
                      (member (hash-ref image 'contentType)
                              '("image/png" "image/jpeg" "image/gif" "image/webp"))
                      (or (not cards?) (equal? (hash-ref image 'contentType) "image/png"))
                      (string? (hash-ref image 'data))))
               (or (not cards?) (equal? (hash-ref article 'cover)
                                        (hash-ref (car (hash-ref article 'images)) 'name))))
    (error 'draft "Invalid article fields"))
  article)

;; The immediate article and image-post subset of core/src/draft-identity-fields.ts.
(define (draft-id article)
  (define images (hash-ref article 'images))
  (define out (open-output-bytes))
  (define (write-field text)
    (define bytes (string->bytes/utf-8 text))
    (fprintf out "~a:" (bytes-length bytes))
    (write-bytes bytes out))
  (for-each write-field
            (list "publy-wechat-draft-v2" (hash-ref article 'account) (hash-ref article 'type)
                  (hash-ref article 'title) (hash-ref article 'html)
                  (hash-ref article 'cover "") "" "" "" "" "unset" "unset" "" (number->string (length images))))
  (for* ([image (in-list images)] [field '(name contentType data)])
    (write-field (hash-ref image field)))
  (substring (bytes->hex-string (sha256-bytes (get-output-bytes out))) 0 32))

(define (make-draft-routes path [request hosted-request])
  (define (with-journal action)
    (with-handlers ([exn:fail? (lambda (_) unavailable)])
      (call-with-recovery path action (lambda () busy))))
  (define (lookup request-proc db saved [readback? #f])
    ;; Authentication failures, missing records and mismatched replies are
    ;; ambiguous. Never expose upstream error bodies or clear the claim here.
    (define result (with-handlers ([exn:fail? (lambda (_) #f)]) (request-proc)))
    (define data (and (hash? result) (hash-ref result 'ok #f) (hash-ref result 'data #f)))
    (define id (hash-ref saved 'id))
    (define media (and (hash? data) (hash-ref data 'mediaId #f)))
    (if (and (string? media) (not (string=? "" (string-trim media)))
             (or (not readback?) (equal? (hash-ref data 'status #f) "confirmed"))
             (equal? (hash-ref data 'requestId #f) id)
             (equal? (hash-ref data 'account #f) (hash-ref saved 'account))
             (equal? (hash-ref data 'title #f) (hash-ref saved 'title)))
        (begin (clear-pending! db id)
               (hasheq 'status "confirmed" 'mediaId media))
        (hash-set unknown 'pending saved)))
  (define-api-routes routes
    [(POST "api/draft/pending" #:permission 'draft:read)
     (draftPending)
     (with-journal (lambda (db) (hasheq 'pending (or (read-pending db) 'null))))]
    [(POST "api/draft/accounts" #:permission 'draft:read)
     (draftAccounts [key GString])
     (with-handlers ([exn:fail? (lambda (_) invalid)])
       (define result (request 'accounts key))
       (define data (hash-ref result 'data #f))
       (define accounts (and (hash-ref result 'ok #f) (hash? data) (hash-ref data 'accounts #f)))
       (if (and (list? accounts)
                (andmap (lambda (item)
                          (and (hash? item) (string? (hash-ref item 'name #f))
                               (not (string=? "" (string-trim (hash-ref item 'name))))))
                        accounts))
           (hasheq 'accounts (remove-duplicates (map (lambda (item) (hash-ref item 'name)) accounts)))
           invalid))]
    [(POST "api/draft/identity" #:permission 'draft:prepare)
     (draftIdentity [body GString])
     (with-handlers ([exn:fail? (lambda (_) invalid)])
       (hasheq 'id (draft-id (read-draft body))))]
    [(POST "api/draft/send" #:permission 'draft:send)
     (draftSend [key GString] [approved GString] [body GString])
     (define article (with-handlers ([exn:fail? (lambda (_) #f)]) (read-draft body)))
     (cond
       [(not (and (valid-key? key) article (equal? approved (draft-id article)))) invalid]
       [else
        (with-journal
         (lambda (db)
           (define saved (read-pending db))
           (cond
             [saved (hasheq 'status "pending" 'pending saved)]
             [else
              (define payload (jsexpr->string (hash-set article 'idempotencyKey approved)))
              (define pending
                (claim-pending! db (hasheq 'id approved 'account (hash-ref article 'account)
                                          'title (hash-ref article 'title))))
              (lookup (lambda () (request 'publish key #:body payload)) db pending)])))])]
    [(POST "api/draft/result" #:permission 'draft:read)
     (draftResult [key GString] [id GString])
     (with-journal
      (lambda (db)
        (define saved (read-pending db))
        (if (and saved (equal? id (hash-ref saved 'id)))
            (lookup (lambda () (request 'result key #:id id)) db saved #t)
            (hasheq 'status "changed" 'pending (or saved 'null)))))])
  routes)
