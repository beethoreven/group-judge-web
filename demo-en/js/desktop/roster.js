// 自動產生（demo-en/tools/build.py），來源是 js/desktop/roster.js。不要手改：改 demo-en/tools/translations.py 再重跑。
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
      `${group.label} (${counts[key]})`,
    ]));
    const sort = el('select', {
      class: 'field', 'aria-label': 'Sort order',
      onChange: (event) => {
        filter.sort = event.target.value;
        rememberSort(filter.sort);
        renderTable();
      },
    }, SORTS.map((s) => el('option', { value: s.key, selected: s.key === filter.sort }, s.label)));
    const search = el('input', {
      class: 'field', type: 'search', placeholder: 'Search name', 'aria-label': 'Search name',
      onInput: (event) => {
        filter.keyword = event.target.value;
        renderTable();
      },
    });
    const notice = blindNotice(data.blind_since);

    clear(node).append(...[
      el('div', { class: 'view__head' }, [
        el('h1', {}, 'Roster Check'),
        el('p', {}, [
          'Review period ',
          el('strong', {}, `${fmtPlainDate(data.period.start)} – ${fmtPlainDate(data.period.end)}`),
          ': who spoke and who didn’t. Go down LINE’s member list one by one — anyone in LINE but missing here has never spoken.',
        ]),
        el('p', {}, coverage(data)),
      ]),
      notice && el('div', { class: 'notice' }, notice),
      el('div', { class: 'filters filters--wrap' }, [el('div', { class: 'chips' }, chips), search, sort]),
      el('p', { class: 'muted hint' },
        'LINE doesn’t publish how it sorts the member list, and mobile and desktop differ; pick the order that matches your device (it is remembered). Friends you renamed show under your name for them in LINE and may sit elsewhere — use search.'),
      tableSlot,
    ].filter(Boolean));
    renderTable();
  }

  function renderTable() {
    const shown = arrange(data.members, filter);
    if (!shown.length) {
      clear(tableSlot).append(emptyState(data.members.length ? 'No members match.' : 'Group Judge hasn’t seen anyone yet.'));
      return;
    }
    clear(tableSlot).append(el('div', { class: 'tablewrap' }, el('table', { class: 'table' }, [
      el('thead', {}, el('tr', {}, [
        el('th', { class: 'table__num' }, '#'),
        el('th', {}, 'LINE name'),
        el('th', {}, 'In period'),
        ...data.months.map((month) => el('th', { class: 'table__num' }, `${monthLabel(month)} msgs`)),
        el('th', {}, 'Last spoke'),
        el('th', {}, 'Joined'),
      ])),
      el('tbody', {}, shown.map((m, index) => el('tr', {}, [
        el('td', { class: 'table__num muted' }, String(index + 1)),
        el('td', { class: 'table__name' }, m.name || '(no name)'),
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
