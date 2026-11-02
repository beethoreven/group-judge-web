/**
 * 示範版的假資料。正式版這些都是後端從資料庫算出來的；這裡寫死在前端，而且
 * 只活在這一頁的記憶體裡——按了「儲存」、改了成員，重新整理就還原。
 *
 * ★ 名字全部是虛構的（repo 是公開的，不能出現真實成員）。
 *
 * 日期都從「今天」往回推，統計區間的算法跟後端（timeutil.period_for）一樣：
 * 整理當月的前兩個完整月份，例如 11 月整理就看 9/1～10/31。
 */

const DAY = 86400000;

/** 'YYYY-MM-DD'（台灣時間） */
function plainDate(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(date);
}

/** 台灣時間某一天 00:00 的那一刻。 */
function midnight(y, m, d) {
  return new Date(Date.UTC(y, m - 1, d) - 8 * 3600000);
}

export function makePeriod(now) {
  const [y, m] = plainDate(now).split('-').map(Number);
  const startMonths = y * 12 + (m - 1) - 2;
  const start = midnight(Math.floor(startMonths / 12), (startMonths % 12) + 1, 1);
  const endBefore = midnight(y, m, 1);
  const end = new Date(endBefore.getTime() - DAY);
  const short = (date) => plainDate(date).slice(5).replace(/^0/, '').replace('-0', '/').replace('-', '/');
  const months = [0, 1].map((i) => {
    const total = startMonths + i;
    return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
  });
  return {
    start, endBefore, months,
    json: { start: plainDate(start), end: plainDate(end), label: `${short(start)}～${short(end)}` },
  };
}

export const MAX_LENGTH = 5000;

/** 後端 line_utils/render.py 的 VARIABLE_HELP，照抄。 */
export const VARIABLES = [
  { name: '{月份}', meaning: '現在是幾月，例如 10' },
  { name: '{起算日}', meaning: '統計區間的第一天，例如 8/1（這天之後加入的人不審查）' },
  { name: '{保護期月份}', meaning: '兩個月前的月份，例如 8（那次被保下的人這次保護期滿）' },
  { name: '{期間}', meaning: '統計區間，例如 8/1～9/30' },
  { name: '{名單}', meaning: '這個月的移除名單，一行一個名字' },
  { name: '{人數}', meaning: '移除名單上有幾個人' },
  { name: '{不得背書名單}', meaning: '移除名單上、之前被保下過而且之後一直沒發話的人' },
  { name: '{白名單}', meaning: '這個月從名單上拿掉（背書留下）的人' },
  { name: '{管理員名稱}', meaning: '（指令的訊息）tag 每一位在群組裡的管理員，前面自動空一格，例如「管理員{管理員名稱}」會變成「管理員 @小明 @小華」。私訊預覽與這裡的預覽只會顯示 @名字，在群組裡才是真的 tag' },
  { name: '{名稱}', meaning: '（歡迎訊息、黑名單警告）這次加入的人現在的 LINE 名稱' },
  { name: '{記錄名稱}', meaning: '（黑名單警告）他上次在群組裡用的名字' },
];

// ── 版規與訊息：內容改成「這個欄位是做什麼的」 ─────────────

const RULES = `【示範版說明｜版規】

這一格在正式版裡放的是群組的版規全文，存在資料庫的 messages 表（kind = rules），整個服務只有一份。

什麼時候會用到：
・群組裡任何人送出一則只有「版規」或「板規」兩個字的訊息（不必 tag 小判官），小判官就回覆這段文字。
・私訊小判官同樣兩個字：只有管理員會收到，一般成員私訊不會有反應，避免小判官被當成客服。

為什麼放在後台編輯：
版規以前是置頂公告，改一個字就要重發、舊的還會留在聊天紀錄裡。放在這裡之後，管理員按「編輯」改完存檔，下一次有人問就是新版本，不用重新發公告。

限制：
・LINE 一則文字訊息最多 5000 字，輸入框下方會即時算字數，超過就不能存（後端也會再擋一次）。
・回覆用的是 LINE 的 reply API，不算推播額度，所以問幾次都不花錢。

在示範版裡可以按右上角的「編輯」試試看：改完按「儲存」會更新畫面，但只存在這個分頁裡，重新整理就還原，不會寫進資料庫。`;

