// 自動產生（demo-en/tools/build.py），來源是 js/logic/members.js。不要手改：改 demo-en/tools/translations.py 再重跑。
/**
 * 成員：資料、修改、以及「讀取成員資料」整個流程。兩種版面共用。
 *
 * 這裡決定的是「會發生什麼事」——要先問什麼、送什麼給後端、結果怎麼說。
 * 名單要畫成表格還是卡片，是 desktop/ 與 mobile/ 各自的事。
 */

import { api } from '../api.js';
import { confirmDialog, el, emptyState, openModal, toast } from '../ui.js';

// 在不在群組（status）與黑名單（banned）是兩件事（2026-11-10 拆開）：黑名單的人
// 也照實記著他在不在群組。畫面上黑名單照舊排最後、整列黑底，不管他在不在群組。
export const STATUS_LABEL = { joined: 'In group', leaved: 'Left' };
export const STATUS_TONE = { joined: 'ok', leaved: 'neutral' };

/** 狀態篩選的選項：在不在群組兩種，加上黑名單。 */
export const STATUS_FILTERS = [...Object.entries(STATUS_LABEL), ['banned', 'Banned']];

/** 一列（一張卡片）的底色：黑名單優先，其次是已離開（見 css/desktop.css、mobile.css）。 */
export function memberTone(member) {
  if (member.banned) return 'is-banned';
  return member.status === 'leaved' ? 'is-left' : '';
}
export const ROLE_LABEL = { 1: 'Admin', 2: 'Member' };
export const ADMIN = 1;

// 成員清單在這一頁的生命週期裡留一份：「待移除名單」的新增、「成員」頁籤都要用，
// 沒有必要各抓一次。會變動它的事（改成員、讀取成員資料）發生時就整份重抓。
let cache = null;
let generation = 0;

/**
 * { members, overview, me }。force 是 true 就不用留著的那一份。
 * me 是登入的人在名單裡的那一筆的 id；還沒有對應的一筆時是 null。
 */
export async function loadMembers({ force = false } = {}) {
  if (cache && !force) return cache;
  const mine = ++generation;
  const data = await api.get('/api/members');
  // 等待期間有更新的一次請求發出去了，就以那一次為準。
  if (mine === generation) cache = data;
  return data;
}

export function forgetMembers() {
  generation += 1;
  cache = null;
}

/**
 * 登入的人在成員名單裡還沒有對應的那一筆（後端回的 me 是 null）時，要給他看的提示。
 * 沒這回事就回 null。
 *
 * 只有「第一位管理員」會遇到：他是靠後端設定的 email 進來的，不是靠成員資料。
 * 這時小判官在 LINE 上還不認得他是管理員——那要看他在群組裡那一筆的身分。
 */
export function notLinkedNotice(data) {
  if (data.me !== null) return null;
  return el('div', { class: 'notice' }, [
    el('strong', {}, 'You are not matched to anyone on the list yet.'),
    'You signed in with the “first admin” Google account. Say something in the group, then come back here, find yourself, ',
    'and set your role to “Admin” — only then does Group Judge obey your commands in LINE. Also fill in this sign-in email so the dashboard knows which row is you.',
  ]);
}

/**
 * 資料庫用量那一句：這個月估計醒了多久，以及現在是不是省電模式。
 *
 * 免費的資料庫一個月能醒著的時數有上限，用完會停擺到下個月。所以後端自己看著
 * 用量：平常每一則訊息都立刻寫入，到了門檻就退回省電模式並私訊管理員（後端
 * db/meter.py）。這裡只負責把狀況講清楚。db.saving 是 true 就是省電模式。
 */
export function databaseNote(db) {
  if (!db) return null;
  const used = `The database has been awake for about ${db.hours} hours this month`;
  if (db.quota_hours === null) return `${used}. Every message is written immediately.`;
  const quota = `${used} (free quota: ${db.quota_hours} hours a month)`;
  return db.saving
    ? `${quota}, and it has dropped to power-saving mode: each person’s first message this month is still written immediately, later ones are buffered and written afterwards, and normal mode returns next month. Who spoke and who didn’t is unaffected.`
    : `${quota}. Every message is written immediately; at ${db.saving_after_hours} hours it drops to power-saving mode and messages the admins.`;
}

/** 統計區間結束之後到現在，又收到幾則認不出發話者的訊息——接在說明後面的那一句。 */
export function unknownNote(later) {
  return later ? `${later} more have arrived since the review period ended.` : 'None since the review period ended.';
}

/**
 * 改一個成員。changes 是 { role?, status?, email?, exempt?, banned? }。
 * exempt 是「不列入整理」：系統不會把他算進待移除名單（榮譽席）。這個月的名單
 * 已經存了、而他在上面的話，後端會一併把他拿掉——這裡負責告訴管理員。
 * 會讓人後悔的改動先問一次；使用者按否就回傳 null，什麼都沒改。
 */
