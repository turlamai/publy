#lang racket/base
;; Native desktop entry point. The browser and desktop share the same built UI.
(require racket/file racket/runtime-path glaze "hosted-transport.rkt")
(define-runtime-path public "../workbench/dist")
(define (workbench-ready? dir)
  (for/and ([name '("index.html" "workbench.js" "workbench.css")])
    (file-exists? (build-path dir name))))
(provide workbench-ready?)
(module+ main
  (unless (workbench-ready? public)
    (error 'publy "Workbench is not built. Run node scripts/build-workbench.mjs from the repository root."))
  (run-app #:public-dir public
           #:title "Publy"
           #:width 1120
           #:height 800
           #:app-id "site.jrtx.publy"
           #:window-state #t))
(module+ test
  (require rackunit (submod "hosted-transport.rkt" test))
  (define dir (make-temporary-file "publy-desktop~a" 'directory))
  (dynamic-wind void
    (lambda ()
      (check-false (workbench-ready? dir))
      (for ([name '("index.html" "workbench.js" "workbench.css")])
        (call-with-output-file (build-path dir name) void))
      (check-true (workbench-ready? dir)))
    (lambda () (delete-directory/files dir))))
