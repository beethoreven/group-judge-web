/**
 * 成員：資料、修改、以及「讀取成員資料」整個流程。兩種版面共用。
 *
 * 這裡決定的是「會發生什麼事」——要先問什麼、送什麼給後端、結果怎麼說。
 * 名單要畫成表格還是卡片，是 desktop/ 與 mobile/ 各自的事。
 */

import { api } from '../api.js';
import { confirmDialog, el, emptyState, openModal, toast } from '../ui.js';

export const STATUS_LABEL = { joined: '在群組', leaved: '已離開', banned: '黑名單' };
export const STATUS_TONE = { joined: 'ok', leaved: 'neutral', banned: 'danger' };
export const ROLE_LABEL = { 1: '管理員', 2: '一般成員' };
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
    el('strong', {}, '名單裡還沒有對應到你的那一筆。'),
    '你是用「第一位管理員」的 Google 帳號登入的。先在群組裡說一句話，再回到這裡找到你自己，',
    '把身分改成「管理員」——小判官才會聽你在 LINE 上下的指令。email 也填上你登入用的這個帳號，後台就認得哪一筆是你。',
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
  const used = `資料庫這個月估計醒了 ${db.hours} 小時`;
  if (db.quota_hours === null) return `${used}。每一則訊息都立刻寫入。`;
  const quota = `${used}（免費額度一個月 ${db.quota_hours} 小時）`;
  return db.saving
    ? `${quota}，已經退回省電模式：每個人這個月的第一則照樣立刻寫入，之後的先記著、晚一點才補上，下個月自動恢復。誰有沒有發話不受影響。`
    : `${quota}。每一則訊息都立刻寫入；到 ${db.saving_after_hours} 小時會退回省電模式，並私訊通知管理員。`;
}

/** 統計區間結束之後到現在，又收到幾則認不出發話者的訊息——接在說明後面的那一句。 */
export function unknownNote(later) {
  return later ? `統計區間之後到現在另有 ${later} 則。` : '統計區間之後到現在沒有。';
}

/**
 * 改一個成員。changes 是 { role?, status?, email?, exempt? }。
 * exempt 是「不列入整理」：系統不會把他算進待移除名單（榮譽席）。這個月的名單
 * 已經存了、而他在上面的話，後端會一併把他拿掉——這裡負責告訴管理員。
 * 會讓人後悔的改動先問一次；使用者按否就回傳 null，什麼都沒改。
 */
export async function changeMember(member, changes) {
  if (changes.status === 'banned' && member.status !== 'banned') {
    const ok = await confirmDialog({
      title: `把「${member.name || '（沒有名字）'}」列入黑名單？`,
      body: '列入之後，他只要加入群組，小判官就會在群組裡發警告。黑名單不會因為他離開或重新加入而解除，要在這裡手動改回來。',
      confirmText: '列入黑名單',
      cancelText: '取消',
      danger: true,
    });
    if (!ok) return null;
  }
  if (changes.role === ADMIN && member.role !== ADMIN) {
    const ok = await confirmDialog({
      title: `讓「${member.name || '（沒有名字）'}」成為管理員？`,
      body: '管理員可以對小判官下指令、登入這個後台（還要另外填他的 Google 帳號 email），也可以修改其他人的身分。',
      confirmText: '設為管理員',
      cancelText: '取消',
    });
    if (!ok) return null;
  }
  const { dropped_from_list: dropped, ...updated } = await api.put(`/api/members/${member.id}`, changes);
  if (cache) {
    cache = { ...cache, members: cache.members.map((m) => (m.id === updated.id ? updated : m)) };
  }
  if (dropped) toast(`「${updated.name || '（沒有名字）'}」原本在這個月存好的移除名單上，已經一併拿掉`);
  return updated;
}

/** 沒有 LINE 帳號的那幾筆是怎麼回事——兩種版面的標記共用這一句。 */
export const NO_LINE_HINT =
  '匯入或手動建立的資料，還沒對應到 LINE 帳號。他第一次說話、或有人在群組裡 tag 他的時候，小判官會用名字自動接上；名字對不上（例如改過名字）的話，他說話之後會多出一筆，用「合併」把兩筆併成一筆。';

