# group-judge-web

小判官的網頁後台。純靜態站：原生 ES modules，沒有框架、沒有 build step，改完存檔
重新整理就生效。整個專案的說明與上線步驟在上一層的 [README](../README.md)。

## 本機開發

```bash
python3 dev_server.py
```

然後開 http://localhost:5173 。在 localhost 開的時候，後端預設找
`http://localhost:5002`（要換就在網址加 `?apiBase=…`）。

★ 用 `dev_server.py`，不要用 `python3 -m http.server`：後者會讓瀏覽器快取檔案，
改了程式畫面卻還是舊的。

## 桌面版與行動版是兩套畫面

同一個網址，`js/main.js` 在載入時判斷裝置（規則在 `js/device.js`），只下載其中
一套。兩套各寫各的版面；「按下去會發生什麼」只有一份，放在共用的 `js/logic/`。

| 位置 | 內容 |
|---|---|
| `js/main.js` | 進入點：確認登入 → 判斷裝置 → 載入對應的外殼 |
| `js/api.js`、`auth.js` | 唯一的 fetch 出口、Google 登入與 session |
| `js/ui.js`、`widgets.js`、`format.js` | 兩邊共用的零件：按鈕、對話框、可編輯的文字、日期格式 |
| `js/logic/` | 兩邊共用的行為：頁籤切換、名單的選取與標記、成員的修改、讀取成員資料 |
| `js/desktop/` + `css/desktop.css` | 桌面版：上方頁籤、表格、置中的對話框 |
| `js/mobile/` + `css/mobile.css` | 行動版：底部頁籤、卡片、從底部滑上來的面板 |
| `css/base.css` | 兩邊共用的顏色、按鈕、對話框內容 |

要改某個功能的**規則**（例如什麼情況要先警告）改 `js/logic/`，兩邊一起生效；
要改它**長什麼樣子**，桌面版與行動版各改各的。

## 兩條硬規則

**DOM 一律用 `el()`（createElement + textContent）建，不要 `innerHTML` + 字串樣板。**
成員的 LINE 名稱、版規、訊息內容都是別人可以自由輸入的字。

**所有請求都走 `js/api.js`。** 登入失效時的重新登入、沒有權限時的處理都在那裡，
自己 fetch 就會漏掉。

## 部署

GitHub Pages，從 `main` 分支的根目錄發佈（repo 的 Settings → Pages → Deploy from a
branch）。push 到 `main` 之後大約一分鐘生效，網址是
https://beethoreven.github.io/group-judge-web/ 。

- `index.html` 裡要填好 `__GROUP_JUDGE_API_HOST__`（後端網址）與 `__GOOGLE_CLIENT_ID__`。
- 站在 `/group-judge-web/` 這個子路徑底下，所以**所有路徑都要寫相對的**
  （`css/base.css`，不是 `/css/base.css`）。寫成絕對路徑在本機看不出問題，上線才會
  404。
- 這個站的「來源」是 `https://beethoreven.github.io`，**不含後面的路徑**。後端的
  `ALLOWED_ORIGINS` 與 Google 登入的授權來源填的都是這一串。
- 同一個 GitHub 帳號底下所有 github.io 的站共用這個來源，瀏覽器裡的登入憑證
  （localStorage）彼此讀得到。
- GitHub 會讓瀏覽器把檔案快取十分鐘。剛部署完看到的還是舊版，強制重新整理就好。
- `.nojekyll` 是告訴 GitHub「這些是現成的靜態檔，不要用 Jekyll 處理」，不能刪。
- repo 裡的每個檔案都會被公開（免費方案的 Pages 也要求 repo 是公開的），不要放任何
  不能給人看的東西。
