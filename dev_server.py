"""本機開發用的靜態檔伺服器。跟 `python3 -m http.server` 只差一件事：不讓瀏覽器快取。

    python3 dev_server.py          # http://localhost:5173

★ 為什麼不直接用 http.server：它只送 Last-Modified、不送 Cache-Control，瀏覽器
  會自己估一個「還算新鮮」的時間（大約是檔案年齡的 10%）。檔案放了幾個小時之後，
  剛改的東西瀏覽器根本不會重抓，畫面跑的是舊版——而伺服器、curl 看到的都是
  新的，怎麼查都像是「改了沒效」。boo-king-king 2026-09-02 在這上面繞了很久。

GitHub Pages 會把 repo 裡的每個檔案都放上網，包含這一支。裡面沒有機密，只是線上
用不到。
"""

from __future__ import annotations

import functools
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

# 不管從哪個目錄啟動，都是服務這支檔案所在的資料夾。
ROOT = os.path.dirname(os.path.abspath(__file__))


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
    print(f"http://localhost:{port}", flush=True)
    handler = functools.partial(NoCacheHandler, directory=ROOT)
    ThreadingHTTPServer(("127.0.0.1", port), handler).serve_forever()
