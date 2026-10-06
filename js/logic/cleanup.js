/**
 * 待移除名單：畫面上那份名單的狀態，以及「新增／移除／儲存」各自做什麼。
 * 兩種版面共用——桌面版畫成表格、行動版畫成卡片，但按下去發生的事是同一套。
 *
 * ## 名單上每個人的兩個屬性
 *
 *   source  auto    系統算出來的（整個統計區間都沒說話）
 *           manual  管理員用「新增」加進來的
 *   state   kick    留在名單上，儲存後進 kicked_list
 *           spare   被「移除」標記了（畫面上反白），儲存後不在名單上。
 *                   source 是 auto 的會進白名單；manual 的只是不踢了。
 *
 * ## 選取跟標記是兩件事
 *
 * 點一個人是「選取」。選好之後按「移除」才是把他們標成 spare；再選同一批、
 * 按鈕會變成「取消移除」，可以標回來。按「儲存」之前什麼都還沒寫進資料庫。
 */

import { api } from '../api.js';
import { confirmDialog, el } from '../ui.js';
import { fmtDate, fmtDateTime } from '../format.js';

export function createCleanup() {
  let server = null;
  let rows = [];
  const selected = new Set();
  let touched = false;
  let generation = 0;
  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => fn());

  function adopt(state) {
    server = state;
    rows = state.rows.map((r) => ({ ...r }));
    selected.clear();
    touched = false;
    emit();
  }

  const picked = () => rows.filter((r) => selected.has(r.user_id));

  return {
    /** 狀態變了就會被呼叫。回傳取消訂閱的函式。 */
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    async load() {
      const mine = ++generation;
      const state = await api.get('/api/cleanup');
      // 等待期間又發了一次（例如剛好按了「讀取成員資料」），以後面那次為準。
      if (mine === generation) adopt(state);
    },

    get loaded() { return server !== null; },
    get period() { return server.period; },
    get saved() { return server.saved; },
    get rows() { return rows; },
    /** 上次整理保下來、這次自動略過的人（不在 rows 裡）。 */
    get protectedRows() { return server.protected; },
    /** 不是 null 的話：小判官是這個時間才進群的，統計區間有一段它沒看到。 */
    get blindSince() { return server.blind_since; },
    /** 載入或儲存之後有沒有動過名單。離開頁籤前拿來提醒。 */
    get touched() { return touched; },

    counts() {
      const spare = rows.filter((r) => r.state === 'spare').length;
      return { kick: rows.length - spare, spare, selected: selected.size };
    },

    isSelected: (id) => selected.has(id),
    toggle(id) {
      if (selected.has(id)) selected.delete(id);
      else selected.add(id);
      emit();
    },
    clearSelection() {
      selected.clear();
      emit();
    },

    /** 「移除」鈕現在按下去會做什麼：'mark'、'unmark'；沒選人是 null。 */
    removeMode() {
      const chosen = picked();
      if (!chosen.length) return null;
      return chosen.every((r) => r.state === 'spare') ? 'unmark' : 'mark';
    },

    /**
     * 按下「移除」。
     *
     * ★ 以前被保下來過、之後還是都沒說話的人，要再保一次之前先警告
     *   （案主 2026-10-06）。按否的話那幾位不標記，其他選到的人照常標記。
     */
    async applyRemove() {
      const mode = this.removeMode();
      if (!mode) return;
      const chosen = picked();
      if (mode === 'unmark') {
        chosen.forEach((r) => { r.state = 'kick'; });
      } else {
        const targets = chosen.filter((r) => r.state === 'kick');
        const repeat = targets.filter((r) => r.source === 'auto' && r.prior_whitelist_at);
        const skip = new Set();
        if (repeat.length && !(await confirmRepeat(repeat))) {
          repeat.forEach((r) => skip.add(r.user_id));
        }
        targets.forEach((r) => { if (!skip.has(r.user_id)) r.state = 'spare'; });
      }
      selected.clear();
      touched = true;
      emit();
    },

    /** 可以用「新增」加進名單的人：在群組裡、而且還不在名單上。沉默最久的排前面。 */
    addable(members) {
      const listed = new Set(rows.map((r) => r.user_id));
      return members
        .filter((m) => m.status === 'joined' && !listed.has(m.id))
        .sort((a, b) => (b.silent_days ?? -1) - (a.silent_days ?? -1));
    },

    add(members) {
      if (!members.length) return;
      for (const m of members) {
        rows.push({
          user_id: m.id, name: m.name, status: m.status,
          join_at: m.join_at, last_speak: m.last_speak, silent_days: m.silent_days,
          source: 'manual', state: 'kick', prior_whitelist_at: null, identified: false, late_speak: null,
        });
      }
      touched = true;
      emit();
    },

    /** 存進資料庫。成功之後畫面換成後端回來的最新狀態。 */
    async save() {
      const kick = rows.filter((r) => r.state === 'kick').map((r) => r.user_id);
      const spare = rows
        .filter((r) => r.state === 'spare' && r.source === 'auto')
        .map((r) => r.user_id);
      generation += 1; // 還在路上的 load() 回來時不能蓋掉剛存好的結果
      adopt(await api.post('/api/cleanup', { kick_ids: kick, spare_ids: spare }));
      return { kick: kick.length, spare: spare.length };
    },
  };
}

