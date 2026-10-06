/**
 * 桌面版｜發話對照頁籤：一張照 LINE 成員名單順序排的名冊，拿來跟 LINE 逐一對照。
 * 排序與分組的規則在 js/logic/roster.js。
 */

import { badge, clear, el, emptyState, loadFailed, spinner } from '../ui.js';
import { fmtDate, fmtPlainDate } from '../format.js';
import { blindNotice } from '../logic/cleanup.js';
import { lastSpoke } from '../logic/members.js';
import { GROUPS, SORTS, arrange, coverage, loadRoster, monthLabel, rememberSort, savedSort, tally } from '../logic/roster.js';

export function createRosterView() {
  const node = el('div', { class: 'view' });
  const filter = { groups: new Set(['spoke']), keyword: '', sort: savedSort() };
  const tableSlot = el('div', {});
  let data = null;

  async function load() {
    clear(node).append(spinner());
    try {
      data = await loadRoster();
      render();
    } catch (err) {
      clear(node).append(loadFailed(err.message, load));
    }
  }

  function render() {
    const counts = tally(data.members);
    const chips = Object.entries(GROUPS).map(([key, group]) => el('label', { class: 'chip' }, [
      el('input', {
        type: 'checkbox', checked: filter.groups.has(key),
        onChange: (event) => {
          if (event.target.checked) filter.groups.add(key);
          else filter.groups.delete(key);
          renderTable();
        },
      }),
      `${group.label}（${counts[key]}）`,
    ]));
    const sort = el('select', {
      class: 'field', 'aria-label': '排序方式',
      onChange: (event) => {
        filter.sort = event.target.value;
        rememberSort(filter.sort);
        renderTable();
      },
    }, SORTS.map((s) => el('option', { value: s.key, selected: s.key === filter.sort }, s.label)));
    const search = el('input', {
      class: 'field', type: 'search', placeholder: '搜尋名稱', 'aria-label': '搜尋名稱',
      onInput: (event) => {
        filter.keyword = event.target.value;
        renderTable();
      },
    });
    const notice = blindNotice(data.blind_since);

    clear(node).append(...[
      el('div', { class: 'view__head' }, [
        el('h1', {}, '發話對照'),
        el('p', {}, [
          '統計區間 ',
          el('strong', {}, `${fmtPlainDate(data.period.start)} – ${fmtPlainDate(data.period.end)}`),
          ' 裡每個人有沒有發話。拿 LINE 的群組成員名單一個一個對：LINE 上有、這裡找不到的人，就是沒發話的人。',
        ]),
        el('p', {}, coverage(data)),
      ]),
      notice && el('div', { class: 'notice' }, notice),
      el('div', { class: 'filters filters--wrap' }, [el('div', { class: 'chips' }, chips), search, sort]),
      el('p', { class: 'muted hint' },
        'LINE 沒有公布成員名單的排序規則，手機版與電腦版也不一樣；挑一個跟你手上那台對得起來的排法，會記住。你幫好友改過的名字，LINE 顯示的是你改的那個，位置會跟這裡不同，可以用搜尋找。'),
      tableSlot,
    ].filter(Boolean));
    renderTable();
  }

  function renderTable() {
    const shown = arrange(data.members, filter);
    if (!shown.length) {
      clear(tableSlot).append(emptyState(data.members.length ? '沒有符合條件的成員。' : '小判官還沒看過任何人。'));
      return;
    }
    clear(tableSlot).append(el('div', { class: 'tablewrap' }, el('table', { class: 'table' }, [
      el('thead', {}, el('tr', {}, [
        el('th', { class: 'table__num' }, '#'),
        el('th', {}, 'LINE 名稱'),
        el('th', {}, '區間內'),
        ...data.months.map((month) => el('th', { class: 'table__num' }, `${monthLabel(month)}則數`)),
        el('th', {}, '最後發話'),
        el('th', {}, '加入群組'),
      ])),
      el('tbody', {}, shown.map((m, index) => el('tr', {}, [
        el('td', { class: 'table__num muted' }, String(index + 1)),
        el('td', { class: 'table__name' }, m.name || '（沒有名字）'),
        el('td', {}, badge(GROUPS[m.group].label, GROUPS[m.group].tone)),
        ...m.counts.map((count) => el('td', { class: 'table__num' }, count ? String(count) : '—')),
        el('td', { class: 'nowrap' }, lastSpoke(m, fmtDate)),
        el('td', { class: 'nowrap' }, m.join_at ? fmtDate(m.join_at) : el('span', { class: 'muted' }, '—')),
      ]))),
    ])));
  }

  load();
  return { node, reload: load };
}
