/**
 * 行動版｜發話對照頁籤：照 LINE 成員名單順序排的名冊，一人一行，方便跟 LINE 對照。
 * 排序與分組的規則在 js/logic/roster.js。
 */

import { badge, clear, el, emptyState, loadFailed, spinner } from '../ui.js';
import { fmtDate, fmtPlainDate } from '../format.js';
import { blindNotice } from '../logic/cleanup.js';
import { GROUPS, SORTS, arrange, coverage, loadRoster, rememberSort, savedSort, tally } from '../logic/roster.js';

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
      class: 'field', 'aria-label': '排序方式',
      onChange: (event) => {
        filter.sort = event.target.value;
        rememberSort(filter.sort);
        renderList();
      },
    }, SORTS.map((s) => el('option', { value: s.key, selected: s.key === filter.sort }, s.label)));
    const search = el('input', {
      class: 'field', type: 'search', placeholder: '搜尋名稱', 'aria-label': '搜尋名稱',
      onInput: (event) => {
        filter.keyword = event.target.value;
        renderList();
      },
    });
    const notice = blindNotice(data.blind_since);

    clear(node).append(...[
      el('div', { class: 'mview__head' }, [
        el('h1', {}, '發話對照'),
        el('p', {}, [
          el('strong', {}, `${fmtPlainDate(data.period.start)} – ${fmtPlainDate(data.period.end)}`),
          ' 有沒有發話。LINE 成員名單上有、這裡找不到的人，就是沒發話的人。',
        ]),
      ]),
      el('details', { class: 'mfold' }, [
        el('summary', {}, '怎麼對照、排序為什麼可能不一樣'),
        el('p', {}, coverage(data)),
        el('p', {}, 'LINE 沒有公布成員名單的排序規則，手機版與電腦版也不一樣；下面的排序方式挑一個跟你的 LINE 對得起來的，會記住。'),
        el('p', {}, '你幫好友改過的名字，LINE 顯示的是你改的那個，位置會不同，可以用搜尋找。'),
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
      clear(listSlot).append(emptyState(data.members.length ? '沒有符合條件的成員。' : '小判官還沒看過任何人。'));
      return;
    }
    clear(listSlot).append(el('ol', { class: 'mroster' }, shown.map((m) => el('li', {}, [
      el('span', { class: 'mroster__name' }, m.name || '（沒有名字）'),
      el('span', { class: 'mroster__meta' }, [
        m.group === 'spoke'
          ? el('span', { class: 'muted' }, `${m.days} 天・${m.messages} 則`)
          : m.join_at && m.group === 'new' && el('span', { class: 'muted' }, `${fmtDate(m.join_at)} 加入`),
        badge(GROUPS[m.group].label, GROUPS[m.group].tone),
      ]),
    ]))));
  }

  load();
  return { node, reload: load };
}
