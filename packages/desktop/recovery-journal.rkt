#lang racket/base
(require db json racket/file racket/path racket/string)
(provide default-recovery-path call-with-recovery read-pending claim-pending! clear-pending!)

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

(define (read-legacy path)
  (when (> (file-size path) 65536)
    (error 'recovery "Invalid recovery journal size"))
  (call-with-input-file path
    (lambda (in)
      (define value (validate (read-json in)))
      (unless (eof-object? (read-json in))
        (error 'recovery "Unexpected trailing journal data"))
      value)))

;; Keep the OS lock across the entire delivery or readback. SQLite commits
;; independently so an abandoned network call cannot roll back its claim.
(define process-lock (make-semaphore 1))
(define (call-with-recovery path task busy)
  (call-with-semaphore
   process-lock
   (lambda ()
     (make-directory* (or (path-only path) (current-directory)))
     (call-with-file-lock/timeout
      #f 'exclusive
      (lambda ()
        (define db-path (path-add-extension path #".sqlite3" #"."))
        ;; Preserve Unix file mode bits. On Windows use the current user's
        ;; profile ACL; Racket's Unix-style creation mode marks files read-only.
        (unless (or (eq? (system-type 'os) 'windows) (file-exists? db-path))
          (call-with-output-file db-path void #:permissions #o600 #:exists 'error))
        (define db (sqlite3-connect #:database db-path #:mode 'create))
        (dynamic-wind
          void
          (lambda ()
            (query-exec db "PRAGMA synchronous = EXTRA")
            (query-exec db "PRAGMA fullfsync = ON")
            (query-exec db "CREATE TABLE IF NOT EXISTS pending (slot INTEGER PRIMARY KEY CHECK (slot = 1), id TEXT NOT NULL, account TEXT NOT NULL, title TEXT NOT NULL)")
            (when (file-exists? path)
              (define old (read-legacy path))
              (define saved (read-pending db))
              (cond [(not saved) (claim-pending! db old)]
                    [(not (equal? saved old)) (error 'recovery "Conflicting recovery journals")])
              ;; A crash before removing the old file leaves two matching records.
              (delete-file path))
            (task db))
          (lambda () (disconnect db))))
      busy #:lock-file (path-add-extension path #".lock" #".") #:max-delay 0))
   busy))

(define (read-pending db)
  (define row (query-maybe-row db "SELECT id, account, title FROM pending WHERE slot = 1"))
  (and row (validate (hasheq 'id (vector-ref row 0) 'account (vector-ref row 1) 'title (vector-ref row 2)))))

(define (claim-pending! db metadata)
  (define value (validate metadata))
  (query-exec db "INSERT INTO pending VALUES (1, ?, ?, ?)"
              (hash-ref value 'id) (hash-ref value 'account) (hash-ref value 'title))
  value)

(define (clear-pending! db confirmed-id)
  (query-exec db "DELETE FROM pending WHERE slot = 1 AND id = ?" confirmed-id)
  (unless (= 1 (query-value db "SELECT changes()"))
    (error 'recovery "Pending draft changed or is missing")))

(module+ test
  (require rackunit racket/port racket/runtime-path racket/system)
  (define-runtime-path self "recovery-journal.rkt")
  (define dir (make-temporary-file "publy-recovery~a" 'directory))
  (define path (build-path dir "pending.json"))
  (define id (make-string 32 #\a))
  (define metadata (hasheq 'id id 'account "测试公众号" 'title "Draft"))
  (define (with-db proc) (call-with-recovery path proc (lambda () 'busy)))
  (dynamic-wind
    void
    (lambda ()
      (check-false (with-db read-pending))
      (unless (eq? (system-type 'os) 'windows)
        (check-equal? (file-or-directory-permissions (path-add-extension path #".sqlite3" #".") 'bits) #o600))
      (call-with-output-file path (lambda (out) (write-json metadata out)))
      (check-equal? (with-db read-pending) metadata)
      (check-false (file-exists? path))
      (check-exn exn:fail? (lambda () (with-db (lambda (db) (claim-pending! db metadata)))))
      (check-exn exn:fail? (lambda () (with-db (lambda (db) (clear-pending! db "")))))
      (with-db (lambda (db) (clear-pending! db id)))
      (define code
        (format "(begin (require (file ~s)) (call-with-recovery ~s (lambda (db) (claim-pending! db '~s) (displayln 'acquired) (flush-output) (read-line)) (lambda () (displayln 'busy))))"
                (path->string self) (path->string path) metadata))
      (define-values (proc stdout stdin stderr)
        (subprocess #f #f #f (find-executable-path "racket") "-e" code))
      (dynamic-wind
        void
        (lambda ()
          (check-equal? (read-line stdout) "acquired")
          (check-eq? (with-db read-pending) 'busy)
          (subprocess-kill proc #t)
          (subprocess-wait proc)
          ;; Windows may release a terminated process's byte-range locks
          ;; after the process handle has signaled. Claims stay blocked
          ;; until the kernel actually grants the next lock.
          (define restored
            (let loop ([attempts 100])
              (define result (with-db read-pending))
              (if (and (eq? result 'busy) (positive? attempts))
                  (begin (sleep 0.1) (loop (sub1 attempts)))
                  result)))
          (check-equal? restored metadata))
        (lambda ()
          (subprocess-kill proc #t)
          (close-input-port stdout)
          (close-input-port stderr)
          (close-output-port stdin)))
      (with-db (lambda (db) (clear-pending! db id)))
      (check-false (with-db read-pending))
      (call-with-output-file path (lambda (out) (display "{" out)))
      (check-exn exn:fail? (lambda () (with-db read-pending))))
    (lambda () (delete-directory/files dir))))
