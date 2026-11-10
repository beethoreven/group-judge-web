// 自動產生（demo-en/tools/build.py），來源是 js/desktop/members.js。不要手改：改 demo-en/tools/translations.py 再重跑。
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
import { ADMIN, NO_LINE_HINT, ROLE_LABEL, STATUS_FILTERS, STATUS_LABEL, changeMember, memberTone, databaseNote, filterMembers, MEMBER_ORDERS, lastSpoke, leftBriefly, loadMembers, mergeMember, notLinkedNotice, pruneOldRecords, unknownNote } from '../logic/members.js';

export function createMembersView() {
  const node = el('div', { class: 'view' });
  const filter = { keyword: '', status: '', order: 'name' };
  let data = null;
  let generation = 0;
  const pruneButton = asyncButton('Clear records older than six months', async () => {
    try {
      await pruneOldRecords();
    } catch (err) {
      toastError(err, 'Could not clear');
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
      toastError(err, 'Could not update');
    }
    renderTable();
  }

  const tableSlot = el('div', {});

  function render() {
    const search = el('input', {
      class: 'field', type: 'search', placeholder: 'Search name or email', 'aria-label': 'Search name or email',
      value: filter.keyword,
      onInput: (event) => {
        filter.keyword = event.target.value;
        renderTable();
      },
    });
    const status = el('select', {
      class: 'field', 'aria-label': 'Filter by status',
      onChange: (event) => {
        filter.status = event.target.value;
        renderTable();
      },
    }, [
      el('option', { value: '' }, 'All statuses'),
      ...STATUS_FILTERS.map(([value, label]) =>
        el('option', { value, selected: filter.status === value }, label)),
    ]);

    const order = el('select', {
      class: 'field', 'aria-label': 'Sort order',
      onChange: (event) => {
        filter.order = event.target.value;
        renderTable();
      },
    }, MEMBER_ORDERS.map(({ value, label }) => el('option', { value, selected: filter.order === value }, label)));

    clear(node).append(
      el('div', { class: 'view__head' }, [
        el('h1', {}, 'Members'),
        el('p', {}, 'Everyone Group Judge has seen. Join and message times are what it observed and cannot be edited; role, status, email and the ban list can.'),
      ]),
      ...[
        notLinkedNotice(data),
        overview(data.overview),
        databaseLine(data.overview.database),
        el('div', { class: 'filters' }, [search, status, order, pruneButton]),
        tableSlot,
      ].filter(Boolean),
    );
    renderTable();
  }

  function overview(o) {
    const unseen = o.group.count !== null ? Math.max(0, o.group.count - o.known_joined) : null;
    return el('div', { class: 'tiles' }, [
      tile('Members known to Group Judge', `${o.known_joined}`, 'People whose status is “In group”'),
      tile(
        'Actual group size',
        o.group.count !== null ? `${o.group.count}` : '—',
        o.group.count !== null
          ? `Checked ${fmtDateTime(o.group.checked_at)}` +
            (unseen ? `; ${unseen} people Group Judge has never seen (they haven’t spoken yet)` : '; Group Judge knows everyone')
          : (o.group.bound ? 'Updated when you press “Sync from LINE” (top right)' : 'Group Judge is not in any group yet'),
      ),
      tile(
        'Messages with unknown sender',
        `${o.unknown.total}`,
        'Messages whose sender LINE did not reveal, counted over this review period. ' +
        (o.unknown.open ? `${o.unknown.open} are not identified yet — handle them on the Unknown Senders tab. ` : '') +
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
      clear(tableSlot).append(emptyState('Group Judge hasn’t seen anyone yet. Once it is in a group, people show up here as they speak or join.'));
      return;
    }
    if (!shown.length) {
      clear(tableSlot).append(emptyState('No members match.'));
      return;
    }
    clear(tableSlot).append(el('div', { class: 'tablewrap' }, el('table', { class: 'table' }, [
      el('thead', {}, el('tr', {}, [
        el('th', { class: 'table__num' }, 'ID'),
        el('th', {}, 'LINE name'),
        el('th', {}, 'Status'),
        el('th', {}, 'Role'),
        el('th', {}, 'Sign-in email'),
        el('th', {}, 'Joined'),
        el('th', {}, 'Last spoke'),
        el('th', { class: 'table__num' }, 'Silent'),
        el('th', { class: 'table__flag', title: 'Checked people are never put on the removal list (honorary seat)' }, 'Exempt'),
        el('th', { class: 'table__flag', title: 'Group Judge posts a warning when a checked person joins; leaving or rejoining never lifts it' }, 'Banned'),
      ])),
      el('tbody', {}, shown.map(row)),
    ])));
  }

  function row(member) {
    const mine = member.id === data.me;
    const name = member.name || '(no name)';

    const status = el('select', {
      class: 'field field--inline', 'aria-label': `Status of ${name}`,
      onChange: (event) => apply(member, { status: event.target.value },
        `Changed “${name}” to ${STATUS_LABEL[event.target.value]}`),
    }, Object.entries(STATUS_LABEL).map(([value, label]) =>
      el('option', { value, selected: member.status === value }, label)));

    const role = el('select', {
      class: 'field field--inline', 'aria-label': `Role of ${name}`, disabled: mine,
      title: mine ? 'You cannot change your own role' : undefined,
      onChange: (event) => apply(member, { role: Number(event.target.value) },
        `Changed “${name}” to ${ROLE_LABEL[event.target.value]}`),
    }, Object.entries(ROLE_LABEL).map(([value, label]) =>
      el('option', { value, selected: String(member.role) === value }, label)));

    // email 改完按 Enter 或離開欄位才送出；按 Esc 還原。
    const email = el('input', {
      class: 'field field--inline', type: 'email', 'aria-label': `Email of ${name}`,
      value: member.email ?? '', disabled: mine,
      placeholder: member.role === ADMIN ? 'Admins need this to sign in' : '',
      title: mine ? 'You cannot change your own email' : undefined,
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
        apply(member, { email: next }, next ? `Updated the email of “${name}”` : `Cleared the email of “${name}”`);
      },
    });

    const exempt = el('input', {
      type: 'checkbox', checked: member.exempt, 'aria-label': `${name} exempt`,
      onChange: (event) => apply(member, { exempt: event.target.checked },
        event.target.checked ? `“${name}” is now exempt` : `“${name}” is no longer exempt`),
    });
    const banned = el('input', {
      type: 'checkbox', checked: member.banned, 'aria-label': `${name} banned`,
      onChange: (event) => apply(member, { banned: event.target.checked },
        event.target.checked ? `Banned “${name}”` : `Unbanned “${name}”`),
    });
    const merge = !member.has_line_id && asyncButton('Merge…', async () => {
      try {
        if (await mergeMember(member, data.members)) await load({ force: true });
      } catch (err) {
        toastError(err, 'Could not merge');
      }
    }, { class: 'btn btn--small btn--ghost', title: 'This row and another are the same person: merge them, keeping this row and linking the LINE account' });

    return el('tr', { class: memberTone(member) }, [
      el('td', { class: 'table__num muted' }, String(member.id)),
      el('td', { class: 'table__name' }, [
        name,
        mine && badge('You', 'ink'),
        !member.has_line_id && badge('No LINE account', 'neutral', NO_LINE_HINT),
        merge,
      ]),
      el('td', {}, status),
      el('td', {}, role),
      el('td', { class: 'table__email' }, email),
      el('td', { class: 'nowrap' }, [
        member.join_at ? fmtDate(member.join_at) : el('span', {
          class: 'muted', title: 'Group Judge did not see them join (usually they were here before it was)',
        }, '—'),
        leftBriefly(member, fmtDate) && badge('Left once', 'neutral', leftBriefly(member, fmtDate)),
      ]),
      el('td', { class: 'nowrap' }, lastSpoke(member, fmtDate)),
      el('td', { class: 'table__num nowrap' }, fmtDays(member.silent_days)),
      el('td', { class: 'table__flag' }, exempt),
      el('td', { class: 'table__flag' }, banned),
    ]);
  }

  load();
  return { node, reload: () => load({ force: true }) };
}
