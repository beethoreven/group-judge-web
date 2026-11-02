# 示範版（demo/）

https://beethoreven.github.io/group-judge-web/demo/

給面試展示用的小判官後台。畫面跟正式版一模一樣（直接載入正式版的 `../js/`、`../css/`），
但**一個請求都不送到後端**：資料是 `data.js` 寫死的假資料，版規與訊息的內容換成各欄位的
功能說明。按了儲存、改了成員都只改這一頁的記憶體，重新整理就還原。之後不需要了，
整個 `demo/` 資料夾刪掉就好，正式版不受影響。

## 怎麼做到的

| 檔案 | 作用 |
|---|---|
| `index.html` | 入口。import map 把 `../js/api.js`、`../js/auth.js` 換成這裡的版本 |
| `api.js` | 假的後端：照 `group-judge-backend/app.py` 的回應格式用假資料回答 |
| `auth.js`、`session.js` | 假的登入：Google 登入只在瀏覽器裡讀 email 拿來顯示，不管誰登入都是同一位「示範使用者」（一般成員） |
| `data.js` | 假資料與說明文字。名字全是虛構的 |
| `css/*.css` | 一行 `@import` 轉到正式版的樣式（正式版的 `main.js` 用相對於頁面的路徑載入樣式） |
| `tools/stamp.py` | 產生上面的 import map 與 `css/`，並替每個檔案帶上版本 |

## 不能影響正式版

- **正式版的檔案一個都不改。** 示範版需要的轉接全部放在 `demo/` 裡。
- 示範版跟正式版同一個來源，localStorage 是共用的。`index.html` 一開頭把這一頁所有
  key 加上 `demo:`，示範版讀不到正式版的管理員登入憑證，切換裝置、排序之類的偏好也
  不會互相影響。
- 示範版的頁面沒有設定後端網址（`__GROUP_JUDGE_API_HOST__`）：萬一 import map 沒生效
  而載入了真的 `api.js`，請求也只會打到 github.io 自己，不會碰到後端。

## 改了檔案之後

改了 `js/`、`css/` 或 `demo/` 底下的檔案，commit 之前：

```bash
python3 demo/tools/stamp.py
```

正式版的 `tools/stamp.py` 只管正式版，兩支各跑各的。正式版的畫面多了新的 API 呼叫時，
示範版會顯示「示範版沒有模擬這個功能」，要在 `api.js` 補上對應的假回應。

本機：`python3 dev_server.py` 之後開 http://localhost:5173/demo/ 。
