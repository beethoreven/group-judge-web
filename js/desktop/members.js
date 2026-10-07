/**
 * 桌面版｜成員頁籤：小判官認得的每一個人，可以改身分、狀態與登入用的 email。
 *
 * 上面一排數字是整體狀況：認得幾個人、群組實際幾個人、有多少訊息認不出是誰發的。
 *
 * 「哪一筆是我」用的是這次載入時後端回的 data.me，不是登入當下的答案——
 * 它可能是 null（見 js/logic/members.js 的 notLinkedNotice）。
 */

import { asyncButton, badge, clear, el, emptyState, loadFailed, spinner, toast, toastError } from '../ui.js';
import { fmtDate, fmtDateTime, fmtDays } from '../format.js';
import { ADMIN, NO_LINE_HINT, ROLE_LABEL, STATUS_LABEL, akaText, changeMember, databaseNote, filterMembers, lastSpoke, leftBriefly, loadMembers, mergeMember, notLinkedNotice, pruneOldRecords, unknownNote } from '../logic/members.js';

export function createMembersView() {
  const node = el('div', { class: 'view' });
  const filter = { keyword: '', status: '' };
  let data = null;
  let generation = 0;
  const pruneButton = asyncButton('清除半年以前的紀錄', async () => {
    try {
      await pruneOldRecords();
    } catch (err) {
      toastError(err, '清除失敗');
    }
  }, { class: 'btn btn--ghost prune' });

  async function load({ force = false } = {}) {
    const mine = ++generation;
    if (!data) clear(node).append(spinner());
    try {
      const fresh = await loadMembers({ force });
      if (mine !== generation) return; // 有更新的一次載入在路上了
      data = fresh;
      render();
    } catch (err) {
      if (mine !== generation) return;
      data = null;
      clear(node).append(loadFailed(err.message, () => load({ force: true })));
    }
  }

  /** 送出一項修改。成功就換掉那一列的資料；取消或失敗都把畫面還原。 */
  async function apply(member, changes, done) {
    try {
      const updated = await changeMember(member, changes);
      if (updated) {
        data = { ...data, members: data.members.map((m) => (m.id === updated.id ? updated : m)) };
        toast(done);
        if (data.me === null && ('role' in changes || 'email' in changes)) {
          // 名單裡還沒有自己的人改了身分或 email：可能就是把自己接上了，重新問一次。
          await load({ force: true });
          return;
        }
      }
    } catch (err) {
      toastError(err, '修改失敗');
    }
    renderTable();
  }

  const tableSlot = el('div', {});

  function render() {
    const search = el('input', {
      class: 'field', type: 'search', placeholder: '搜尋名稱或 email', 'aria-label': '搜尋名稱或 email',
      value: filter.keyword,
      onInput: (event) => {
        filter.keyword = event.target.value;
        renderTable();
      },
    });
    const status = el('select', {
      class: 'field', 'aria-label': '依狀態篩選',
      onChange: (event) => {
        filter.status = event.target.value;
        renderTable();
      },
    }, [
      el('option', { value: '' }, '全部狀態'),
      ...Object.entries(STATUS_LABEL).map(([value, label]) =>
        el('option', { value, selected: filter.status === value }, label)),
    ]);

    clear(node).append(
      el('div', { class: 'view__head' }, [
        el('h1', {}, '成員'),
        el('p', {}, '小判官看過的每一個人。加入時間與發話時間是它觀察到的，不能手動改；身分、狀態與 email 可以。'),
      ]),
      ...[
        notLinkedNotice(data),
        overview(data.overview),
        databaseLine(data.overview.database),
        el('div', { class: 'filters' }, [search, status, pruneButton]),
        tableSlot,
      ].filter(Boolean),
    );
    renderTable();
  }

  function overview(o) {
    const unseen = o.group.count !== null ? Math.max(0, o.group.count - o.known_joined) : null;
    return el('div', { class: 'tiles' }, [
      tile('小判官認得的成員', `${o.known_joined} 人`, '狀態是「在群組」的人數'),
      tile(
        '群組實際人數',
        o.group.count !== null ? `${o.group.count} 人` : '—',
        o.group.count !== null
          ? `${fmtDateTime(o.group.checked_at)} 讀取` +
            (unseen ? `；還有 ${unseen} 人小判官沒看過（他們還沒說過話）` : '；每個人小判官都認得')
          : (o.group.bound ? '按右上角「讀取成員資料」才會更新' : '小判官還沒有進任何群組'),
      ),
      tile(
        '認不出發話者的訊息',
        `${o.unknown.total} 則`,
        'LINE 沒告訴小判官是誰發的訊息，算的是這次統計區間裡的。' +
        (o.unknown.open ? `其中 ${o.unknown.open} 則還沒指認，可以到「未知發話」頁籤處理。` : '') +
        unknownNote(o.unknown.later),
      ),
    ]);
  }

  function databaseLine(db) {
    const note = databaseNote(db);
    return note && el('div', { class: db.saving ? 'notice' : 'usage' }, note);
  }

  function tile(label, value, note) {
    return el('div', { class: 'tile' }, [
      el('div', { class: 'tile__label' }, label),
      el('div', { class: 'tile__value' }, value),
      el('div', { class: 'tile__note' }, note),
    ]);
  }

  function renderTable() {
    const shown = filterMembers(data.members, filter);
    if (!data.members.length) {
      clear(tableSlot).append(emptyState('小判官還沒看過任何人。把它加進群組之後，有人說話或加入就會出現在這裡。'));
      return;
    }
    if (!shown.length) {
      clear(tableSlot).append(emptyState('沒有符合條件的成員。'));
      return;
    }
    clear(tableSlot).append(el('div', { class: 'tablewrap' }, el('table', { class: 'table' }, [
      el('thead', {}, el('tr', {}, [
        el('th', {}, 'LINE 名稱'),
        el('th', {}, '狀態'),
        el('th', {}, '身分'),
        el('th', {}, '登入用的 email'),
        el('th', {}, '加入群組'),
        el('th', {}, '最後發話'),
        el('th', { class: 'table__num' }, '未發話'),
        el('th', { class: 'table__flag', title: '勾起來的人，系統不會把他算進待移除名單（榮譽席）' }, '不列入整理'),
      ])),
      el('tbody', {}, shown.map(row)),
    ])));
  }

  function row(member) {
    const mine = member.id === data.me;
    const name = member.name || '（沒有名字）';

    const status = el('select', {
      class: 'field field--inline', 'aria-label': `${name} 的狀態`,
      onChange: (event) => apply(member, { status: event.target.value },
        `已把「${name}」改成${STATUS_LABEL[event.target.value]}`),
    }, Object.entries(STATUS_LABEL).map(([value, label]) =>
      el('option', { value, selected: member.status === value }, label)));

    const role = el('select', {
      class: 'field field--inline', 'aria-label': `${name} 的身分`, disabled: mine,
      title: mine ? '不能改自己的身分' : undefined,
      onChange: (event) => apply(member, { role: Number(event.target.value) },
        `已把「${name}」改成${ROLE_LABEL[event.target.value]}`),
    }, Object.entries(ROLE_LABEL).map(([value, label]) =>
      el('option', { value, selected: String(member.role) === value }, label)));

    // email 改完按 Enter 或離開欄位才送出；按 Esc 還原。
    const email = el('input', {
      class: 'field field--inline', type: 'email', 'aria-label': `${name} 的 email`,
      value: member.email ?? '', disabled: mine,
      placeholder: member.role === ADMIN ? '管理員要填才登得進後台' : '',
      title: mine ? '不能改自己的 email' : undefined,
      onKeydown: (event) => {
        if (event.key === 'Enter') event.target.blur();
        if (event.key === 'Escape') {
          event.target.value = member.email ?? '';
          event.target.blur();
        }
      },
      onBlur: (event) => {
        const next = event.target.value.trim();
        if (next === (member.email ?? '')) return;
        apply(member, { email: next }, next ? `已更新「${name}」的 email` : `已清除「${name}」的 email`);
      },
    });

    const exempt = el('input', {
      type: 'checkbox', checked: member.exempt, 'aria-label': `${name} 不列入整理`,
      onChange: (event) => apply(member, { exempt: event.target.checked },
        event.target.checked ? `「${name}」不列入整理` : `「${name}」恢復列入整理`),
    });
    const merge = !member.has_line_id && asyncButton('合併…', async () => {
      try {
        if (await mergeMember(member, data.members)) await load({ force: true });
      } catch (err) {
        toastError(err, '合併失敗');
      }
    }, { class: 'btn btn--small btn--ghost', title: '這一筆跟另一筆其實是同一個人：併進有 LINE 帳號的那一筆' });

    return el('tr', { class: member.status === 'leaved' ? 'is-dim' : '' }, [
      el('td', { class: 'table__name' }, [
        name,
        mine && badge('你', 'ink'),
        !member.has_line_id && badge('沒有 LINE 帳號', 'neutral', NO_LINE_HINT),
        merge,
        member.alt_name && el('span', { class: 'table__aka' }, akaText(member)),
      ]),
      el('td', {}, status),
      el('td', {}, role),
      el('td', { class: 'table__email' }, email),
      el('td', { class: 'nowrap' }, [
        member.join_at ? fmtDate(member.join_at) : el('span', {
          class: 'muted', title: '小判官沒看到他加入（多半是它進群之前就在的人）',
        }, '—'),
        leftBriefly(member, fmtDate) && badge('離開過', 'neutral', leftBriefly(member, fmtDate)),
      ]),
      el('td', { class: 'nowrap' }, lastSpoke(member, fmtDate)),
      el('td', { class: 'table__num nowrap' }, fmtDays(member.silent_days)),
      el('td', { class: 'table__flag' }, exempt),
    ]);
  }

  load();
  return { node, reload: () => load({ force: true }) };
}
