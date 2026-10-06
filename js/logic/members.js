/**
 * 成員：資料、修改、以及「讀取成員資料」整個流程。兩種版面共用。
 *
 * 這裡決定的是「會發生什麼事」——要先問什麼、送什麼給後端、結果怎麼說。
 * 名單要畫成表格還是卡片，是 desktop/ 與 mobile/ 各自的事。
 */

import { api } from '../api.js';
import { confirmDialog, el, openModal, toast } from '../ui.js';

export const STATUS_LABEL = { joined: '在群組', leaved: '已離開', banned: '黑名單' };
export const STATUS_TONE = { joined: 'ok', leaved: 'neutral', banned: 'danger' };
export const ROLE_LABEL = { 1: '管理員', 2: '一般成員' };
export const ADMIN = 1;

// 成員清單在這一頁的生命週期裡留一份：「待移除名單」的新增、「成員」頁籤都要用，
// 沒有必要各抓一次。會變動它的事（改成員、讀取成員資料）發生時就整份重抓。
let cache = null;
let generation = 0;

/** { members, overview, me }。force 是 true 就不用留著的那一份。 */
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
 * 改一個成員。changes 是 { role?, status?, email? }。
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
  const updated = await api.put(`/api/members/${member.id}`, changes);
  if (cache) {
    cache = { ...cache, members: cache.members.map((m) => (m.id === updated.id ? updated : m)) };
  }
  return updated;
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
    body: '會刪掉半年以前的發話紀錄（誰在哪一天說了幾則），刪了就拿不回來。成員資料、每個月存的名單與白名單不受影響；每個人最後一次發話的那一筆也會留著。',
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
    (!key || (m.name || '').toLowerCase().includes(key) || (m.email || '').toLowerCase().includes(key)));
}
