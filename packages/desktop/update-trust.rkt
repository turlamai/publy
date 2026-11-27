#lang racket/base
(provide update-public-key-pem update-key-id)
;; Set together for a signed release. Development candidates have no feed trust.
(define update-public-key-pem #f)
(define update-key-id #f)