export async function changeMember(member, changes) {
  if (changes.banned === true && !member.banned) {
    const ok = await confirmDialog({
      title: `Ban “${member.name || '(no name)'}”?`,
      body: 'Once banned, Group Judge posts a warning whenever they join the group. Leaving or rejoining does not lift the ban — only unticking it here does.',
      confirmText: 'Ban',
      cancelText: 'Cancel',
      danger: true,
    });
    if (!ok) return null;
  }
  if (changes.role === ADMIN && member.role !== ADMIN) {
    const ok = await confirmDialog({
      title: `Make “${member.name || '(no name)'}” an admin?`,
      body: 'Admins can give Group Judge commands, sign in to this dashboard (their Google email must also be filled in), and change other people’s roles.',
      confirmText: 'Make admin',
      cancelText: 'Cancel',
    });
    if (!ok) return null;
  }
  const { dropped_from_list: dropped, ...updated } = await api.put(`/api/members/${member.id}`, changes);
  if (cache) {
    cache = { ...cache, members: cache.members.map((m) => (m.id === updated.id ? updated : m)) };
  }
  if (dropped) toast(`“${updated.name || '(no name)'}” was on this month’s saved removal list and has been taken off`);
  return updated;
}

/** 沒有 LINE 帳號的那幾筆是怎麼回事——兩種版面的標記共用這一句。 */
export const NO_LINE_HINT =
  'Imported or manually created, not yet linked to a LINE account. When they first speak, or someone tags them in the group, Group Judge links them by name. If the name doesn’t match (say they renamed), a second row appears after they speak — use “Merge” to combine the two.';

/**
 * 同一個人有兩筆的時候合成一筆：留下 member（沒有 LINE 帳號、匯入的那一筆——加入時間
 * 與算好的發話紀錄都在上面），把另一筆的 LINE 帳號、名字與這段期間的則數接過來，
 * 另一筆刪掉。
 *
 * 流程：先挑是哪一筆有 LINE 帳號的，再確認一次（合了就拆不回來），然後請後端合併。
 * 回傳 true 代表合好了、名單該重新載入；取消就是 false。
 * 合的規則在後端（db/members.py 的 merge），確認框裡講的是結果。
 */
export async function mergeMember(member, members) {
  const other = await pickMergeTarget(member, members.filter((m) => m.has_line_id && m.id !== member.id));
  if (!other) return false;
  const kept = member.name || '(no name)';
  const line = other.name || '(no name)';
  const ok = await confirmDialog({
    title: `Merge “${kept}” and “${line}” into one?`,
    body: `The “${kept}” row is kept: its join date and message history stay, it takes over the LINE account of “${line}”, its name becomes “${line}” as shown in LINE, and both rows’ monthly message counts are added together. The “${line}” row disappears, and this cannot be undone.`,
    confirmText: 'Merge',
    cancelText: 'Cancel',
    danger: true,
  });
  if (!ok) return false;
  await api.post(`/api/members/${member.id}/merge`, { with: other.id });
  forgetMembers();
  toast(`Merged: “${kept}” is now linked to LINE as “${line}”`);
  return true;
}

/** 挑人的清單一次最多列幾位。群組有幾百人，全部畫出來沒有人會往下找，用搜尋比較快。 */
const MERGE_CHOICES = 60;

/** 挑他有 LINE 帳號的是哪一筆：只列有 LINE 帳號的成員。回傳 Promise<成員 | null>。 */
function pickMergeTarget(member, candidates) {
  const { done } = openModal((close) => {
    const list = el('div', { class: 'choices' });
    const render = (keyword) => {
      const key = keyword.trim().toLowerCase();
      const shown = candidates.filter((m) => !key || (m.name || '').toLowerCase().includes(key));
      if (!shown.length) {
        list.replaceChildren(emptyState(candidates.length ? 'No one matches.' : 'No member has a LINE account yet.'));
        return;
      }
      const items = shown.slice(0, MERGE_CHOICES).map((m) => el('button', { class: 'choices__item', type: 'button', onClick: () => close(m) }, [
        el('span', { class: 'choices__name' }, m.name || '(no name)'),
        el('span', { class: 'muted' }, STATUS_LABEL[m.status]),
      ]));
      if (shown.length > MERGE_CHOICES) {
        items.push(el('p', { class: 'muted' }, `${shown.length - MERGE_CHOICES} more not shown — use the search above.`));
      }
      list.replaceChildren(...items);
    };
    render('');
    return el('div', {}, [
      el('div', { class: 'modal__body' }, [
        el('p', {}, `Which of these is really “${member.name || '(no name)'}”? Pick their current LINE row.`),
        el('input', {
          class: 'field', type: 'search', placeholder: 'Search current name', 'aria-label': 'Search current name',
          onInput: (event) => render(event.target.value),
        }),
        list,
      ]),
      el('div', { class: 'modal__actions' },
        el('button', { class: 'btn btn--ghost', type: 'button', onClick: () => close(null) }, 'Cancel')),
    ]);
  }, { title: 'Merge members', wide: true });
  return done.then((picked) => picked ?? null);
}

/**
 * 「讀取成員資料」：請後端向 LINE 確認每個人現在的名字。
 *
 * LINE 說查無此人的，不會自動標成離開——列出來問管理員
 * （怕是 LINE 出錯）。回傳 true 代表資料有可能變了，畫面該重新載入。
 */
