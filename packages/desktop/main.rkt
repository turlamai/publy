#lang racket/base
;; Native desktop entry point. The browser and desktop share the same built UI.
(require racket/file racket/runtime-path glaze "draft-bridge.rkt" "recovery-journal.rkt" "version.rkt" "updater.rkt")
(define-runtime-path public "../workbench/dist-desktop")
(define (workbench-ready? dir)
  (for/and ([name '("index.html" "workbench.js" "workbench.css" "workbench-math.js" "workbench-cards.js")])
    (file-exists? (build-path dir name))))
(provide workbench-ready?)
(module+ main
  (unless (workbench-ready? public)
    (error 'publy "Workbench is not built. Run node scripts/build-workbench.mjs from the repository root."))
  (when (equal? (current-command-line-arguments) #("--check-bundle"))
    (printf "Publy ~a bundle is ready\n" app-version)
    (exit 0))
  (run-app #:public-dir public
           #:api (append (make-draft-routes (default-recovery-path)) (make-update-routes))
           #:transport 'native
           #:max-body-size (* 32 1024 1024)
           #:capability (make-capability "publy-workbench" (cons 'update:use draft-permissions))
           #:title "Publy"
           #:width 1120
           #:height 800
           #:app-id desktop-app-id
           #:window-state #t))
(module+ test
  (require rackunit (submod "hosted-transport.rkt" test)
           (submod "recovery-journal.rkt" test)
           (submod "updater.rkt" test))
  (define dir (make-temporary-file "publy-desktop~a" 'directory))
  (dynamic-wind void
    (lambda ()
      (check-false (workbench-ready? dir))
      (for ([name '("index.html" "workbench.js" "workbench.css" "workbench-math.js" "workbench-cards.js")])
        (call-with-output-file (build-path dir name) void))
      (check-true (workbench-ready? dir)))
    (lambda () (delete-directory/files dir))))
