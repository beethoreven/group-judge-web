// 自動產生（demo-en/tools/build.py），來源是 js/mobile/unknown.js。不要手改：改 demo-en/tools/translations.py 再重跑。
/**
 * 行動版｜未知發話頁籤：LINE 沒說是誰發的訊息，一則一張卡片，點下去指認發話者。
 * 能指認給誰、指認之後會怎樣，規則在 js/logic/unknown.js。
 */

import { asyncButton, clear, el, emptyState, loadFailed, spinner, toast, toastError } from '../ui.js';
import { fmtDateTime, fmtPlainDate } from '../format.js';
import { assign, describe, filterMessages, laterNote, loadUnknown, pickSpeaker, unassign } from '../logic/unknown.js';

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
      toastError(err, 'Something went wrong');
    }
    await load({ quiet: true });
  }

  function render() {
    const open = data.messages.filter((m) => m.user_id === null).length;
    const show = el('select', {
      class: 'field', 'aria-label': 'Show',
      onChange: (event) => {
        filter.show = event.target.value;
        renderList();
      },
    }, [['open', `Open ${open}`], ['done', `Done ${data.messages.length - open}`], ['all', 'All']]
      .map(([value, label]) => el('option', { value, selected: filter.show === value }, label)));
    const search = el('input', {
      class: 'field', type: 'search', placeholder: 'Search content', 'aria-label': 'Search content', value: filter.keyword,
      onInput: (event) => {
        filter.keyword = event.target.value;
        renderList();
      },
    });

    clear(node).append(...[
      el('div', { class: 'mview__head' }, [
        el('h1', {}, 'Unknown Senders'),
        el('p', {}, [
          el('strong', {}, `${fmtPlainDate(data.period.start)} – ${fmtPlainDate(data.period.end)}`),
          ': messages LINE didn’t name a sender for. If one came from someone on the removal list, identify them here and they move to the whitelist.',
        ]),
        el('p', { class: 'muted' }, laterNote(data)),
      ]),
      el('details', { class: 'mfold' }, [
        el('summary', {}, 'Why only the time and the first few words?'),
        el('p', {}, 'LINE gives nothing to identify anyone — not even which messages came from the same person. Check the group’s chat history to find out.'),
      ]),
      data.assignable === null && el('div', { class: 'notice' },
        'This month’s removal list hasn’t been saved yet. Save it on the List tab first, then you can identify senders.'),
      el('div', { class: 'mfilters' }, [search, show]),
      listSlot,
    ].filter(Boolean));
    renderList();
  }

  function renderList() {
    const shown = filterMessages(data.messages, filter);
    if (!shown.length) {
      clear(listSlot).append(emptyState(data.messages.length
        ? 'No messages match.'
        : 'Group Judge knew the sender of every message in this period.'));
      return;
    }
    clear(listSlot).append(el('div', { class: 'mcards' }, shown.map((m) => el('div', { class: 'ucard' }, [
      el('div', { class: 'ucard__time' }, fmtDateTime(m.at)),
      el('div', { class: 'ucard__text' }, describe(m)),
      el('div', { class: 'ucard__who' }, m.user_id !== null
        ? [el('span', {}, ['Sender: ', el('strong', {}, m.user_name || '(no name)')]),
          asyncButton('Undo', () => act(() => unassign(m.id), 'Identification undone'), { class: 'btn btn--small btn--ghost' })]
        : asyncButton('Identify sender', async () => {
          const person = await pickSpeaker(m, data.assignable ?? []);
          if (person) await act(() => assign(m.id, person.user_id), `Identified as “${person.name}”, who moved to the whitelist`);
        }, { class: 'btn btn--small', disabled: data.assignable === null })),
    ]))));
  }

  load();
  return { node, reload: load };
}
