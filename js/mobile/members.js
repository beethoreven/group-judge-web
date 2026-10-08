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
import { ADMIN, NO_LINE_HINT, ROLE_LABEL, STATUS_LABEL, STATUS_TONE, akaText, changeMember, databaseNote, filterMembers, lastSpoke, leftBriefly, loadMembers, mergeMember, notLinkedNotice, pruneOldRecords, unknownNote } from '../logic/members.js';

/** 已離開、黑名單的卡片各有自己的底色（見 css/mobile.css）。 */
const CARD_CLASS = { leaved: 'is-left', banned: 'is-banned' };

export function createMembersView() {
  const node = el('div', { class: 'mview' });
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

  const listSlot = el('div', {});

  function render() {
    const search = el('input', {
      class: 'field', type: 'search', placeholder: '搜尋名稱或 email', 'aria-label': '搜尋名稱或 email',
      value: filter.keyword,
      onInput: (event) => {
        filter.keyword = event.target.value;
        renderList();
      },
    });
    const status = el('select', {
      class: 'field', 'aria-label': '依狀態篩選',
      onChange: (event) => {
        filter.status = event.target.value;
        renderList();
      },
    }, [
      el('option', { value: '' }, '全部'),
      ...Object.entries(STATUS_LABEL).map(([value, label]) =>
        el('option', { value, selected: filter.status === value }, label)),
    ]);

    clear(node).append(
      ...[
        el('div', { class: 'mview__head' }, [el('h1', {}, '成員')]),
        notLinkedNotice(data),
        overview(data.overview),
        databaseLine(data.overview.database),
        el('div', { class: 'mfilters' }, [search, status]),
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
        el('span', {}, '小判官認得'),
      ]),
      el('div', { class: 'mtile' }, [
        el('strong', {}, o.group.count !== null ? String(o.group.count) : '—'),
        el('span', {}, '群組實際人數'),
      ]),
      el('div', { class: 'mtile' }, [
        el('strong', {}, String(o.unknown.total)),
        el('span', {}, '認不出發話者'),
      ]),
      el('details', { class: 'mfold mtiles__note' }, [
        el('summary', {}, '這三個數字是什麼'),
        el('p', {}, '小判官認得：狀態是「在群組」的人數。'),
        el('p', {}, o.group.count !== null
          ? `群組實際人數：${fmtDateTime(o.group.checked_at)} 按「讀取成員資料」時問到的。` +
            (unseen ? `還有 ${unseen} 人小判官沒看過（他們還沒說過話）。` : '每個人小判官都認得。')
          : (o.group.bound ? '群組實際人數：按上面的「讀取成員資料」才會更新。' : '群組實際人數：小判官還沒有進任何群組。')),
        el('p', {}, '認不出發話者：這次統計區間裡，LINE 沒告訴小判官是誰發的訊息則數。' +
          (o.unknown.open ? `其中 ${o.unknown.open} 則還沒指認，可以到「未知」頁籤處理。` : '') +
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
      clear(listSlot).append(emptyState('小判官還沒看過任何人。把它加進群組之後，有人說話或加入就會出現在這裡。'));
      return;
    }
    if (!shown.length) {
      clear(listSlot).append(emptyState('沒有符合條件的成員。'));
      return;
    }
    clear(listSlot).append(el('div', { class: 'mcards' }, shown.map(card)));
  }

  function card(member) {
    return el('button', {
      class: `mcard ${CARD_CLASS[member.status] ?? ''}`.trim(), type: 'button',
      onClick: () => edit(member),
    }, [
      el('span', { class: 'mcard__top' }, [
        el('span', { class: 'mcard__name' }, member.name || '（沒有名字）'),
        badge(STATUS_LABEL[member.status], STATUS_TONE[member.status]),
        member.role === ADMIN && badge('管理員', 'ink'),
        member.exempt && badge('不列入整理', 'ok'),
        !member.has_line_id && badge('沒有 LINE 帳號', 'neutral'),
        member.id === data.me && badge('你', 'neutral'),
      ]),
      member.alt_name && el('span', { class: 'mcard__meta' }, akaText(member)),
      el('span', { class: 'mcard__meta' }, [
        member.join_at ? `${fmtDate(member.join_at)} 加入` : '加入時間不明',
        member.last_speak && (member.join_at && member.last_speak === member.join_at
          ? `・還沒說過話（${fmtDays(member.silent_days)}）`
          : `・最後發話 ${lastSpoke(member, fmtDate)}（${fmtDays(member.silent_days)}）`),
      ].filter(Boolean).join('')),
      member.email && el('span', { class: 'mcard__meta' }, member.email),
      leftBriefly(member, fmtDate) && el('span', { class: 'mcard__meta' }, leftBriefly(member, fmtDate)),
    ]);
  }

  /** 編輯一個成員的面板。 */
  function edit(member) {
    const mine = member.id === data.me;
    const name = member.name || '（沒有名字）';
    openModal((close) => {
      const status = el('select', { class: 'field', id: 'm-status' },
        Object.entries(STATUS_LABEL).map(([value, label]) =>
          el('option', { value, selected: member.status === value }, label)));
      const role = el('select', { class: 'field', id: 'm-role', disabled: mine },
        Object.entries(ROLE_LABEL).map(([value, label]) =>
          el('option', { value, selected: String(member.role) === value }, label)));
      const email = el('input', {
        class: 'field', id: 'm-email', type: 'email', value: member.email ?? '', disabled: mine,
        inputmode: 'email', autocapitalize: 'off', placeholder: '管理員要填才登得進後台',
      });

      const exempt = el('input', { type: 'checkbox', id: 'm-exempt', checked: member.exempt });
      const merge = !member.has_line_id && asyncButton('合併到有 LINE 帳號的那一筆…', async () => {
        try {
          close();
          if (await mergeMember(member, data.members)) await load({ force: true });
        } catch (err) {
          toastError(err, '合併失敗');
        }
      }, { class: 'btn' });

      const save = asyncButton('儲存', async () => {
        // 只送有改的欄位。
        const changes = {};
        if (status.value !== member.status) changes.status = status.value;
        if (Number(role.value) !== member.role) changes.role = Number(role.value);
        if (email.value.trim() !== (member.email ?? '')) changes.email = email.value.trim();
        if (exempt.checked !== member.exempt) changes.exempt = exempt.checked;
        if (!Object.keys(changes).length) {
          close();
          return;
        }
        try {
          const updated = await changeMember(member, changes);
          if (!updated) return; // 在確認框按了取消：留在面板裡
          data = { ...data, members: data.members.map((m) => (m.id === updated.id ? updated : m)) };
          close();
          toast(`已更新「${name}」`);
          if (data.me === null && ('role' in changes || 'email' in changes)) {
            // 名單裡還沒有自己的人改了身分或 email：可能就是把自己接上了，重新問一次。
            await load({ force: true });
            return;
          }
          renderList();
        } catch (err) {
          toastError(err, '修改失敗');
        }
      }, { class: 'btn btn--primary' });

      return el('div', {}, [
        el('div', { class: 'modal__body mform' }, [
          el('label', { for: 'm-status' }, '狀態'), status,
          el('label', { for: 'm-role' }, '身分'), role,
          el('label', { for: 'm-email' }, '登入後台用的 Google 帳號'), email,
          el('label', { class: 'mcheck', for: 'm-exempt' }, [exempt, '不列入整理（榮譽席，系統不會把他算進名單）']),
          mine && el('p', { class: 'muted' }, '不能改自己的身分與 email。'),
          !member.has_line_id && el('p', { class: 'muted' }, NO_LINE_HINT),
          merge,
        ].filter(Boolean)),
        el('div', { class: 'modal__actions' }, [
          el('button', { class: 'btn btn--ghost', type: 'button', onClick: () => close() }, '取消'),
          save,
        ]),
      ]);
    }, { title: name });
  }

  load();
  return { node, reload: () => load({ force: true }) };
}
