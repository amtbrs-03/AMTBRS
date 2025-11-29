#!/usr/bin/env python3
import http.server
import ssl
import os

os.chdir('/Users/amtbrs/Documents/GitHub/ern-cicek')

server_address = ('127.0.0.1', 8443)
httpd = http.server.HTTPServer(server_address, http.server.SimpleHTTPRequestHandler)

context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
try:
	# Prefer SAN-based certificate for better browser trust
	context.load_cert_chain('localhost-san.crt', 'localhost-san.key')
except FileNotFoundError:
	# Fallback to original cert names if SAN cert not present
	context.load_cert_chain('localhost.crt', 'localhost.key')
httpd.socket = context.wrap_socket(httpd.socket, server_side=True)

print(f"HTTPS server running on https://127.0.0.1:8443/")
httpd.serve_forever()