const EXTRA_RULES = `【示範版說明｜群組額外規範】

跟版規同一套機制、各自一份內容（kind = extra_rules）。用來放不適合寫進版規、但常被問到的事，例如揪團格式、店家合作的規定。

・群組裡有人送出「群組額外規範」這六個字，小判官就回這一段。
・這一格可以留空白：空白的時候小判官完全不回應，等於把這個功能關掉——下面那行灰字提醒的就是這件事。
・存檔時後端只檢查「是字串」與「不超過 5000 字」，內容原樣保存；發出去時也不做任何變數替換。`;

/** 訊息頁籤的分區。區塊的 key、標題、觸發說明跟後端 _message_groups 一樣。 */
function messageGroups() {
  let id = 100;
  const block = (name, content) => ({ id: ++id, name, content, updated_at: null });
  return [
    {
      key: 'welcome', title: '歡迎訊息', trigger: '有人加入群組時，小判官自動回覆（卡片）。',
      blocks: [block('歡迎訊息', `【示範版說明】有新成員加入群組時，LINE 會送 memberJoined 事件給小判官，它用這段文字做成一張卡片回覆。

同一個事件也會把這個人記進成員資料：記下加入時間（統計區間開始之後才加入的人，這次整理不審查），如果他 30 天內離開又回來，加入時間不重設，避免用「退群再加」洗掉沉默紀錄。

可以用 {名稱} 放他現在的 LINE 名稱。
例：歡迎{名稱}～詳細版規請輸入「版規」查詢。

按上面的「預覽」可以看到變數換成實際內容的樣子。`)],
    },
    {
      key: 'banned', title: '黑名單警告', trigger: '黑名單裡的人加入群組時，小判官自動回覆（卡片）。',
      blocks: [block('黑名單警告', `【示範版說明】加入的人如果在成員資料裡是「黑名單」，小判官改發這一段，而不是歡迎訊息，提醒管理員處理。

黑名單是綁在 LINE 帳號上的，換名字也認得出來：{記錄名稱} 是他上次在群組裡用的名字，{名稱} 是他這次的名字。
例：目前加入的{名稱}是記錄在案的禁止加入成員，上次他用的名字是{記錄名稱}

黑名單不會因為離開或重新加入而解除，要在「成員」頁籤手動改回來。`)],
    },
    {
      key: 'command:本月移除清單', title: '指令「本月移除清單」',
      trigger: '管理員在群組 tag 小判官說「本月移除清單」時，依序回覆下面這幾則（純文字）。私訊小判官說同一句話可以先預覽。',
      blocks: [
        block('開場', `【示範版說明｜第 1 則】整理流程的第一步：公告這個月要開始整理了。

為什麼是「指令」而不是排程推播：LINE 的推播按群組人數計費，免費額度發不了幾次；改成管理員在群組裡 tag 小判官下指令，小判官用「回覆」發出，就不計費。

可以用的變數：{月份}月份的整理、{起算日}之後加入的不審查、{保護期月份}月保下的人保護期滿。
例：{月份}月份的群組整理要開始了，{起算日}之後加入的朋友不在審查範圍內。`),
        block('移除名單', `【示範版說明｜第 2 則】列出這個月要移除的人。

{名單} 會換成「待移除名單」頁籤裡存好的名單，一行一個名字；{人數} 是幾個人。用到這兩個變數的指令，名單必須先在後台存過才發得出去——小判官會拒絕，並私訊管理員先去存名單，避免把系統剛算出來、還沒人看過的名單直接公告。
例：本月將剔除以下 {人數} 位：
{名單}`),
        block('不得背書名單', `【示範版說明｜第 3 則】之前被背書保留過、之後還是一直沒發話的人，這次不再接受背書。

{不得背書名單} 由後端比對歷次白名單算出來；名單上沒有這種人時會換成「（沒有）」。
例：以下為不得背書名單：
{不得背書名單}`),
        block('整理預告', `【示範版說明｜第 4 則】告訴大家多久後正式整理、怎麼申請背書、誤判要找誰。

{管理員名稱} 在群組裡會變成真的 tag（LINE 的 mention），每一位「身分是管理員而且在群組裡」的人都會被 tag 到；預覽時只顯示 @名字。
例：如果有誤判，請協助告知管理員{管理員名稱}`),
      ],
    },
    {
      key: 'command:正式整理群組', title: '指令「正式整理群組」',
      trigger: '管理員在群組 tag 小判官說「正式整理群組」時，依序回覆下面這幾則（純文字）。私訊小判官說同一句話可以先預覽。',
      blocks: [
        block('白名單', `【示範版說明｜第 1 則】公布這次背書成功、留下來的人。

{白名單} 是待移除名單上被標成「移除」（＝保留）並儲存的人。他們會記進白名單，下一次整理自動跳過一次（保護期），再下一次還是沒發話就會進「不得背書名單」。
例：以下為背書留下名單：
{白名單}`),
        block('再見訊息', `【示範版說明｜第 2 則】送給這次被移出的人的話。管理員在 LINE 上實際把人移出群組；已經接上 LINE 帳號的人被移出時，小判官會收到 memberLeft 事件，自動把他標成「已離開」。

沒接上帳號的人（匯入的資料）小判官認不出是誰，所以待移除名單頁有「全部設為已離開」可以補標。
例：如有突發揪團需求，歡迎聯繫管理員{管理員名稱}`),
      ],
    },
    {
      key: 'command:整理完畢', title: '指令「整理完畢」',
      trigger: '管理員在群組 tag 小判官說「整理完畢」時，依序回覆下面這幾則（純文字）。私訊小判官說同一句話可以先預覽。',
      blocks: [
        block('廣告須知', `【示範版說明】整理結束後的固定公告，例如開放 24 小時打廣告、其他社群的連結。

這一區沒有用到任何變數，原樣發出。

新增一個指令不用改程式：在資料庫的 messages 表插入幾列 kind = command、command = 新指令文字，這個頁籤就會多出一區、小判官就聽得懂。

把某一則清成空白，那一則就不會發出去（一次回覆最多 5 則，是 LINE 的限制）。`),
      ],
    },
  ];
}

