"""產生英文示範版（demo-en/）。

    python3 demo-en/tools/build.py           重新產生 demo-en/ 底下的檔案
    python3 demo-en/tools/build.py --check   只檢查是不是最新的（不是就回傳 1）

★ 改了 js/、css/、demo/ 或這個資料夾底下任何檔案之後、commit 之前要跑一次。
  正式版的 tools/stamp.py、中文示範版的 demo/tools/stamp.py 都不碰這裡，這一支也
  不碰它們——正式版一個字都不為示範版改。

做法：把正式版的畫面程式（js/）與中文示範版的假後端（demo/ 的 api、auth、session）
複製到 demo-en/js/，照 tools/translations.py 的對照表把中文換成英文。下面任一種情況
直接報錯、什麼都不寫，告訴你要補哪一句：

  - 對照表裡的某一句在來源檔裡找不到（正式版改了文字）
  - 換完之後程式碼裡還有中文（正式版多了新的文字）——註解不算，註解照舊是中文

不翻譯、手寫的只有 demo-en/js/data.js（英文的假資料與說明）與 demo-en/index.html。
英文版是自己完整的一份（js、css 都在 demo-en/ 裡），不需要 import map 換檔案；
import map 只用來帶版本號，理由同 tools/stamp.py。
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # demo-en/
ROOT = os.path.dirname(HERE)                                        # group-judge-web/
sys.path.insert(0, os.path.join(HERE, "tools"))
from translations import T  # noqa: E402

START = "  <!-- stamp:start（demo-en/tools/build.py 產生的，不要手改） -->"
END = "  <!-- stamp:end -->"
HAND_WRITTEN = {"js/data.js"}
CJK = re.compile(r"[　-〿㐀-鿿＀-￯]")


def _walk(folder: str, suffix: str) -> list[str]:
    found = []
    for dirpath, _dirs, names in os.walk(os.path.join(ROOT, folder)):
        for name in names:
            if name.endswith(suffix):
                found.append(os.path.relpath(os.path.join(dirpath, name), ROOT).replace(os.sep, "/"))
    return sorted(found)


def sources() -> dict[str, str]:
    """產生出來的檔案（相對於 demo-en/）→ 來源檔（相對於 group-judge-web/）。"""
    out = {}
    for path in _walk("js", ".js"):
        if path not in ("js/api.js", "js/auth.js"):  # 換成下面示範版的假後端
            out[path] = path
    for name in ("api.js", "auth.js", "session.js"):
        out[f"js/{name}"] = f"demo/{name}"
    for path in _walk("css", ".css"):
        out[path] = path
    out["demo.css"] = "demo/demo.css"
    return out


def code_lines(text: str):
    """（行號, 程式碼）——跳過註解。只用在檢查有沒有殘留中文，夠用就好。"""
    in_block = False
    for number, line in enumerate(text.splitlines(), 1):
        stripped = line.strip()
        if in_block:
            if "*/" in stripped:
                in_block = False
            continue
        if stripped.startswith("/*"):
            in_block = "*/" not in stripped
            continue
        if stripped.startswith(("//", "*")):
            continue
        yield number, re.split(r"(?<=[\s;,)])//", line)[0]


def translate(source: str, text: str, problems: list[str]) -> str:
    for zh, en in T.get(source, []):
        if zh not in text:
            problems.append(f"{source}：對照表的這一句找不到 → {zh}")
            continue
        text = text.replace(zh, en)
    for number, code in code_lines(text):
        if CJK.search(code):
            problems.append(f"{source}:{number}：還有中文沒翻 → {code.strip()}")
    return text


def header(target: str, source: str) -> str:
    note = f"自動產生（demo-en/tools/build.py），來源是 {source}。不要手改：改 demo-en/tools/translations.py 再重跑。"
    return f"/* {note} */\n" if target.endswith(".css") else f"// {note}\n"


def version(text: str) -> str:
    return hashlib.sha1(text.encode()).hexdigest()[:10]


def wanted() -> dict[str, str]:
    problems: list[str] = []
    out = {}
    for target, source in sources().items():
        with open(os.path.join(ROOT, source), encoding="utf-8") as f:
            text = f.read()
        if target.endswith(".js"):
            text = translate(source, text, problems)
        out[target] = header(target, source) + text

    for path in HAND_WRITTEN:
        with open(os.path.join(HERE, path), encoding="utf-8") as f:
            text = f.read()
        for number, code in code_lines(text):
            if CJK.search(code):
                problems.append(f"demo-en/{path}:{number}：還有中文 → {code.strip()}")
        out[path] = text
    unused = sorted(set(T) - set(sources().values()))
    problems += [f"對照表裡的 {path} 已經不是來源檔了" for path in unused]
    if problems:
        raise SystemExit("英文示範版產生失敗：\n  " + "\n  ".join(problems))

    scripts = {path: version(text) for path, text in out.items() if path.endswith(".js")}
    styles = {path: version(text) for path, text in out.items() if path in ("css/desktop.css", "css/mobile.css")}
    imports = {f"./{path}": f"./{path}?v={v}" for path, v in sorted(scripts.items())}
    block = "\n".join([
        START,
        f"  <script>window.__ASSET_VERSIONS__ = {json.dumps(styles, sort_keys=True)};</script>",
        '  <script type="importmap">',
        json.dumps({"imports": imports}, indent=2, sort_keys=True),
        "  </script>",
        END,
    ])
    with open(os.path.join(HERE, "index.html"), encoding="utf-8") as f:
        page = f.read()
    if START not in page:
        raise SystemExit("demo-en/index.html 裡找不到 stamp:start")
    page = re.sub(re.escape(START) + r".*?" + re.escape(END), lambda _m: block, page, flags=re.S)
    page = re.sub(r'href="css/base\.css(\?v=[0-9a-f]+)?"', f'href="css/base.css?v={version(out["css/base.css"])}"', page)
    page = re.sub(r'href="demo\.css(\?v=[0-9a-f]+)?"', f'href="demo.css?v={version(out["demo.css"])}"', page)
    page = re.sub(r'src="js/main\.js(\?v=[0-9a-f]+)?"', f'src="js/main.js?v={scripts["js/main.js"]}"', page)
    out["index.html"] = page
    return out


def leftovers(out: dict[str, str]) -> list[str]:
    """demo-en/js、demo-en/css 裡不是這次產生的檔案（來源被刪掉了）。"""
    extra = []
    for folder in ("js", "css"):
        for dirpath, _dirs, names in os.walk(os.path.join(HERE, folder)):
            for name in names:
                path = os.path.relpath(os.path.join(dirpath, name), HERE).replace(os.sep, "/")
                if path not in out:
                    extra.append(path)
    return sorted(extra)


def main() -> None:
    check = "--check" in sys.argv[1:]
    out = wanted()
    stale = []
    for path, text in out.items():
        full = os.path.join(HERE, path)
        try:
            with open(full, encoding="utf-8") as f:
                current = f.read()
        except FileNotFoundError:
            current = None
        if current != text:
            stale.append(path)
            if not check:
                os.makedirs(os.path.dirname(full), exist_ok=True)
                with open(full, "w", encoding="utf-8") as f:
                    f.write(text)
    extra = leftovers(out)
    if check:
        if stale or extra:
            raise SystemExit("英文示範版不是最新的：請先執行 python3 demo-en/tools/build.py")
        return
    for path in extra:
        os.remove(os.path.join(HERE, path))
    changed = stale + [f"刪除 {p}" for p in extra]
    print("已更新：" + "、".join(changed) if changed else "英文示範版已經是最新的")


if __name__ == "__main__":
    main()
