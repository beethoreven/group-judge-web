// 自動產生（demo-en/tools/build.py），來源是 js/mobile/roster.js。不要手改：改 demo-en/tools/translations.py 再重跑。
/**
 * 行動版｜發話對照頁籤：照 LINE 成員名單順序排的名冊，一人一行，方便跟 LINE 對照。
 * 排序與分組的規則在 js/logic/roster.js。
 */

import { badge, clear, el, emptyState, loadFailed, spinner } from '../ui.js';
import { fmtDate, fmtPlainDate } from '../format.js';
import { blindNotice } from '../logic/cleanup.js';
import { GROUPS, SORTS, arrange, countsText, coverage, loadRoster, rememberSort, savedSort, tally } from '../logic/roster.js';

export function createRosterView() {
  const node = el('div', { class: 'mview' });
  const filter = { groups: new Set(['spoke']), keyword: '', sort: savedSort() };
  const listSlot = el('div', {});
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
          renderList();
        },
      }),
      `${group.label} ${counts[key]}`,
    ]));
    const sort = el('select', {
      class: 'field', 'aria-label': 'Sort order',
      onChange: (event) => {
        filter.sort = event.target.value;
        rememberSort(filter.sort);
        renderList();
      },
    }, SORTS.map((s) => el('option', { value: s.key, selected: s.key === filter.sort }, s.label)));
    const search = el('input', {
      class: 'field', type: 'search', placeholder: 'Search name', 'aria-label': 'Search name',
      onInput: (event) => {
        filter.keyword = event.target.value;
        renderList();
      },
    });
    const notice = blindNotice(data.blind_since);

    clear(node).append(...[
      el('div', { class: 'mview__head' }, [
        el('h1', {}, 'Roster Check'),
        el('p', {}, [
          el('strong', {}, `${fmtPlainDate(data.period.start)} – ${fmtPlainDate(data.period.end)}`),
          ': who spoke. Anyone in LINE’s member list but missing here has never spoken.',
        ]),
      ]),
      el('details', { class: 'mfold' }, [
        el('summary', {}, 'How to compare, and why the order may differ'),
        el('p', {}, coverage(data)),
        el('p', {}, 'LINE doesn’t publish how it sorts the member list, and mobile and desktop differ; pick the order below that matches your LINE (it is remembered).'),
        el('p', {}, 'Friends you renamed show under your name for them in LINE and may sit elsewhere — use search.'),
      ]),
      notice && el('div', { class: 'notice' }, notice),
      el('div', { class: 'chips' }, chips),
      search,
      sort,
      listSlot,
    ].filter(Boolean));
    renderList();
  }

  function renderList() {
    const shown = arrange(data.members, filter);
    if (!shown.length) {
      clear(listSlot).append(emptyState(data.members.length ? 'No members match.' : 'Group Judge hasn’t seen anyone yet.'));
      return;
    }
    clear(listSlot).append(el('ol', { class: 'mroster' }, shown.map((m) => el('li', {}, [
      el('span', { class: 'mroster__name' }, m.name || '(no name)'),
      el('span', { class: 'mroster__meta' }, [
        m.group === 'spoke'
          ? el('span', { class: 'muted' }, countsText(data.months, m.counts))
          : m.join_at && m.group === 'new' && el('span', { class: 'muted' }, `Joined ${fmtDate(m.join_at)}`),
        badge(GROUPS[m.group].label, GROUPS[m.group].tone),
      ]),
    ]))));
  }

  load();
  return { node, reload: load };
}
