#!/usr/bin/env python3
import os
import http.server
import socketserver
import mimetypes

ROOT = "/Users/amtbrs/Documents/GitHub/ern-cicek"
os.chdir(ROOT)

JS_UTF8 = 'application/javascript; charset=utf-8'

class UTF8Handler(http.server.SimpleHTTPRequestHandler):
    # Explicit UTF-8 for all text-like types
    extensions_map = {
        '.html': 'text/html; charset=utf-8',
        '.htm':  'text/html; charset=utf-8',
        '.css':  'text/css; charset=utf-8',
        '.js':   JS_UTF8,
        '.mjs':  JS_UTF8,
        '.json': 'application/json; charset=utf-8',
        '.svg':  'image/svg+xml; charset=utf-8',
        '.txt':  'text/plain; charset=utf-8',
        '.xml':  'application/xml; charset=utf-8',
        '.csv':  'text/csv; charset=utf-8',
        '.tsv':  'text/tab-separated-values; charset=utf-8',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg':'image/jpeg',
        '.webp':'image/webp',
        '.gif': 'image/gif',
        '.ico': 'image/x-icon',
        '': 'application/octet-stream',
    }

    def guess_type(self, path):
        _, ext = os.path.splitext(path)
        ext = ext.lower()
        ctype = self.extensions_map.get(ext)
        if ctype:
            return ctype
        # Fallback to mimetypes and add charset for generic text/JS/JSON/SVG
        base = mimetypes.types_map.get(ext)
        if not base:
            return 'application/octet-stream'
        if base.startswith('text/'):
            return base + '; charset=utf-8'
        if base in ('application/javascript', 'application/x-javascript'):
            return JS_UTF8
        if base in ('application/json', 'application/ld+json'):
            return base + '; charset=utf-8'
        if base == 'image/svg+xml':
            return 'image/svg+xml; charset=utf-8'
        return base

    def end_headers(self):
        # Prevent stale cached mis-encodings
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        super().end_headers()

def main():
    with socketserver.TCPServer(('127.0.0.1', 8000), UTF8Handler) as httpd:
        print('UTF-8 HTTP server at http://127.0.0.1:8000/')
        httpd.serve_forever()

if __name__ == '__main__':
    main()
