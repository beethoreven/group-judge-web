// 自動產生（demo-en/tools/build.py），來源是 js/logic/unknown.js。不要手改：改 demo-en/tools/translations.py 再重跑。
/**
 * 未知發話：LINE 沒告訴小判官是誰發的訊息，由管理員指認。兩種版面共用。
 *
 * 規則：
 *   - 只能指認給這個月存好的待移除名單上的人——本來就有發話紀錄的人不需要指認。
 *     所以要先在「待移除名單」存過名單。
 *   - 被指認的人算有發話，從名單移到白名單。
 *
 * 能拿來認人的線索只有時間與訊息開頭：LINE 的事件裡沒有任何別的東西可以分辨
 * 發話者，連「這兩則是同一個人」都看不出來。
 */

import { api } from '../api.js';
import { el, emptyState, openModal } from '../ui.js';
import { fmtDateTime, fmtDays } from '../format.js';

export const loadUnknown = () => api.get('/api/unknown');
export const assign = (messageId, userId) =>
  api.post(`/api/unknown/${encodeURIComponent(messageId)}/assign`, { user_id: userId });
export const unassign = (messageId) =>
  api.post(`/api/unknown/${encodeURIComponent(messageId)}/unassign`);

/**
 * 統計區間結束之後到現在的狀況，一句話。這些訊息要到下次整理才會列出來，但數字
 * 現在就看得到——想知道某一種發話方式（例如電腦版）認不認得出人，發一則之後
 * 看這個數字有沒有增加就知道了。
 */
export function laterNote(data) {
  return data.later
    ? `Since the review period ended, ${data.later} more messages arrived without a known sender; they show up here at the next cleanup.`
    : 'Since the review period ended, Group Judge has known the sender of every message.';
}

const KIND_LABEL = {
  sticker: 'Sticker', image: 'Image', video: 'Video', audio: 'Voice', file: 'File', location: 'Location',
};

/** 一則訊息要顯示的內容：文字就是開頭那幾個字，其他種類加上標示。 */
export function describe(message) {
  if (message.kind === 'text') return message.preview || '(empty message)';
  const label = KIND_LABEL[message.kind] ?? 'Other';
  return message.preview ? `[${label}] ${message.preview}` : `[${label}]`;
}

export function filterMessages(messages, { keyword = '', show = 'open' } = {}) {
  const key = keyword.trim().toLowerCase();
  return messages.filter((m) =>
    (show === 'all' || (show === 'open') === (m.user_id === null)) &&
    (!key || describe(m).toLowerCase().includes(key) || (m.user_name || '').toLowerCase().includes(key)));
}

/**
 * 「指認給誰」的對話框：從待移除名單上的人裡面挑一個。
 * 回傳 Promise<成員 | null>。
 */
export function pickSpeaker(message, people) {
  const { done } = openModal((close) => {
    const list = el('div', { class: 'choices' });
    const render = (keyword) => {
      const key = keyword.trim().toLowerCase();
      const shown = people.filter((p) => !key || (p.name || '').toLowerCase().includes(key));
      list.replaceChildren(...(shown.length
        ? shown.map((p) => el('button', { class: 'choices__item', type: 'button', onClick: () => close(p) }, [
          el('span', { class: 'choices__name' }, p.name || '(no name)'),
          el('span', { class: 'muted' }, `Silent ${fmtDays(p.silent_days)}`),
        ]))
        : [emptyState(people.length ? 'No one matches.' : 'No one left on the list to identify.')]));
    };
    render('');
    return el('div', {}, [
      el('div', { class: 'modal__body' }, [
        el('div', { class: 'quote' }, [
          el('div', { class: 'muted' }, fmtDateTime(message.at)),
          el('div', {}, describe(message)),
        ]),
        el('p', {}, 'Who sent this? Once chosen, they count as having spoken and move from the removal list to the whitelist.'),
        el('input', {
          class: 'field', type: 'search', placeholder: 'Search people on the list', 'aria-label': 'Search people on the list',
          onInput: (event) => render(event.target.value),
        }),
        list,
      ]),
      el('div', { class: 'modal__actions' },
        el('button', { class: 'btn btn--ghost', type: 'button', onClick: () => close(null) }, 'Cancel')),
    ]);
  }, { title: 'Identify sender', wide: true });
  return done.then((person) => person ?? null);
}
