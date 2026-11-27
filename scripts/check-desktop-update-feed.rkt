#lang racket/base
;; Verify the exact release assets through the updater's selection and hashing
;; rules. With a directory argument this only reads local staged files.
(require glaze/update openssl racket/file (only-in net/url-connect current-https-protocol)
         "../packages/desktop/update-trust.rkt"
         "../packages/desktop/updater.rkt" "../packages/desktop/version.rkt")

(define argv (current-command-line-arguments))
(unless (<= (vector-length argv) 1)
  (error 'feed "Usage: racket scripts/check-desktop-update-feed.rkt [staged-artifact-dir]"))
(define local (and (= (vector-length argv) 1) (vector-ref argv 0)))
(call-with-embedded-update-key
 (lambda (public)
   (parameterize ([current-https-protocol (ssl-secure-client-context)])
     (define feed
       (if local
           (call-with-input-file (build-path local "update-manifest.json")
             (lambda (in) (verify-signed-update-manifest in public #:key-id update-key-id)))
           (fetch-update-manifest desktop-manifest-url public #:key-id update-key-id)))
     (unless (and (equal? (update-manifest-version feed) app-version)
                  (= (length (update-manifest-artifacts feed)) 3))
       (error 'feed "Unexpected desktop release version or platform count"))
     (define stage (and (not local) (make-temporary-file "publy-feed-check~a" 'directory)))
     (dynamic-wind
       void
       (lambda ()
         (for ([platform '(macos windows linux)] [arch '(arm64 x64 x64)])
           (define config
             (updater-config desktop-app-id (update-manifest-minimum-version feed)
                             'stable platform arch public update-key-id 0 desktop-max-artifact-size))
           (define candidate (eligible-candidate config feed))
           (unless candidate (error 'feed "No verified upgrade for ~a/~a" platform arch))
           (define target (desktop-artifact-name app-version platform arch))
           (if local
               (void (verify-update-artifact! candidate (build-path local target) #:public-key public))
               (void (download-update config candidate (build-path stage target))))
           (printf "Verified ~a\n" target)))
       (lambda () (when stage (delete-directory/files stage)))))))