// ── 成員 ──────────────────────────────────────────────────

/**
 * 每一位虛構成員。時間用「離今天幾天」或「離統計區間開始前幾天」來寫，
 * 每次打開都是相對於今天，不會過期。
 *
 *   counts   統計區間兩個月各說了幾則
 *   speak    最後發話：數字是幾天前；'join' 是加入之後沒說過話
 */
function people(at) {
  const { ago, beforeStart } = at;
  return [
    { id: 1, name: '示範使用者', line: true, role: 2, status: 'joined', join: ago(210), speak: ago(4), counts: [3, 5] },
    { id: 2, name: '貓頭鷹店長', line: true, role: 1, email: 'owl.admin@example.com', status: 'joined', join: ago(500), speak: ago(0), counts: [41, 52] },
    { id: 3, name: 'Momo', line: true, role: 1, email: 'momo.admin@example.com', status: 'joined', join: ago(430), speak: ago(1), counts: [12, 9] },
    { id: 4, name: '小魚', line: true, status: 'joined', join: ago(300), speak: ago(2), counts: [8, 3] },
    { id: 5, name: 'Zed 跟車中', line: true, status: 'joined', join: ago(380), speak: beforeStart(40), counts: [0, 0] },
    { id: 6, name: '13579', line: true, status: 'joined', join: ago(520), speak: beforeStart(130), counts: [0, 0], priorWhitelist: beforeStart(30) },
    { id: 7, name: '*雲朵*', line: true, status: 'joined', join: ago(260), speak: beforeStart(12), counts: [0, 0] },
    { id: 8, name: '王小明（匯入）', line: false, status: 'joined', join: null, speak: beforeStart(90), counts: [0, 0] },
    { id: 9, name: 'Bob', line: true, status: 'joined', join: ago(150), speak: ago(35), counts: [2, 0] },
    { id: 10, name: '推理控', line: true, status: 'joined', join: ago(30), speak: 'join', counts: [0, 0] },
    { id: 11, name: '榮譽席老鳥', line: true, status: 'joined', join: ago(800), speak: beforeStart(200), counts: [0, 0], exempt: true },
    { id: 12, name: '阿德', line: true, status: 'leaved', join: ago(400), speak: ago(70), counts: [1, 0], leave: ago(20) },
    { id: 13, name: '黑名單示範帳號', line: true, status: 'banned', join: ago(600), speak: ago(330), counts: [0, 0], leave: ago(300) },
    { id: 14, name: '雨天', line: true, status: 'joined', join: ago(400), speak: ago(9), counts: [0, 4], leave: ago(50) },
    { id: 15, name: '夜貓子', line: true, status: 'joined', join: ago(240), speak: ago(1), counts: [0, 0] },
    { id: 16, name: '-乙-', line: true, status: 'joined', join: ago(330), speak: beforeStart(25), counts: [0, 0] },
    { id: 17, name: '話很少的小華', line: true, status: 'joined', join: ago(200), speak: ago(55), counts: [1, 0] },
    { id: 18, name: 'Cindy', line: true, status: 'joined', join: ago(350), speak: beforeStart(70), counts: [0, 0], protectedAt: ago(28) },
    { id: 19, name: '小明 Ming', line: true, status: 'joined', join: ago(18), speak: ago(3), counts: [0, 2] },
    { id: 20, name: '鹹酥雞', line: true, status: 'joined', join: ago(270), speak: ago(6), counts: [6, 2] },
    { id: 21, name: '2468', line: true, status: 'joined', join: ago(190), speak: ago(15), counts: [1, 1] },
    { id: 22, name: '丁丁', line: true, status: 'joined', join: ago(160), speak: ago(11), counts: [0, 2] },
    { id: 23, name: '陳二', line: true, status: 'joined', join: ago(310), speak: beforeStart(20), counts: [0, 0] },
    { id: 24, name: 'Xavier', line: true, status: 'joined', join: ago(290), speak: beforeStart(45), counts: [0, 0] },
    { id: 25, name: '林小檔（匯入）', line: false, status: 'joined', join: null, speak: ago(40), counts: [3, 0] },
    { id: 26, name: 'bob 的分身', line: true, status: 'joined', join: ago(120), speak: ago(8), counts: [2, 1] },
    { id: 27, name: '丸子', line: true, status: 'leaved', join: ago(330), speak: ago(100), counts: [0, 0], leave: ago(5) },
  ];
}

