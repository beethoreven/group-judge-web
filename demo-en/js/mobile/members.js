// 自動產生（demo-en/tools/build.py），來源是 js/mobile/members.js。不要手改：改 demo-en/tools/translations.py 再重跑。
/**
 * 行動版｜成員頁籤：一個人一張卡片，點下去開一個面板改身分、狀態與 email。
 *
 * 桌面版是直接在表格裡改、改一項送一項；手機上下拉選單與輸入框擠在卡片裡
 * 很難按，所以集中到面板裡，按「儲存」一次送出。
 *
 * 「哪一筆是我」用的是這次載入時後端回的 data.me，不是登入當下的答案——
 * 它可能是 null（見 js/logic/members.js 的 notLinkedNotice）。
 */

import { asyncButton, badge, clear, el, emptyState, loadFailed, openModal, spinner, toast, toastError } from '../ui.js';
import { fmtDate, fmtDateTime, fmtDays } from '../format.js';
import { ADMIN, NO_LINE_HINT, ROLE_LABEL, STATUS_FILTERS, STATUS_LABEL, STATUS_TONE, changeMember, memberTone, databaseNote, filterMembers, MEMBER_ORDERS, lastSpoke, leftBriefly, loadMembers, mergeMember, notLinkedNotice, pruneOldRecords, unknownNote } from '../logic/members.js';

