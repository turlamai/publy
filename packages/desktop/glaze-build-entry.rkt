#lang racket/base
(require racket/path)
(require glaze)
;; Prefer the directory holding the packaged executable; inside a macOS
;; .app also try ../Resources/public; fall back to the launcher's CWD.
(let* ([exe (find-system-path 'run-file)]
       [dir (and (path? exe) (path-only exe))]
       [candidates (list dir
                         (and dir (build-path dir ".." "Resources")))]
       [pick (for/or ([c (in-list candidates)])
               (and c (directory-exists? (build-path c "public")) c))])
  (when (and pick (not (directory-exists? (build-path (current-directory) "public"))))
    (current-directory pick)))
(require "main.rkt")
(require (submod "main.rkt" main))
