#lang racket/base
(require racket/file)
(provide update-public-key-pem update-key-id call-with-embedded-update-key)
;; Publy desktop stable-channel verification identity. Private material is kept outside the repository.
(define update-public-key-pem "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAB4XLcm6m02vrj6uB4ZBQPRYWnSpeq4ziwK1dN6Iawyg=\n-----END PUBLIC KEY-----\n")
(define update-key-id "publy-2026-11")

(define (call-with-embedded-update-key action)
  (unless (and (string? update-public-key-pem) (string? update-key-id))
    (error 'updater "Embedded update trust is unavailable"))
  (define public (make-temporary-file "publy-update-public~a.pem"))
  (dynamic-wind
    void
    (lambda ()
      (call-with-output-file public
        (lambda (out) (display update-public-key-pem out))
        #:exists 'truncate)
      (action public))
    (lambda () (delete-file public))))
