#lang racket/base
(require glaze glaze/update (only-in net/url-connect current-https-protocol) openssl racket/file racket/match racket/path
         "deadline.rkt" "update-trust.rkt" "version.rkt")
(provide make-update-routes desktop-artifact-name eligible-candidate release-asset-url)

(define manifest-url "https://publy.jrtx.site/desktop/update-manifest.json")
(define maximum-size (* 150 1024 1024))
(define (extension platform arch)
  (match (list platform arch)
    ['(macos arm64) 'dmg]
    ['(windows x64) 'msi]
    ['(linux x64) 'deb]
    [_ #f]))
(define (desktop-artifact-name version platform arch)
  (define ext (extension platform arch))
  (and ext (format "publy-desktop-~a-~a-~a.~a" version platform arch ext)))
(define (release-asset-url version filename)
  (format "https://github.com/turlamai/publy/releases/download/desktop-v~a/~a" version filename))
(define (eligible-candidate config manifest)
  (define candidate (select-update config manifest))
  (when candidate
    (define artifact (update-candidate-artifact candidate))
    (define version (update-manifest-version manifest))
    (define platform (update-artifact-platform artifact))
    (define arch (update-artifact-architecture artifact))
    (define filename (desktop-artifact-name version platform arch))
    (unless (and filename (regexp-match? #px"^[0-9]+[.][0-9]+[.][0-9]+$" version)
                 (equal? (update-artifact-url artifact) (release-asset-url version filename))
                 (eq? (update-artifact-installer artifact) (extension platform arch))
                 (<= 1 (update-artifact-size artifact) maximum-size))
      (error 'updater "Invalid signed Publy installer metadata")))
  candidate)

(define (make-update-routes)
  (define platform (case (system-type 'os) [(macosx) 'macos] [(windows) 'windows] [else 'linux]))
  (define arch (if (regexp-match? #rx"arm64|aarch64" (symbol->string (system-type 'target-machine)))
                   'arm64 'x64))
  (define enabled? (and update-public-key-pem update-key-id (extension platform arch) #t))
  (define (state status) (hasheq 'status status))
  (define lock (make-semaphore 1))
  (define (with-verified-feed request timeout)
    (cond
      [(not enabled?) (state "disabled")]
      [else
       (call-with-semaphore
        lock
        (lambda ()
          (with-handlers ([exn:fail? (lambda (_) (state "unavailable"))])
            (define public (make-temporary-file "publy-update-public~a.pem"))
            (dynamic-wind
              void
              (lambda ()
                (call-with-output-file public
                  (lambda (out) (display update-public-key-pem out))
                  #:exists 'truncate)
                (call-with-deadline
                 timeout
                 (lambda ()
                   (parameterize ([current-https-protocol (ssl-secure-client-context)])
                     (define config (updater-config desktop-app-id app-version 'stable platform arch public update-key-id 0 maximum-size))
                     (define manifest (fetch-update-manifest manifest-url public #:key-id update-key-id))
                     (request config (eligible-candidate config manifest))))))
              (lambda () (delete-file public)))))
        (lambda () (state "busy")))]))
  (define-api-routes routes
    [(POST "api/update-enabled" #:permission 'update:use)
     (updateEnabled)
     (hasheq 'enabled enabled?)]
    [(POST "api/update-check" #:permission 'update:use)
     (updateCheck)
     (with-verified-feed
      (lambda (_config candidate)
        (if candidate
            (hasheq 'status "available" 'version (update-manifest-version (update-candidate-manifest candidate)))
            (state "current")))
      15)]
    [(POST "api/update-download" #:permission 'update:use)
     (updateDownload [version GString])
     (define location #f)
     (define completed? #f)
     (dynamic-wind
       void
       (lambda ()
         (with-verified-feed
          (lambda (config candidate)
            (cond
              [(and candidate (equal? version (update-manifest-version (update-candidate-manifest candidate))))
               (define root (build-path (find-system-path 'home-dir) "Downloads"))
               (make-directory* root)
               (set! location (make-temporary-file "Publy-update~a" 'directory root))
               (define destination (build-path location (desktop-artifact-name version platform arch)))
               (download-update config candidate destination)
               (set! completed? #t)
               (hasheq 'status "downloaded" 'path (path->string destination))]
              [else (state "changed")]))
          90))
       (lambda ()
         (when (and location (not completed?) (directory-exists? location))
           (delete-directory/files location))))])
  routes)

(module+ test
  (require rackunit)
  (define test-version "0.2.0")
  (define filename (desktop-artifact-name test-version 'linux 'x64))
  (define artifact (update-artifact 'linux 'x64 (release-asset-url test-version filename)
                                    (make-string 64 #\a) 10 'deb '() #f))
  (define manifest (update-manifest desktop-app-id test-version 1 'stable "2026-11-27T00:00:00Z" "0.1.0" #f #f 100 (list artifact)))
  (define config (updater-config desktop-app-id "0.1.0" 'stable 'linux 'x64 #f #f 0 maximum-size))
  (check-equal? (update-candidate-artifact (eligible-candidate config manifest)) artifact)
  (check-false (eligible-candidate (struct-copy updater-config config [current-version test-version]) manifest))
  (check-false (eligible-candidate (struct-copy updater-config config [platform 'windows]) manifest))
  (check-exn exn:fail? (lambda () (eligible-candidate config (struct-copy update-manifest manifest [application-id "other"]))))
  (check-exn exn:fail?
    (lambda () (eligible-candidate config
      (struct-copy update-manifest manifest
        [artifacts (list (struct-copy update-artifact artifact [url "https://other.example/installer.deb"]))])))))
