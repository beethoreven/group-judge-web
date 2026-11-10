/**
 * 英文示範版的假資料（手寫，不是 build.py 產生的）。結構跟中文示範版的 demo/data.js
 * 一模一樣，內容換成英文：名字、版規與訊息的功能說明、變數名稱。
 *
 * 只活在這一頁的記憶體裡——按了「Save」、改了成員，重新整理就還原。
 *
 * ★ 名字全部是虛構的（repo 是公開的，不能出現真實成員）。
 * ★ 這一支的程式碼不能有中文（build.py 會檢查），註解可以。
 *
 * 日期都從「今天」往回推，統計區間的算法跟後端（timeutil.period_for）一樣：
 * 整理當月的前兩個完整月份，例如 11 月整理就看 9/1–10/31。
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
    json: { start: plainDate(start), end: plainDate(end), label: `${short(start)}–${short(end)}` },
  };
}

export const MAX_LENGTH = 5000;

/** 後端 line_utils/render.py 的 VARIABLE_HELP，英文版的變數名稱。 */
export const VARIABLES = [
  { name: '{month}', meaning: 'The current month, e.g. 10' },
  { name: '{start_date}', meaning: 'First day of the review period, e.g. 8/1 (people who joined after this are not reviewed)' },
  { name: '{protected_month}', meaning: 'The month two months ago, e.g. 8 (people kept in that cleanup lose their protection now)' },
  { name: '{period}', meaning: 'The review period, e.g. 8/1–9/30' },
  { name: '{list}', meaning: 'This month’s removal list, one name per line' },
  { name: '{count}', meaning: 'How many people are on the removal list' },
  { name: '{no_endorse_list}', meaning: 'People on the removal list who were kept before and have been silent ever since' },
  { name: '{whitelist}', meaning: 'People taken off the list this month (kept by endorsement)' },
  { name: '{admins}', meaning: '(Command messages) Tags every admin in the group, with a leading space, e.g. “Ask an admin{admins}” becomes “Ask an admin @Owl @Momo”. Previews in a private chat and here only show @name; in the group they are real tags' },
  { name: '{name}', meaning: '(Welcome, ban warning) The current LINE name of the person who just joined' },
  { name: '{recorded_name}', meaning: '(Ban warning) The name they used in the group last time' },
];

// ── 版規與訊息：內容改成「這個欄位是做什麼的」 ─────────────

const RULES = `[Demo note | Rules]

In the real dashboard this box holds the group’s full rules. They are stored in the database’s messages table (kind = rules), and there is exactly one copy for the whole service.

When it is used:
• When anyone in the group sends a message that is just “rules” (no need to tag the bot), Group Judge replies with this text.
• If someone sends the same word in a private chat, only admins get a reply. Regular members get nothing, so the bot doesn’t turn into a help desk.

Why it is edited here:
The rules used to be a pinned announcement — changing one word meant reposting it, and the old version stayed in the chat history. Now an admin presses “Edit”, saves, and the next person who asks gets the new version. No reposting needed.

Limits:
• A LINE text message holds at most 5,000 characters. The counter under the box updates as you type, and you cannot save over the limit (the backend checks again).
• Replies use LINE’s reply API, which doesn’t count against the push quota, so it costs nothing however often people ask.

Try “Edit” at the top right: saving updates the page, but only in this tab. Reload and it resets — nothing is written to the database.`;

const EXTRA_RULES = `[Demo note | Extra guidelines]

Same mechanism as the rules, with its own text (kind = extra_rules). It holds things that don’t belong in the rules but come up often — for example how to post a game invite, or the rules for partner venues.

• When someone in the group sends “guidelines”, Group Judge replies with this text.
• This box may be left empty: then the bot doesn’t respond at all, which effectively turns the feature off. The grey note below is the reminder for that.
• On save, the backend only checks that it is text and no longer than 5,000 characters. The content is stored as-is, and no variables are replaced when it is sent.`;

