#!/bin/sh

set -e

cat > san.cnf <<EOF
[req]
default_bits       = 2048
prompt             = no
default_md         = sha256
distinguished_name = dn
x509_extensions    = v3_req

[dn]
CN = wtransport self-signed

[v3_req]
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
IP.1 = 127.0.0.1
IP.2 = ::1
EOF

openssl ecparam -name prime256v1 -genkey -noout -out key.pem

openssl req -x509 -nodes -days 14 \
  -key key.pem \
  -out cert.pem \
  -config san.cnf \
  -extensions v3_req \
  -sha256 

rm san.cnf