export async function refreshFromLine() {
  const result = await api.post('/api/members/refresh');
  forgetMembers();

  let marked = 0;
  if (result.missing.length) {
    const ids = await askMarkLeft(result.missing);
    if (ids.length) {
      marked = (await api.post('/api/members/mark-left', { ids })).marked;
      forgetMembers();
    }
  }

  const said = [`Checked ${result.checked} people with LINE`];
  said.push(result.renamed.length ? `updated ${result.renamed.length} name(s)` : 'no names changed');
  if (marked) said.push(`${marked} marked as left`);
  if (result.failed) said.push(`${result.failed} could not be checked (LINE did not respond — try again later)`);
  toast(said.join(', '), { error: result.failed > 0, duration: 6000 });
  return true;
}

/** 問管理員：這些查無此人的，哪幾個要標成已離開。回傳要標的 id（按否就是空的）。 */
function askMarkLeft(missing) {
  const checked = new Set(missing.map((m) => m.id));
  const { done } = openModal((close) => {
    const confirm = el('button', {
      class: 'btn btn--primary', type: 'button', onClick: () => close([...checked]),
    });
    const sync = () => {
      confirm.textContent = `Yes, mark ${checked.size}`;
      confirm.disabled = checked.size === 0;
    };
    sync();
    return el('div', {}, [
      el('div', { class: 'modal__body' }, [
        el('p', {}, 'Maybe Group Judge missed the notice when they left, or LINE just had a hiccup.'),
        el('p', {}, 'Mark the checked people as “Left”? If that turns out wrong, change it back on the Members tab.'),
        el('div', { class: 'checklist' }, missing.map((m) => el('label', { class: 'checklist__item' }, [
          el('input', {
            type: 'checkbox', checked: true,
            onChange: (event) => {
              if (event.target.checked) checked.add(m.id);
              else checked.delete(m.id);
              sync();
            },
          }),
          el('span', {}, m.name || '(no name)'),
        ]))),
      ]),
      el('div', { class: 'modal__actions' }, [
        el('button', { class: 'btn btn--ghost', type: 'button', onClick: () => close([]) }, 'No, not now'),
        confirm,
      ]),
    ]);
  }, { title: `LINE says these ${missing.length} are no longer in the group` });
  return done.then((ids) => ids ?? []);
}

/**
 * 「清除半年以前的紀錄」：先問一次，再請後端刪。
 * 只刪發話紀錄，成員、名單、白名單都不動。
 */
export async function pruneOldRecords() {
  const ok = await confirmDialog({
    title: 'Clear records older than six months?',
    body: 'This deletes message records (who said how much in which month) older than six months, permanently. Members, saved monthly lists and whitelists are untouched, and each person’s latest record is kept.',
    confirmText: 'Clear',
    cancelText: 'Cancel',
    danger: true,
  });
  if (!ok) return;
  const result = await api.post('/api/records/prune');
  toast(result.removed
    ? `Cleared ${result.removed} records; ${result.left} remain`
    : `Nothing older than six months (${result.left} records in total)`);
}

/**
 * 「離開過又回來」的註記，沒這回事就回 null。
 *
 * 離開不到 30 天又回來的人，後端視為沒離開過，加入時間不重設——所以會出現
 * 「加入時間很早，卻最近才看到他加入」的情況，這裡把原因標出來。看得出來的
 * 依據是：上次離開的時間比加入時間還晚（或根本沒有加入時間）。
 */
export function leftBriefly(member, fmtDate) {
  if (!member.last_leave || member.status === 'leaved') return null;
  if (member.join_at && member.last_leave <= member.join_at) return null;
  return `Left on ${fmtDate(member.last_leave)} and came back within 30 days, so the join date was not reset`;
}

/**
 * 這個人最後一次發話是哪一天。
 *
 * ★ 加入之後還沒說過話的人，後端記的「沉默起點」就是加入時間——那不是一次
 *   發話，不能照樣顯示成日期。兩個時間一樣就是還沒說過話。
 */
export function lastSpoke(member, fmtDate) {
  if (!member.last_speak) return '—';
  if (member.join_at && member.last_speak === member.join_at) return 'Never spoke';
  return fmtDate(member.last_speak);
}

/** 依關鍵字與狀態篩選。兩種版面的搜尋框共用同一套規則。 */
export function filterMembers(members, { keyword = '', status = '', order = 'name' } = {}) {
  const key = keyword.trim().toLowerCase();
  const shown = members.filter((m) =>
    (!status || (status === 'banned' ? m.banned : m.status === status)) &&
    (!key || (m.name || '').toLowerCase().includes(key) || (m.email || '').toLowerCase().includes(key)));
  // 照 ID：新建的資料排在最後。剛換過來、有人改名接不上帳號時，用來找多出來的那一筆。
  // 預設還是後端給的順序（狀態 → 身分 → 名字）。
  return order === 'id' ? [...shown].sort((a, b) => a.id - b.id) : shown;
}

/** 成員清單的排序方式。第一個是預設。 */
export const MEMBER_ORDERS = [
  { value: 'name', label: 'By name' },
  { value: 'id', label: 'By ID' },
];
