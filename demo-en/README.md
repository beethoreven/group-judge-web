# 英文示範版（demo-en/）

https://beethoreven.github.io/group-judge-web/demo-en/

中文示範版（`demo/`）的全英文版本，結構與行為一模一樣，也是一個請求都不送到後端。
不需要了就整個 `demo-en/` 資料夾刪掉，正式版與中文示範版都不受影響。

## 檔案是怎麼來的

| 檔案 | 來源 |
|---|---|
| `js/**`（`data.js` 除外）、`css/*.css`、`demo.css` | **產生的**：`tools/build.py` 把正式版的 `js/`、`css/` 與中文示範版的 `demo/api.js`、`auth.js`、`session.js`、`demo.css` 複製過來，照 `tools/translations.py` 的中英對照表換掉文字 |
| `js/data.js` | 手寫：英文的假資料、版規與訊息的功能說明、英文變數名稱 |
| `index.html` | 手寫：英文的提示列、拉丁字型（正式版的 Noto Sans TC 會把 ’ “ ” — 畫成全形）；版本號那一段是 `build.py` 填的 |

**產生的檔案不要手改**，改了下次產生就被蓋掉。要改文字就改 `tools/translations.py`。

## 改了檔案之後

改了正式版的 `js/`、`css/`，中文示範版的 `demo/`，或這個資料夾底下的檔案，commit 之前：

```bash
python3 demo-en/tools/build.py
```

正式版改了或多了中文字，這一支會直接報錯、什麼都不寫，並列出哪個檔案的哪一句要補翻譯
（「對照表的這一句找不到」或「還有中文沒翻」），補到 `tools/translations.py` 再跑一次。
`--check` 只檢查不寫入。

## 不能影響正式版

- 正式版的檔案一個都不為英文版改；產生工具只讀正式版、只寫 `demo-en/`。
- `index.html` 一開頭把這一頁所有 localStorage key 加上 `demo-en:`，讀不到正式版的
  管理員登入憑證，偏好設定也跟正式版、中文示範版互不影響。
- 頁面沒有設定後端網址，假後端裡也沒有 fetch。

★ 英文版的假後端是從 `demo/` 產生的：刪中文示範版之前，先把 `demo/api.js`、`auth.js`、
`session.js`、`demo.css` 搬進這裡、改成手寫，或兩個一起刪。

本機：`python3 dev_server.py` 之後開 http://localhost:5173/demo-en/ 。
