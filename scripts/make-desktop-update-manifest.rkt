#lang racket/base
;; Sign a complete set of previously accepted installer artifacts. This
;; command writes a local feed and has no release or deployment side effects.
(require glaze/update glaze/signing racket/date racket/file racket/format
         "../packages/desktop/updater.rkt" "../packages/desktop/update-trust.rkt" "../packages/desktop/version.rkt")

(define args (current-command-line-arguments))
(unless (= (vector-length args) 2)
  (error 'manifest "Usage: racket scripts/make-desktop-update-manifest.rkt <artifact-dir> <private.pem>"))
(define folder (vector-ref args 0))
(define private (vector-ref args 1))
(unless (and (string? update-public-key-pem) (string? update-key-id))
  (error 'manifest "Configure the verification key and key ID embedded in Publy first"))
(define now (seconds->date (current-seconds) #f))
(define (two n) (~r n #:min-width 2 #:pad-string "0"))
(define timestamp
  (format "~a-~a-~aT~a:~a:~aZ"
          (date-year now) (two (date-month now)) (two (date-day now))
          (two (date-hour now)) (two (date-minute now)) (two (date-second now))))
(define artifacts
  (for/list ([platform '(macos windows linux)] [arch '(arm64 x64 x64)] [format '(dmg msi deb)])
    (define name (desktop-artifact-name app-version platform arch))
    (define path (build-path folder name))
    (define size (file-size path))
    (unless (<= 1 size desktop-max-artifact-size)
      (error 'manifest "Invalid installer size for ~a" name))
    (update-artifact platform arch (release-asset-url app-version name) (sha256-file path)
                     size format '() #f)))
(define manifest (update-manifest desktop-app-id app-version 1 'stable timestamp "0.1.0" #f #f 100 artifacts))
(define signed (open-output-bytes))
(write-signed-update-manifest manifest private update-key-id #:password (getenv "PUBLY_SIGNING_PASSWORD") signed)
(define bytes (get-output-bytes signed))
(call-with-embedded-update-key
 (lambda (public)
   (void (verify-signed-update-manifest (open-input-bytes bytes) public #:key-id update-key-id))))
(call-with-output-file (build-path folder "update-manifest.json")
  (lambda (out) (void (write-bytes bytes out)))
  #:exists 'error)
