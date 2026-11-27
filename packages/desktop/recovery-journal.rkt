#lang racket/base
;; Stable recovery journal. Exclusive creation prevents replacing an unresolved
;; request, including between independent desktop processes. Corruption blocks
;; delivery rather than silently forgetting an uncertain request.
(require racket/file racket/path racket/string json)
(provide default-recovery-path read-pending claim-pending! clear-pending!)
(define (default-recovery-path)
  (build-path (find-system-path 'pref-dir) "site.jrtx.publy" "pending-draft-v1.json"))
(define (validate value)
  (unless (and (hash? value)
               (string? (hash-ref value 'id #f))
               (regexp-match? #px"^[a-f0-9]{32}$" (hash-ref value 'id))
               (for/and ([field '(account title)])
                 (define v (hash-ref value field #f))
                 (and (string? v) (<= 1 (string-length v) 4096)
                      (not (string=? (string-trim v) "")))))
    (error 'recovery "Invalid pending draft metadata"))
  (for/hasheq ([field '(id account title)])
    (values field (hash-ref value field))))
(define (read-pending path)
  (if (file-exists? path)
      (begin
        (when (> (file-size path) 65536)
          (error 'recovery "Invalid recovery journal size"))
        (call-with-input-file path
          (lambda (in)
            (define value (validate (read-json in)))
            (unless (eof-object? (read-json in))
              (error 'recovery "Unexpected trailing journal data"))
            value)))
      #f))
(define (claim-pending! path metadata)
  (define value (validate metadata))
  (make-directory* (or (path-only path) (current-directory)))
  ;; 'error maps to exclusive creation, not a check followed by overwrite.
  ;; If interrupted during the write, a malformed journal fails closed.
  ;; No upstream operation is authorized until this call returns.
  (call-with-output-file path
    (lambda (out) (write-json value out) (flush-output out))
    #:exists 'error
    #:permissions #o600)
  value)
;; The caller must serialize confirmation and deletion with claims across
;; processes. This primitive is not itself a complete delivery coordinator.
(define (clear-pending! path confirmed-id)
  (define pending (read-pending path))
  (unless (and pending (equal? confirmed-id (hash-ref pending 'id)))
    (error 'recovery "Pending draft changed or is missing"))
  (delete-file path))

(module+ test
  (require rackunit)
  (define dir (make-temporary-file "publy-recovery~a" 'directory))
  (define path (build-path dir "pending.json"))
  (define id (make-string 32 #\a))
  (define metadata (hasheq 'id id 'account "测试公众号" 'title "Draft"
                           'key "must-not-persist" 'body "private article"))
  (dynamic-wind
    void
    (lambda ()
      (check-false (read-pending path))
      (check-equal? (claim-pending! path metadata)
                    (hasheq 'id id 'account "测试公众号" 'title "Draft"))
      (check-equal? (read-pending path)
                    (hasheq 'id id 'account "测试公众号" 'title "Draft"))
      (check-false (regexp-match? #rx"must-not-persist|private article" (file->string path)))
      (check-exn exn:fail? (lambda () (claim-pending! path metadata)))
      (check-exn exn:fail? (lambda () (clear-pending! path (make-string 32 #\b))))
      (check-equal? (hash-ref (read-pending path) 'id) id)
      (clear-pending! path id)
      (check-false (read-pending path))
      (define results (make-channel))
      (define workers
        (for/list ([i (in-range 8)])
          (thread
           (lambda ()
             (channel-put results
               (with-handlers ([exn:fail? (lambda (_) #f)])
                 (claim-pending! path metadata)
                 #t))))))
      (check-equal? (for/sum ([i (in-range 8)]) (if (channel-get results) 1 0)) 1)
      (for-each thread-wait workers)
      (clear-pending! path id)
      (call-with-output-file path (lambda (out) (display "{" out)))
      (check-exn exn:fail? (lambda () (read-pending path)))
      (check-exn exn:fail? (lambda () (claim-pending! path metadata)))
      (check-exn exn:fail? (lambda () (clear-pending! path id))))
    (lambda () (delete-directory/files dir))))
