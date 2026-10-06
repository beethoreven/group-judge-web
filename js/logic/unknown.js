/**
 * 未知發話：LINE 沒告訴小判官是誰發的訊息，由管理員指認。兩種版面共用。
 *
 * 規則（案主 2026-10-06）：
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
    ? `統計區間之後到現在，另外收到 ${data.later} 則認不出發話者的訊息，下次整理時才會列在這裡。`
    : '統計區間之後到現在，每一則訊息小判官都知道是誰發的。';
}

const KIND_LABEL = {
  sticker: '貼圖', image: '圖片', video: '影片', audio: '語音', file: '檔案', location: '位置',
};

/** 一則訊息要顯示的內容：文字就是開頭那幾個字，其他種類加上標示。 */
export function describe(message) {
  if (message.kind === 'text') return message.preview || '（空白訊息）';
  const label = KIND_LABEL[message.kind] ?? '其他';
  return message.preview ? `［${label}］${message.preview}` : `［${label}］`;
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
          el('span', { class: 'choices__name' }, p.name || '（沒有名字）'),
          el('span', { class: 'muted' }, `未發話 ${fmtDays(p.silent_days)}`),
        ]))
        : [emptyState(people.length ? '找不到符合的人。' : '名單上已經沒有人可以指認了。')]));
    };
    render('');
    return el('div', {}, [
      el('div', { class: 'modal__body' }, [
        el('div', { class: 'quote' }, [
          el('div', { class: 'muted' }, fmtDateTime(message.at)),
          el('div', {}, describe(message)),
        ]),
        el('p', {}, '這一則是誰發的？選了之後，他會算成有發話，並從待移除名單移到白名單。'),
        el('input', {
          class: 'field', type: 'search', placeholder: '搜尋名單上的人', 'aria-label': '搜尋名單上的人',
          onInput: (event) => render(event.target.value),
        }),
        list,
      ]),
      el('div', { class: 'modal__actions' },
        el('button', { class: 'btn btn--ghost', type: 'button', onClick: () => close(null) }, '取消')),
    ]);
  }, { title: '指認發話者', wide: true });
  return done.then((person) => person ?? null);
}