export function createMembersView() {
  const node = el('div', { class: 'mview' });
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

  const listSlot = el('div', {});

  function render() {
    const search = el('input', {
      class: 'field', type: 'search', placeholder: 'Search name or email', 'aria-label': 'Search name or email',
      value: filter.keyword,
      onInput: (event) => {
        filter.keyword = event.target.value;
        renderList();
      },
    });
    const status = el('select', {
      class: 'field', 'aria-label': 'Filter by status',
      onChange: (event) => {
        filter.status = event.target.value;
        renderList();
      },
    }, [
      el('option', { value: '' }, 'All'),
      ...STATUS_FILTERS.map(([value, label]) =>
        el('option', { value, selected: filter.status === value }, label)),
    ]);

    const order = el('select', {
      class: 'field', 'aria-label': 'Sort order',
      onChange: (event) => {
        filter.order = event.target.value;
        renderList();
      },
    }, MEMBER_ORDERS.map(({ value, label }) => el('option', { value, selected: filter.order === value }, label)));

    clear(node).append(
      ...[
        el('div', { class: 'mview__head' }, [el('h1', {}, 'Members')]),
        notLinkedNotice(data),
        overview(data.overview),
        databaseLine(data.overview.database),
        el('div', { class: 'mfilters' }, [search, status, order]),
        listSlot,
        pruneButton,
      ].filter(Boolean),
    );
    renderList();
  }

  function overview(o) {
    const unseen = o.group.count !== null ? Math.max(0, o.group.count - o.known_joined) : null;
    return el('div', { class: 'mtiles' }, [
      el('div', { class: 'mtile' }, [
        el('strong', {}, String(o.known_joined)),
        el('span', {}, 'Known'),
      ]),
      el('div', { class: 'mtile' }, [
        el('strong', {}, o.group.count !== null ? String(o.group.count) : '—'),
        el('span', {}, 'In group'),
      ]),
      el('div', { class: 'mtile' }, [
        el('strong', {}, String(o.unknown.total)),
        el('span', {}, 'Unknown sender'),
      ]),
      el('details', { class: 'mfold mtiles__note' }, [
        el('summary', {}, 'What these numbers mean'),
        el('p', {}, 'Known: people Group Judge knows whose status is “In group”.'),
        el('p', {}, o.group.count !== null
          ? `In group: asked from LINE on ${fmtDateTime(o.group.checked_at)} via “Sync from LINE”. ` +
            (unseen ? `${unseen} people Group Judge has never seen (they haven’t spoken yet).` : 'Group Judge knows everyone.')
          : (o.group.bound ? 'In group: updated when you press “Sync from LINE” above.' : 'In group: Group Judge is not in any group yet.')),
        el('p', {}, 'Unknown sender: messages in this review period whose sender LINE did not reveal. ' +
          (o.unknown.open ? `${o.unknown.open} are not identified yet — handle them on the Unknown tab. ` : '') +
          unknownNote(o.unknown.later)),
      ]),
    ]);
  }

  function databaseLine(db) {
    const note = databaseNote(db);
    return note && el('div', { class: db.saving ? 'notice' : 'musage' }, note);
  }

  function renderList() {
    const shown = filterMembers(data.members, filter);
    if (!data.members.length) {
      clear(listSlot).append(emptyState('Group Judge hasn’t seen anyone yet. Once it is in a group, people show up here as they speak or join.'));
      return;
    }
    if (!shown.length) {
      clear(listSlot).append(emptyState('No members match.'));
      return;
    }
    clear(listSlot).append(el('div', { class: 'mcards' }, shown.map(card)));
  }

  function card(member) {
    return el('button', {
      class: `mcard ${memberTone(member)}`.trim(), type: 'button',
      onClick: () => edit(member),
    }, [
      el('span', { class: 'mcard__top' }, [
        el('span', { class: 'mcard__name' }, member.name || '(no name)'),
        el('span', { class: 'muted' }, `#${member.id}`),
        badge(STATUS_LABEL[member.status], STATUS_TONE[member.status]),
        member.banned && badge('Banned', 'danger'),
        member.role === ADMIN && badge('Admin', 'ink'),
        member.exempt && badge('Exempt', 'ok'),
        !member.has_line_id && badge('No LINE account', 'neutral'),
        member.id === data.me && badge('You', 'neutral'),
      ]),
      el('span', { class: 'mcard__meta' }, [
        member.join_at ? `Joined ${fmtDate(member.join_at)}` : 'Join date unknown',
        member.last_speak && (member.join_at && member.last_speak === member.join_at
          ? ` · never spoke (${fmtDays(member.silent_days)})`
          : ` · last spoke ${lastSpoke(member, fmtDate)} (${fmtDays(member.silent_days)})`),
      ].filter(Boolean).join('')),
      member.email && el('span', { class: 'mcard__meta' }, member.email),
      leftBriefly(member, fmtDate) && el('span', { class: 'mcard__meta' }, leftBriefly(member, fmtDate)),
    ]);
  }

  /** 編輯一個成員的面板。 */
  function edit(member) {
    const mine = member.id === data.me;
    const name = member.name || '(no name)';
    openModal((close) => {
      const status = el('select', { class: 'field', id: 'm-status' },
        Object.entries(STATUS_LABEL).map(([value, label]) =>
          el('option', { value, selected: member.status === value }, label)));
      const role = el('select', { class: 'field', id: 'm-role', disabled: mine },
        Object.entries(ROLE_LABEL).map(([value, label]) =>
          el('option', { value, selected: String(member.role) === value }, label)));
      const email = el('input', {
        class: 'field', id: 'm-email', type: 'email', value: member.email ?? '', disabled: mine,
        inputmode: 'email', autocapitalize: 'off', placeholder: 'Admins need this to sign in',
      });

      const exempt = el('input', { type: 'checkbox', id: 'm-exempt', checked: member.exempt });
      const banned = el('input', { type: 'checkbox', id: 'm-banned', checked: member.banned });
      const merge = !member.has_line_id && asyncButton('Merge with the row that has LINE…', async () => {
        try {
          close();
          if (await mergeMember(member, data.members)) await load({ force: true });
        } catch (err) {
          toastError(err, 'Could not merge');
        }
      }, { class: 'btn' });

      const save = asyncButton('Save', async () => {
        // 只送有改的欄位。
        const changes = {};
        if (status.value !== member.status) changes.status = status.value;
        if (Number(role.value) !== member.role) changes.role = Number(role.value);
        if (email.value.trim() !== (member.email ?? '')) changes.email = email.value.trim();
        if (exempt.checked !== member.exempt) changes.exempt = exempt.checked;
        if (banned.checked !== member.banned) changes.banned = banned.checked;
        if (!Object.keys(changes).length) {
          close();
          return;
        }
        try {
          const updated = await changeMember(member, changes);
          if (!updated) return; // 在確認框按了取消：留在面板裡
          data = { ...data, members: data.members.map((m) => (m.id === updated.id ? updated : m)) };
          close();
          toast(`Updated “${name}”`);
          if (data.me === null && ('role' in changes || 'email' in changes)) {
            // 名單裡還沒有自己的人改了身分或 email：可能就是把自己接上了，重新問一次。
            await load({ force: true });
            return;
          }
          renderList();
        } catch (err) {
          toastError(err, 'Could not update');
        }
      }, { class: 'btn btn--primary' });

      return el('div', {}, [
        el('div', { class: 'modal__body mform' }, [
          el('label', { for: 'm-status' }, 'Status'), status,
          el('label', { for: 'm-role' }, 'Role'), role,
          el('label', { for: 'm-email' }, 'Google account for signing in'), email,
          el('label', { class: 'mcheck', for: 'm-exempt' }, [exempt, 'Exempt (honorary seat — never put on the removal list)']),
          el('label', { class: 'mcheck', for: 'm-banned' }, [banned, 'Banned (Group Judge posts a warning when they join)']),
          mine && el('p', { class: 'muted' }, 'You cannot change your own role or email.'),
          !member.has_line_id && el('p', { class: 'muted' }, NO_LINE_HINT),
          merge,
        ].filter(Boolean)),
        el('div', { class: 'modal__actions' }, [
          el('button', { class: 'btn btn--ghost', type: 'button', onClick: () => close() }, 'Cancel'),
          save,
        ]),
      ]);
    }, { title: name });
  }

  load();
  return { node, reload: () => load({ force: true }) };
}