/** 這一頁的全部假資料。每次載入頁面建立一份新的。 */
export function createStore(now = new Date()) {
  const period = makePeriod(now);
  const iso = (date) => (date ? new Date(date).toISOString() : null);
  const [y, m, d] = plainDate(now).split('-').map(Number);
  const today = midnight(y, m, d);
  const at = {
    // 落在當天晚上 8 點半（台灣時間），看起來像真的發話時間；不會比現在還晚。
    ago: (days) => new Date(Math.min(now.getTime(), today.getTime() - days * DAY + 20.5 * 3600000)),
    beforeStart: (days) => new Date(period.start.getTime() - days * DAY + 20.5 * 3600000),
  };

  const members = people(at).map((p) => ({
    id: p.id,
    name: p.name,
    has_line_id: p.line,
    email: p.email ?? null,
    role: p.role ?? 2,
    status: p.status,
    join_at: iso(p.join),
    last_speak: iso(p.speak === 'join' ? p.join : p.speak),
    last_leave: iso(p.leave),
    exempt: Boolean(p.exempt),
    // 下面這些不會原樣給前端，是拿來算名單、對照用的。
    counts: p.counts,
    prior_whitelist_at: iso(p.priorWhitelist),
    protected_at: iso(p.protectedAt),
  }));

  return {
    now,
    period,
    members,
    rules: { id: 1, name: '版規', content: RULES, updated_at: iso(at.ago(12)) },
    extraRules: { id: 2, name: '群組額外規範', content: EXTRA_RULES, updated_at: iso(at.ago(12)) },
    messageGroups: messageGroups(),
    // 這個月已經存過一次名單（兩天前），所以「未知發話」可以指認、「全部設為已離開」按得下去。
    saved: {
      clean_at: iso(at.ago(2)),
      kick_ids: [5, 6, 7, 8, 15, 16, 17],
      spare_ids: [23, 24],
      manual_ids: new Set([17]),
      identified_ids: new Set([23]),
    },
    unknown: [
      { id: 'demo-m1', at: iso(at.beforeStart(-12)), kind: 'text', preview: '請問週六下午那團還有位子嗎？', user_id: null },
      { id: 'demo-m2', at: iso(at.beforeStart(-19)), kind: 'sticker', preview: null, user_id: null },
      { id: 'demo-m3', at: iso(at.beforeStart(-26)), kind: 'text', preview: '+1 我也想跟', user_id: 23 },
      { id: 'demo-m4', at: iso(at.beforeStart(-33)), kind: 'image', preview: null, user_id: null },
      { id: 'demo-m5', at: iso(at.beforeStart(-41)), kind: 'text', preview: '謝謝今天的主持人～下次再約', user_id: null },
      { id: 'demo-m6', at: iso(at.beforeStart(-50)), kind: 'file', preview: '十一月場次表.pdf', user_id: null },
    ],
    unknownLater: 2,
    group: { name: '示範劇本殺揪團群', count: 31, checked_at: iso(at.ago(3)) },
    database: { hours: 46.5, quota_hours: 400, saving_after_hours: 320, saving: false },
    // 「讀取成員資料」第一次按會有一個改名、一個 LINE 查無此人，展示確認流程；之後就都沒變。
    refreshSurprises: { renamed: { id: 4, name: '小魚🐟' }, missing: [7] },
    prune: { removed: 48, left: 132 },
  };
}
