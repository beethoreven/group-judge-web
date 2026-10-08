"""替每個 js／css 檔標上版本（內容的雜湊），寫進 index.html。

    python3 tools/stamp.py           更新 index.html
    python3 tools/stamp.py --check   只檢查 index.html 是不是最新的（不是就回傳 1）

★ 改了 js/ 或 css/ 底下任何檔案之後、commit 之前要跑一次。

為什麼需要（2026-10-08）：GitHub Pages 讓瀏覽器把每個檔案快取 10 分鐘，而後台畫面的
程式是登入後才動態載入的，這種載入連強制重新整理都不一定會重抓——更新之後，管理員
重新整理了十幾次才看到新版。

做法：網址帶上內容的雜湊（?v=…），檔案一改網址就不同，瀏覽器只能抓新的。
  - js：index.html 裡放一張 import map，把每個模組的網址對到帶版本的那一個。模組之間
    互相 import 的寫法不用動，瀏覽器會照這張表換網址（動態 import 也一樣）。
  - css：base.css 直接寫在 <link> 上；桌面版／行動版的那一份是 js/main.js 載入的，
    版本放在 window.__ASSET_VERSIONS__ 讓它查。
  - index.html 自己不必處理：重新整理時瀏覽器一定會向伺服器確認它是不是最新的。

沒跑這支也不會壞：表上沒有的檔案照原本的網址載入，只是又回到「最多舊 10 分鐘」。
不支援 import map 的舊瀏覽器會忽略那張表，結果一樣。
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
START, END = "  <!-- stamp:start（tools/stamp.py 產生的，不要手改） -->", "  <!-- stamp:end -->"


def _files(folder: str, suffix: str) -> list[str]:
    found = []
    for dirpath, _dirs, names in os.walk(os.path.join(ROOT, folder)):
        for name in names:
            if name.endswith(suffix):
                found.append(os.path.relpath(os.path.join(dirpath, name), ROOT).replace(os.sep, "/"))
    return sorted(found)


def _version(path: str) -> str:
    with open(os.path.join(ROOT, path), "rb") as f:
        return hashlib.sha1(f.read()).hexdigest()[:10]


def stamped(page: str) -> str:
    """把 index.html 的內容換成標好版本的樣子。"""
    scripts = {path: _version(path) for path in _files("js", ".js")}
    styles = {path: _version(path) for path in _files("css", ".css")}
    imports = {f"./{path}": f"./{path}?v={version}" for path, version in scripts.items()}
    block = "\n".join([
        START,
        f"  <script>window.__ASSET_VERSIONS__ = {json.dumps(styles, sort_keys=True)};</script>",
        '  <script type="importmap">',
        json.dumps({"imports": imports}, indent=2, sort_keys=True),
        "  </script>",
        END,
    ])
    if START in page:
        page = re.sub(re.escape(START) + r".*?" + re.escape(END), lambda _m: block, page, flags=re.S)
    else:
        marker = '  <script src="https://accounts.google.com/gsi/client" async defer></script>'
        if marker not in page:
            raise SystemExit("index.html 裡找不到要插入的位置")
        page = page.replace(marker, block + "\n" + marker)
    page = re.sub(r'href="css/base\.css(\?v=[0-9a-f]+)?"', f'href="css/base.css?v={styles["css/base.css"]}"', page)
    page = re.sub(r'src="js/main\.js(\?v=[0-9a-f]+)?"', f'src="js/main.js?v={scripts["js/main.js"]}"', page)
    return page


def main() -> None:
    path = os.path.join(ROOT, "index.html")
    with open(path, encoding="utf-8") as f:
        current = f.read()
    wanted = stamped(current)
    if "--check" in sys.argv[1:]:
        if wanted != current:
            raise SystemExit("index.html 裡的版本不是最新的：請先執行 python3 tools/stamp.py")
        return
    if wanted != current:
        with open(path, "w", encoding="utf-8") as f:
            f.write(wanted)
        print("index.html 已更新")
    else:
        print("index.html 已經是最新的")


if __name__ == "__main__":
    main()