/** 訊息頁籤的分區。區塊的 key、標題、觸發說明跟後端 _message_groups 一樣（英文版）。 */
function messageGroups() {
  let id = 100;
  const block = (name, content) => ({ id: ++id, name, content, updated_at: null });
  const commandTrigger = (command) =>
    `When an admin tags Group Judge in the group and says “${command}”, it replies with the messages below in order (plain text). Saying the same thing in a private chat shows a preview first.`;
  return [
    {
      key: 'welcome', title: 'Welcome message', trigger: 'Sent automatically (as a card) when someone joins the group.',
      blocks: [block('Welcome message', `[Demo note] When someone joins the group, LINE sends Group Judge a memberJoined event, and the bot replies with this text as a card.

The same event records the person in the member data: it stores the join time (people who joined after the review period started are not reviewed this time). If they leave and come back within 30 days, the join time is not reset, so leaving and rejoining can’t wipe out a silent record.

Use {name} for their current LINE name.
Example: Welcome {name}! Send “rules” to see the group rules.

Press “Preview” above to see it with the variables filled in.`)],
    },
    {
      key: 'banned', title: 'Ban warning', trigger: 'Sent automatically (as a card) when someone on the ban list joins.',
      blocks: [block('Ban warning', `[Demo note] If the person who joins is marked “Banned” in the member data, Group Judge sends this instead of the welcome message, so the admins notice and act.

The ban is tied to their LINE account, so it still works after a name change: {recorded_name} is the name they used last time, {name} is their name now.
Example: {name}, who just joined, is on the ban list. Last time they went by {recorded_name}.

A ban is not lifted by leaving or rejoining; it has to be changed back by hand on the Members tab.`)],
    },
    {
      key: 'command:removal list', title: 'Command “removal list”', trigger: commandTrigger('removal list'),
      blocks: [
        block('Opening', `[Demo note | Message 1] The first step of a cleanup: announcing that this month’s review is starting.

Why a command instead of a scheduled push? LINE charges pushes by group size, and the free quota runs out after a few. Instead, an admin tags the bot with a command in the group, and the bot sends everything as a reply, which is free.

Available variables: {month} for this month’s cleanup, {start_date} (people who joined after it are not reviewed), and {protected_month} (people kept back then lose their protection).
Example: The {month} cleanup is starting. Anyone who joined after {start_date} is not included.`),
        block('Removal list', `[Demo note | Message 2] Lists who is being removed this month.

{list} becomes the list saved on the Removal List tab, one name per line; {count} is how many people are on it. A command using either variable can only be sent after the list has been saved in the dashboard. Otherwise the bot refuses and messages the admins to save it first, so a list that nobody has checked is never announced.
Example: These {count} people are being removed this month:
{list}`),
        block('No-endorsement list', `[Demo note | Message 3] People who were kept by endorsement before and have still not said anything. They can’t be endorsed again this time.

{no_endorse_list} is calculated by the backend from past whitelists. If there is nobody like that, it becomes “(none)”.
Example: These people can no longer be endorsed:
{no_endorse_list}`),
        block('Heads-up', `[Demo note | Message 4] Says when the cleanup happens, how to ask for an endorsement, and who to contact about mistakes.

In the group, {admins} becomes real LINE mentions that tag every person whose role is Admin and who is in the group. Previews only show @name.
Example: If you think this is a mistake, please tell an admin{admins}`),
      ],
    },
    {
      key: 'command:start cleanup', title: 'Command “start cleanup”', trigger: commandTrigger('start cleanup'),
      blocks: [
        block('Whitelist', `[Demo note | Message 1] Announces who was endorsed and stays.

{whitelist} is everyone on the removal list who was marked “Remove” (meaning kept) and saved. They go on the whitelist and are skipped automatically at the next cleanup (their protection period). If they are still silent the time after that, they land on the no-endorsement list.
Example: These people were endorsed and stay — give them a hug:
{whitelist}`),
        block('Goodbye', `[Demo note | Message 2] A message for the people being removed. Admins remove them by hand in LINE. For people linked to a LINE account, Group Judge receives a memberLeft event and marks them “Left” automatically.

People who aren’t linked (imported rows) can’t be recognized, which is why the Removal List tab has “Mark all as left” to catch them up.
Example: If you ever want to join a game on short notice, contact an admin{admins}`),
      ],
    },
    {
      key: 'command:cleanup done', title: 'Command “cleanup done”', trigger: commandTrigger('cleanup done'),
      blocks: [
        block('Ad rules', `[Demo note] The standing announcement after a cleanup, for example that ads are allowed for the next 24 hours, or links to other communities.

This section uses no variables and is sent as-is.

Adding a new command needs no code change: insert a few rows into the messages table with kind = command and command = the new phrase. This tab gains a section, and the bot understands the command.

Clearing a message makes it not be sent at all. A single reply holds at most 5 messages, which is LINE’s limit.`),
      ],
    },
  ];
}