/**
 * 把一筆沒有 LINE 帳號的資料，併進同一個人有 LINE 帳號的那一筆。
 *
 * 流程：先挑要併進哪一筆，再確認一次（併了就拆不回來），然後請後端合併。
 * 回傳 true 代表併好了、名單該重新載入；取消就是 false。
 * 併的規則在後端（db/members.py 的 merge），確認框裡講的是結果。
 */
export async function mergeMember(member, members) {
  const target = await pickMergeTarget(member, members.filter((m) => m.has_line_id && m.id !== member.id));
  if (!target) return false;
  const from = member.name || '（沒有名字）';
  const into = target.name || '（沒有名字）';
  const ok = await confirmDialog({
    title: `把「${from}」併進「${into}」？`,
    body: `合併之後只會留下「${into}」這一筆：加入時間用「${from}」的（如果「${into}」沒有），每個月的發話則數加在一起，白名單與歷次名單上的紀錄也會改掛過去。「${from}」這一筆會消失，沒辦法復原。`,
    confirmText: '合併',
    cancelText: '取消',
    danger: true,
  });
  if (!ok) return false;
  await api.post(`/api/members/${member.id}/merge`, { into: target.id });
  forgetMembers();
  toast(`已把「${from}」併進「${into}」`);
  return true;
}

/** 挑人的清單一次最多列幾位。群組有幾百人，全部畫出來沒有人會往下找，用搜尋比較快。 */
const MERGE_CHOICES = 60;

/** 挑要併進哪一筆：只列有 LINE 帳號的成員。回傳 Promise<成員 | null>。 */
function pickMergeTarget(member, candidates) {
  const { done } = openModal((close) => {
    const list = el('div', { class: 'choices' });
    const render = (keyword) => {
      const key = keyword.trim().toLowerCase();
      const shown = candidates.filter((m) => !key || matchesName(m, key));
      if (!shown.length) {
        list.replaceChildren(emptyState(candidates.length ? '找不到符合的人。' : '還沒有任何一筆有 LINE 帳號的成員。'));
        return;
      }
      const items = shown.slice(0, MERGE_CHOICES).map((m) => el('button', { class: 'choices__item', type: 'button', onClick: () => close(m) }, [
        el('span', { class: 'choices__name' }, m.name || '（沒有名字）'),
        el('span', { class: 'muted' }, STATUS_LABEL[m.status]),
      ]));
      if (shown.length > MERGE_CHOICES) {
        items.push(el('p', { class: 'muted' }, `還有 ${shown.length - MERGE_CHOICES} 位沒列出來，用上面的搜尋找。`));
      }
      list.replaceChildren(...items);
    };
    render('');
    return el('div', {}, [
      el('div', { class: 'modal__body' }, [
        el('p', {}, `「${member.name || '（沒有名字）'}」其實是下面的哪一位？選他現在在 LINE 上的那一筆。`),
        el('input', {
          class: 'field', type: 'search', placeholder: '搜尋現在的名字', 'aria-label': '搜尋現在的名字',
          onInput: (event) => render(event.target.value),
        }),
        list,
      ]),
      el('div', { class: 'modal__actions' },
        el('button', { class: 'btn btn--ghost', type: 'button', onClick: () => close(null) }, '取消')),
    ]);
  }, { title: '合併成員資料', wide: true });
  return done.then((picked) => picked ?? null);
}

