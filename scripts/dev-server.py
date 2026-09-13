#!/usr/bin/env python3
"""Static dev server for local preview, with HTTP caching disabled.

`python -m http.server` sends `Last-Modified` but no `Cache-Control`. Browsers
then apply *heuristic* freshness and will happily keep serving a module from
disk cache after it has been edited — without even revalidating. During this
build that repeatedly made already-fixed code look broken: the file on disk and
over the wire was correct, while the page kept running the old bytes.

Sending `no-store` on every response removes the entire class of problem, so a
save is always what the next reload runs.

Production is unaffected — this is a dev-only server. Real hosts should send
proper long-lived caching for fingerprinted assets.

    python3 scripts/dev-server.py [port] [directory]
"""

import functools
import http.server
import os
import sys

DEFAULT_PORT = 4832


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    """SimpleHTTPRequestHandler that forbids caching of everything it serves."""

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, fmt, *args):
        # Keep the preview pane's log readable: errors only, not every asset.
        if args and str(args[0]).startswith(('4', '5')):
            super().log_message(fmt, *args)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PORT
    directory = sys.argv[2] if len(sys.argv) > 2 else os.path.dirname(
        os.path.dirname(os.path.abspath(__file__))
    )

    handler = functools.partial(NoCacheHandler, directory=directory)
    server = http.server.ThreadingHTTPServer(('127.0.0.1', port), handler)
    print(f'dev-server: http://127.0.0.1:{port}/  (no-store)  serving {directory}')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()


if __name__ == '__main__':
    main()
