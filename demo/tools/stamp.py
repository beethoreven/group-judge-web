"""示範版的版本號與 import map，寫進 demo/index.html。

    python3 demo/tools/stamp.py           更新 demo/index.html 與 demo/css/
    python3 demo/tools/stamp.py --check   只檢查是不是最新的（不是就回傳 1）

★ 改了 js/、css/ 或 demo/ 底下任何檔案之後、commit 之前要跑一次。正式版的
  tools/stamp.py 只管正式版的 index.html，不會碰示範版；這一支也不碰正式版。

它做三件事：
  1. import map：正式版的每個模組照樣帶上內容的雜湊（理由見 tools/stamp.py），
     只有 ../js/api.js、../js/auth.js 換成 demo/ 裡的假資料版本。少了這張表，示範
     版會載入真的 api.js——不過示範版的頁面沒有設定後端網址，請求只會打到
     github.io 自己而 404，不會碰到後端。
  2. demo/css/desktop.css、mobile.css：正式版的 js/main.js 用「相對於頁面」的路徑
     載入 css/desktop.css，在 demo/ 底下會找 demo/css/。這兩個檔案只有一行
     @import，轉到正式版的那一份。
  3. ../css/base.css、../js/main.js 的網址帶上版本。
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import sys

DEMO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.dirname(DEMO)
START = "  <!-- stamp:start（demo/tools/stamp.py 產生的，不要手改） -->"
END = "  <!-- stamp:end -->"
REPLACED = {"js/api.js": "api.js", "js/auth.js": "auth.js"}


def _files(base: str, folder: str, suffix: str) -> list[str]:
    found = []
    for dirpath, _dirs, names in os.walk(os.path.join(base, folder)):
        for name in names:
            if name.endswith(suffix):
                found.append(os.path.relpath(os.path.join(dirpath, name), base).replace(os.sep, "/"))
    return sorted(found)


def _version(path: str) -> str:
    with open(path, "rb") as f:
        return hashlib.sha1(f.read()).hexdigest()[:10]


def _shim(device: str) -> str:
    version = _version(os.path.join(ROOT, "css", f"{device}.css"))
    return (
        "/* 示範版：轉到正式版的樣式（demo/tools/stamp.py 產生的，不要手改）。 */\n"
        f'@import url("../../css/{device}.css?v={version}");\n'
    )


def wanted() -> dict[str, str]:
    """要寫出去的每個檔案（相對於 demo/）與內容。"""
    out = {f"css/{device}.css": _shim(device) for device in ("desktop", "mobile")}

    demo_scripts = {p: _version(os.path.join(DEMO, p)) for p in _files(DEMO, ".", ".js") if not p.startswith("tools/")}
    imports = {}
    for path in _files(ROOT, "js", ".js"):
        if path in REPLACED:
            target = REPLACED[path]
            imports[f"../{path}"] = f"./{target}?v={demo_scripts[target]}"
        else:
            imports[f"../{path}"] = f"../{path}?v={_version(os.path.join(ROOT, path))}"
    for path, version in demo_scripts.items():
        imports[f"./{path}"] = f"./{path}?v={version}"

    # 給 js/main.js 的 versioned() 查的：key 跟正式版一樣，值是 demo/css/ 那個轉接檔的版本。
    styles = {key: hashlib.sha1(text.encode()).hexdigest()[:10] for key, text in out.items()}
    block = "\n".join([
        START,
        f"  <script>window.__ASSET_VERSIONS__ = {json.dumps(styles, sort_keys=True)};</script>",
        '  <script type="importmap">',
        json.dumps({"imports": imports}, indent=2, sort_keys=True),
        "  </script>",
        END,
    ])

    with open(os.path.join(DEMO, "index.html"), encoding="utf-8") as f:
        page = f.read()
    if START not in page:
        raise SystemExit("demo/index.html 裡找不到 stamp:start")
    page = re.sub(re.escape(START) + r".*?" + re.escape(END), lambda _m: block, page, flags=re.S)
    base = _version(os.path.join(ROOT, "css", "base.css"))
    page = re.sub(r'href="\.\./css/base\.css(\?v=[0-9a-f]+)?"', f'href="../css/base.css?v={base}"', page)
    css = _version(os.path.join(DEMO, "demo.css"))
    page = re.sub(r'href="demo\.css(\?v=[0-9a-f]+)?"', f'href="demo.css?v={css}"', page)
    main = _version(os.path.join(ROOT, "js", "main.js"))
    page = re.sub(r'src="\.\./js/main\.js(\?v=[0-9a-f]+)?"', f'src="../js/main.js?v={main}"', page)
    out["index.html"] = page
    return out


def main() -> None:
    stale = []
    for path, text in wanted().items():
        full = os.path.join(DEMO, path)
        try:
            with open(full, encoding="utf-8") as f:
                current = f.read()
        except FileNotFoundError:
            current = None
        if current != text:
            stale.append(path)
            if "--check" not in sys.argv[1:]:
                os.makedirs(os.path.dirname(full), exist_ok=True)
                with open(full, "w", encoding="utf-8") as f:
                    f.write(text)
    if "--check" in sys.argv[1:]:
        if stale:
            raise SystemExit("示範版的版本不是最新的：請先執行 python3 demo/tools/stamp.py")
        return
    print("已更新：" + "、".join(stale) if stale else "示範版已經是最新的")


if __name__ == "__main__":
    main()