/**
 * 「讀取成員資料」：請後端向 LINE 確認每個人現在的名字。
 *
 * LINE 說查無此人的，不會自動標成離開——列出來問管理員（案主 2026-10-06：
 * 怕是 LINE 出錯）。回傳 true 代表資料有可能變了，畫面該重新載入。
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

  const said = [`已向 LINE 確認 ${result.checked} 人`];
  said.push(result.renamed.length ? `更新了 ${result.renamed.length} 個名字` : '名字都沒有變');
  if (marked) said.push(`${marked} 人標記為已離開`);
  if (result.failed) said.push(`另有 ${result.failed} 人這次沒查到（LINE 沒有回應，晚點再試）`);
  toast(said.join('，'), { error: result.failed > 0, duration: 6000 });
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
      confirm.textContent = `是，標記 ${checked.size} 人`;
      confirm.disabled = checked.size === 0;
    };
    sync();
    return el('div', {}, [
      el('div', { class: 'modal__body' }, [
        el('p', {}, '可能是他們離開群組時小判官剛好沒收到通知，也可能只是 LINE 一時出錯。'),
        el('p', {}, '要把勾選的人標記成「已離開」嗎？之後發現標錯，可以到「成員」頁籤改回來。'),
        el('div', { class: 'checklist' }, missing.map((m) => el('label', { class: 'checklist__item' }, [
          el('input', {
            type: 'checkbox', checked: true,
            onChange: (event) => {
              if (event.target.checked) checked.add(m.id);
              else checked.delete(m.id);
              sync();
            },
          }),
          el('span', {}, m.name || '（沒有名字）'),
        ]))),
      ]),
      el('div', { class: 'modal__actions' }, [
        el('button', { class: 'btn btn--ghost', type: 'button', onClick: () => close([]) }, '否，先不要'),
        confirm,
      ]),
    ]);
  }, { title: `LINE 說這 ${missing.length} 位已經不在群組裡` });
  return done.then((ids) => ids ?? []);
}

/**
 * 「清除半年以前的紀錄」（案主 2026-10-06）：先問一次，再請後端刪。
 * 只刪發話紀錄，成員、名單、白名單都不動。
 */
export async function pruneOldRecords() {
  const ok = await confirmDialog({
    title: '清除半年以前的紀錄？',
    body: '會刪掉半年以前的發話紀錄（誰在哪個月說了幾則），刪了就拿不回來。成員資料、每個月存的名單與白名單不受影響；每個人最後一次發話的那一筆也會留著。',
    confirmText: '清除',
    cancelText: '取消',
    danger: true,
  });
  if (!ok) return;
  const result = await api.post('/api/records/prune');
  toast(result.removed
    ? `已清除 ${result.removed} 筆，還留著 ${result.left} 筆`
    : `沒有半年以前的紀錄（目前共 ${result.left} 筆）`);
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
  return `${fmtDate(member.last_leave)} 離開過，30 天內又回來，加入時間不重設`;
}

/**
 * 這個人最後一次發話是哪一天。
 *
 * ★ 加入之後還沒說過話的人，後端記的「沉默起點」就是加入時間——那不是一次
 *   發話，不能照樣顯示成日期。兩個時間一樣就是還沒說過話。
 */
export function lastSpoke(member, fmtDate) {
  if (!member.last_speak) return '—';
  if (member.join_at && member.last_speak === member.join_at) return '還沒說過話';
  return fmtDate(member.last_speak);
}

/** 依關鍵字與狀態篩選。兩種版面的搜尋框共用同一套規則。 */
export function filterMembers(members, { keyword = '', status = '' } = {}) {
  const key = keyword.trim().toLowerCase();
  return members.filter((m) =>
    (!status || m.status === status) &&
    (!key || matchesName(m, key) || (m.email || '').toLowerCase().includes(key)));
}

/**
 * 名字有沒有包含這個關鍵字（key 要先轉小寫）。另一個名字也算：LINE 讓人對不同群組
 * 顯示不同的名字，管理員在群組裡看到的可能是 alt_name 那一個。
 */
export function matchesName(member, key) {
  return (member.name || '').toLowerCase().includes(key) || (member.alt_name || '').toLowerCase().includes(key);
}

/** 「又名 …」。沒有另一個名字就是 null。 */
export function akaText(member) {
  return member.alt_name ? `又名 ${member.alt_name}` : null;
}