function confirmRepeat(people) {
  return confirmDialog({
    title: people.length === 1 ? '他之前就被保留過了' : `這 ${people.length} 位之前就被保留過了`,
    body: el('div', {}, [
      el('div', { class: 'checklist' }, people.map((p) => el('div', { class: 'checklist__entry' }, [
        el('strong', {}, p.name || '（沒有名字）'),
        el('div', {},
          `${fmtDate(p.prior_whitelist_at)} 加入過白名單，之後一直沒有發話（已經 ${p.silent_days ?? '—'} 天）`),
      ]))),
      el('p', {}, '確定還要再保留一次嗎？'),
    ]),
    confirmText: '是，再保留一次',
    cancelText: '否',
    danger: true,
  });
}

/** 名單上一個人要顯示哪些備註。兩種版面共用同一套說法。 */
export function rowNotes(row) {
  const notes = [];
  if (row.state === 'spare' && row.identified) {
    notes.push({ text: '已指認發話・白名單', tone: 'ink', title: '在「未知發話」頁籤指認了一則他發的訊息' });
  } else if (row.state === 'spare') {
    notes.push({ text: row.source === 'auto' ? '將移出名單・列入白名單' : '將移出名單', tone: 'ink' });
  }
  if (row.late_speak && row.state === 'kick') {
    notes.push({
      text: `${fmtDate(row.late_speak)} 才發話`, tone: 'warn',
      title: '他在統計區間結束之後才說話，已經來不及，所以還是在名單上',
    });
  }
  if (row.source === 'manual') notes.push({ text: '手動新增', tone: 'neutral' });
  if (row.prior_whitelist_at) {
    notes.push({
      text: `${fmtDate(row.prior_whitelist_at)} 保留過`, tone: 'warn',
      title: '之前被加入過白名單，之後一直沒有發話',
    });
  }
  if (row.status === 'leaved') notes.push({ text: '已離開群組', tone: 'neutral' });
  if (row.status === 'banned') notes.push({ text: '黑名單', tone: 'danger' });
  return notes;
}

/** 名單上方那句「存了沒」。 */
export function savedSummary(model) {
  if (model.touched) {
    return { text: '有還沒儲存的變更', tone: 'warn' };
  }
  if (model.saved) {
    return { text: `已於 ${fmtDateTime(model.saved.clean_at)} 儲存`, tone: 'ok' };
  }
  return { text: '這個月還沒儲存（下面是系統現在算出來的名單）', tone: 'neutral' };
}

/** 小判官比統計區間晚進群時，名單上方要顯示的提醒；不用提醒就是 null。 */
export function blindNotice(blindSince) {
  if (!blindSince) return null;
  return `小判官 ${fmtDate(blindSince)} 才開始記錄這個群組，這次的統計區間有一段它沒看到。` +
    '那段期間有發話的人也可能被列進來，請自行對照後用「移除」拿掉。';
}