// ── 成員 ──────────────────────────────────────────────────

/**
 * 每一位虛構成員，跟中文版是同一批人（id 一樣、狀況一樣），只有名字換成英文。
 *
 *   counts   統計區間兩個月各說了幾則
 *   speak    最後發話：數字是幾天前；'join' 是加入之後沒說過話
 */
function people(at) {
  const { ago, beforeStart } = at;
  return [
    { id: 1, name: 'Demo User', line: true, role: 2, status: 'joined', join: ago(210), speak: ago(4), counts: [3, 5] },
    { id: 2, name: 'Owl Keeper', line: true, role: 1, email: 'owl.admin@example.com', status: 'joined', join: ago(500), speak: ago(0), counts: [41, 52] },
    { id: 3, name: 'Momo', line: true, role: 1, email: 'momo.admin@example.com', status: 'joined', join: ago(430), speak: ago(1), counts: [12, 9] },
    { id: 4, name: 'Little Trout', line: true, status: 'joined', join: ago(300), speak: ago(2), counts: [8, 3] },
    { id: 5, name: 'Zed on the road', line: true, status: 'joined', join: ago(380), speak: beforeStart(40), counts: [0, 0] },
    { id: 6, name: '13579', line: true, status: 'joined', join: ago(520), speak: beforeStart(130), counts: [0, 0], priorWhitelist: beforeStart(30) },
    { id: 7, name: '*Cloud*', line: true, status: 'joined', join: ago(260), speak: beforeStart(12), counts: [0, 0] },
    { id: 8, name: 'Wes (imported)', line: false, status: 'joined', join: null, speak: beforeStart(90), counts: [0, 0] },
    { id: 9, name: 'Bob', line: true, status: 'joined', join: ago(150), speak: ago(35), counts: [2, 0] },
    { id: 10, name: 'Mystery Fan', line: true, status: 'joined', join: ago(30), speak: 'join', counts: [0, 0] },
    { id: 11, name: 'Honorary Veteran', line: true, status: 'joined', join: ago(800), speak: beforeStart(200), counts: [0, 0], exempt: true },
    { id: 12, name: 'Arlo', line: true, status: 'leaved', join: ago(400), speak: ago(70), counts: [1, 0], leave: ago(20) },
    { id: 13, name: 'Banned Demo Account', line: true, status: 'leaved', banned: true, join: ago(600), speak: ago(330), counts: [0, 0], leave: ago(300) },
    { id: 14, name: 'Rainy Day', line: true, status: 'joined', join: ago(400), speak: ago(9), counts: [0, 4], leave: ago(50) },
    { id: 15, name: 'Night Owl', line: true, status: 'joined', join: ago(240), speak: ago(1), counts: [0, 0] },
    { id: 16, name: '-Bee-', line: true, status: 'joined', join: ago(330), speak: beforeStart(25), counts: [0, 0] },
    { id: 17, name: 'Quiet Quinn', line: true, status: 'joined', join: ago(200), speak: ago(55), counts: [1, 0] },
    { id: 18, name: 'Cindy', line: true, status: 'joined', join: ago(350), speak: beforeStart(70), counts: [0, 0], protectedAt: ago(28) },
    { id: 19, name: 'Wes M.', line: true, status: 'joined', join: ago(18), speak: ago(3), counts: [0, 2] },
    { id: 20, name: 'Popcorn Chicken', line: true, status: 'joined', join: ago(270), speak: ago(6), counts: [6, 2] },
    { id: 21, name: '2468', line: true, status: 'joined', join: ago(190), speak: ago(15), counts: [1, 1] },
    { id: 22, name: 'Dot', line: true, status: 'joined', join: ago(160), speak: ago(11), counts: [0, 2] },
    { id: 23, name: 'Ellis', line: true, status: 'joined', join: ago(310), speak: beforeStart(20), counts: [0, 0] },
    { id: 24, name: 'Xavier', line: true, status: 'joined', join: ago(290), speak: beforeStart(45), counts: [0, 0] },
    { id: 25, name: 'Linden (imported)', line: false, status: 'joined', join: null, speak: ago(40), counts: [3, 0] },
    { id: 26, name: 'bob’s alt', line: true, status: 'joined', join: ago(120), speak: ago(8), counts: [2, 1] },
    { id: 27, name: 'Dumpling', line: true, status: 'leaved', join: ago(330), speak: ago(100), counts: [0, 0], leave: ago(5) },
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
    banned: Boolean(p.banned),
    // 下面這些不會原樣給前端，是拿來算名單、對照用的。
    counts: p.counts,
    prior_whitelist_at: iso(p.priorWhitelist),
    protected_at: iso(p.protectedAt),
  }));

  return {
    now,
    period,
    members,
    rules: { id: 1, name: 'Rules', content: RULES, updated_at: iso(at.ago(12)) },
    extraRules: { id: 2, name: 'Extra guidelines', content: EXTRA_RULES, updated_at: iso(at.ago(12)) },
    messageGroups: messageGroups(),
    // 這個月已經存過一次名單（兩天前），所以「Unknown Senders」可以指認、「Mark all as left」按得下去。
    saved: {
      clean_at: iso(at.ago(2)),
      kick_ids: [5, 6, 7, 8, 15, 16, 17],
      spare_ids: [23, 24],
      manual_ids: new Set([17]),
      identified_ids: new Set([23]),
    },
    unknown: [
      { id: 'demo-m1', at: iso(at.beforeStart(-12)), kind: 'text', preview: 'Any seats left for Saturday afternoon?', user_id: null },
      { id: 'demo-m2', at: iso(at.beforeStart(-19)), kind: 'sticker', preview: null, user_id: null },
      { id: 'demo-m3', at: iso(at.beforeStart(-26)), kind: 'text', preview: '+1, count me in', user_id: 23 },
      { id: 'demo-m4', at: iso(at.beforeStart(-33)), kind: 'image', preview: null, user_id: null },
      { id: 'demo-m5', at: iso(at.beforeStart(-41)), kind: 'text', preview: 'Thanks to today’s host, see you next time!', user_id: null },
      { id: 'demo-m6', at: iso(at.beforeStart(-50)), kind: 'file', preview: 'november-schedule.pdf', user_id: null },
    ],
    unknownLater: 2,
    group: { name: 'Demo Mystery Game Group', count: 31, checked_at: iso(at.ago(3)) },
    database: { hours: 46.5, quota_hours: 400, saving_after_hours: 320, saving: false },
    // 「Sync from LINE」第一次按會有一個改名、一個 LINE 查無此人，展示確認流程；之後就都沒變。
    refreshSurprises: { renamed: { id: 4, name: 'Little Trout 🐟' }, missing: [7] },
    prune: { removed: 48, left: 132 },
  };
}
