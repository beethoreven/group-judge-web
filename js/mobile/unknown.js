/**
 * 行動版｜未知發話頁籤：LINE 沒說是誰發的訊息，一則一張卡片，點下去指認發話者。
 * 能指認給誰、指認之後會怎樣，規則在 js/logic/unknown.js。
 */

import { asyncButton, clear, el, emptyState, loadFailed, spinner, toast, toastError } from '../ui.js';
import { fmtDateTime, fmtPlainDate } from '../format.js';
import { assign, describe, filterMessages, loadUnknown, pickSpeaker, unassign } from '../logic/unknown.js';

export function createUnknownView() {
  const node = el('div', { class: 'mview' });
  const filter = { show: 'open', keyword: '' };
  const listSlot = el('div', {});
  let data = null;

  async function load({ quiet = false } = {}) {
    if (!quiet) clear(node).append(spinner());
    try {
      data = await loadUnknown();
      render();
    } catch (err) {
      clear(node).append(loadFailed(err.message, load));
    }
  }

  async function act(work, done) {
    try {
      await work();
      toast(done);
    } catch (err) {
      toastError(err, '操作失敗');
    }
    await load({ quiet: true });
  }

  function render() {
    const open = data.messages.filter((m) => m.user_id === null).length;
    const show = el('select', {
      class: 'field', 'aria-label': '顯示哪些',
      onChange: (event) => {
        filter.show = event.target.value;
        renderList();
      },
    }, [['open', `還沒指認 ${open}`], ['done', `已指認 ${data.messages.length - open}`], ['all', '全部']]
      .map(([value, label]) => el('option', { value, selected: filter.show === value }, label)));
    const search = el('input', {
      class: 'field', type: 'search', placeholder: '搜尋內容', 'aria-label': '搜尋內容', value: filter.keyword,
      onInput: (event) => {
        filter.keyword = event.target.value;
        renderList();
      },
    });

    clear(node).append(...[
      el('div', { class: 'mview__head' }, [
        el('h1', {}, '未知發話'),
        el('p', {}, [
          el('strong', {}, `${fmtPlainDate(data.period.start)} – ${fmtPlainDate(data.period.end)}`),
          ' 裡 LINE 沒說是誰發的訊息。是待移除名單上的人發的就在這裡指認，他會移到白名單。',
        ]),
      ]),
      el('details', { class: 'mfold' }, [
        el('summary', {}, '為什麼只有時間和開頭幾個字'),
        el('p', {}, 'LINE 沒有給任何能認人的資料，連哪幾則是同一個人發的都看不出來——要對照群組的聊天紀錄才知道是誰。'),
      ]),
      data.assignable === null && el('div', { class: 'notice' },
        '這個月還沒儲存待移除名單。請先到「名單」頁籤儲存，才能指認。'),
      el('div', { class: 'mfilters' }, [search, show]),
      listSlot,
    ].filter(Boolean));
    renderList();
  }

  function renderList() {
    const shown = filterMessages(data.messages, filter);
    if (!shown.length) {
      clear(listSlot).append(emptyState(data.messages.length
        ? '沒有符合條件的訊息。'
        : '這段期間每一則訊息小判官都知道是誰發的。'));
      return;
    }
    clear(listSlot).append(el('div', { class: 'mcards' }, shown.map((m) => el('div', { class: 'ucard' }, [
      el('div', { class: 'ucard__time' }, fmtDateTime(m.at)),
      el('div', { class: 'ucard__text' }, describe(m)),
      el('div', { class: 'ucard__who' }, m.user_id !== null
        ? [el('span', {}, ['發話者：', el('strong', {}, m.user_name || '（沒有名字）')]),
          asyncButton('取消', () => act(() => unassign(m.id), '已取消指認'), { class: 'btn btn--small btn--ghost' })]
        : asyncButton('指認發話者', async () => {
          const person = await pickSpeaker(m, data.assignable ?? []);
          if (person) await act(() => assign(m.id, person.user_id), `已指認給「${person.name}」，他移到白名單了`);
        }, { class: 'btn btn--small', disabled: data.assignable === null })),
    ]))));
  }

  load();
  return { node, reload: load };
}
