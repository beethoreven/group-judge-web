// 自動產生（demo-en/tools/build.py），來源是 js/logic/cleanup.js。不要手改：改 demo-en/tools/translations.py 再重跑。
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
import { forgetMembers } from './members.js';

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

    /** 可以用「新增」加進名單的人：在群組裡、不是黑名單、而且還不在名單上。沉默最久的排前面。 */
    addable(members) {
      const listed = new Set(rows.map((r) => r.user_id));
      return members
        .filter((m) => m.status === 'joined' && !m.banned && !listed.has(m.id))
        .sort((a, b) => (b.silent_days ?? -1) - (a.silent_days ?? -1));
    },

    add(members) {
      if (!members.length) return;
      for (const m of members) {
        rows.push({
          user_id: m.id, name: m.name, status: m.status, banned: m.banned,
          join_at: m.join_at, last_speak: m.last_speak, silent_days: m.silent_days,
          source: 'manual', state: 'kick', prior_whitelist_at: null, identified: false, late_speak: null,
        });
      }
      touched = true;
      emit();
    },

    /**
     * 「全部設為已離開」要標的人：已儲存的名單上、還在群組裡的。名單有還沒存的
     * 變更時是空的——要標的是存好的那份，不是畫面上改到一半的。
     */
    leftCandidates() {
      if (!server?.saved || touched) return [];
      return rows.filter((r) => r.state === 'kick' && r.status === 'joined');
    },

    /**
     * 按下「全部設為已離開」：踢完人之後用。還沒接上 LINE 帳號的人被踢，小判官
     * 認不出是誰（案主 2026-11-01），只能這樣補標。問過管理員才送出；回傳標了
     * 幾個人，按取消是 null。
     */
    async markAllLeft() {
      const people = this.leftCandidates();
      if (!people.length || !(await confirmMarkLeft(people))) return null;
      const { marked } = await api.post('/api/members/mark-left', { ids: people.map((r) => r.user_id) });
      forgetMembers();
      await this.load();
      return marked;
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
    title: people.length === 1 ? 'This person was kept before' : `These ${people.length} people were kept before`,
    body: el('div', {}, [
      el('div', { class: 'checklist' }, people.map((p) => el('div', { class: 'checklist__entry' }, [
        el('strong', {}, p.name || '(no name)'),
        el('div', {},
          `Whitelisted on ${fmtDate(p.prior_whitelist_at)} and silent ever since (${p.silent_days ?? '—'} days)`),
      ]))),
      el('p', {}, 'Keep them again anyway?'),
    ]),
    confirmText: 'Yes, keep again',
    cancelText: 'No',
    danger: true,
  });
}

function confirmMarkLeft(people) {
  return confirmDialog({
    title: `Mark these ${people.length} people as left?`,
    body: el('div', {}, [
      el('p', {}, 'Press this after removing them from the group in LINE. People linked to a LINE account are recorded automatically when removed, so marking them here too is harmless; banned people keep their status.'),
      el('div', { class: 'checklist' }, people.map((p) => el('div', { class: 'checklist__entry' },
        el('strong', {}, p.name || '(no name)')))),
    ]),
    confirmText: 'Mark as left',
    cancelText: 'Cancel',
    danger: true,
  });
}

/** 名單上一個人要顯示哪些備註。兩種版面共用同一套說法。 */
export function rowNotes(row) {
  const notes = [];
  if (row.state === 'spare' && row.identified) {
    notes.push({ text: 'Identified as speaker · whitelisted', tone: 'ink', title: 'A message on the Unknown Senders tab was identified as theirs' });
  } else if (row.state === 'spare') {
    notes.push({ text: row.source === 'auto' ? 'Leaving the list · whitelisted' : 'Leaving the list', tone: 'ink' });
  }
  if (row.late_speak && row.state === 'kick') {
    notes.push({
      text: `Spoke only on ${fmtDate(row.late_speak)}`, tone: 'warn',
      title: 'They spoke after the review period ended — too late, so they stay on the list',
    });
  }
  if (row.source === 'manual') notes.push({ text: 'Added manually', tone: 'neutral' });
  if (row.prior_whitelist_at) {
    notes.push({
      text: `Kept on ${fmtDate(row.prior_whitelist_at)}`, tone: 'warn',
      title: 'Whitelisted before and silent ever since',
    });
  }
  if (row.banned) notes.push({ text: 'Banned', tone: 'danger' });
  else if (row.status === 'leaved') notes.push({ text: 'Left the group', tone: 'neutral' });
  return notes;
}

/** 名單上方那句「存了沒」。 */
export function savedSummary(model) {
  if (model.touched) {
    return { text: 'Unsaved changes', tone: 'warn' };
  }
  if (model.saved) {
    return { text: `Saved ${fmtDateTime(model.saved.clean_at)}`, tone: 'ok' };
  }
  return { text: 'Not saved this month yet (below is the list the system just calculated)', tone: 'neutral' };
}

/** 小判官比統計區間晚進群時，名單上方要顯示的提醒；不用提醒就是 null。 */
export function blindNotice(blindSince) {
  if (!blindSince) return null;
  return `Group Judge only started watching this group on ${fmtDate(blindSince)}, so it missed part of this review period. ` +
    'People who spoke during that time may be listed too — check them yourself and take them off with “Remove”.';
}
