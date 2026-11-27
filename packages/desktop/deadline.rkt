#lang racket/base
(provide call-with-deadline)
(define (call-with-deadline seconds operation)
  (define scope (make-custodian))
  (dynamic-wind
    void
    (lambda ()
      (define result (make-channel))
      (parameterize ([current-custodian scope])
        (thread (lambda ()
                  (channel-put result
                               (with-handlers ([exn:fail? (lambda (failure) (cons #f failure))])
                                 (cons #t (operation)))))))
      (define value (sync/timeout seconds result))
      (cond [(not value) (error 'desktop-request "Network operation timed out")]
            [(car value) (cdr value)]
            [else (raise (cdr value))]))
    (lambda () (custodian-shutdown-all scope))))
