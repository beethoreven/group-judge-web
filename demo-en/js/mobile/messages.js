// 自動產生（demo-en/tools/build.py），來源是 js/mobile/messages.js。不要手改：改 demo-en/tools/translations.py 再重跑。
/**
 * 行動版｜訊息頁籤：小判官會發的每一則訊息，一則一塊，可以編輯。
 *
 * 跟桌面版一樣沒有「推播」按鈕（理由見 js/desktop/messages.js 開頭），
 * 每一區有一顆「預覽」。變數說明預設收合，螢幕小，不要讓它佔掉第一屏。
 */

import { clear, el, loadFailed, spinner } from '../ui.js';
import { editableText, previewDialog } from '../widgets.js';
import { loadMessages, previewGroup, saveMessage } from '../logic/content.js';

export function createMessagesView() {
  const node = el('div', { class: 'mview' });
  let editors = [];

  async function load() {
    clear(node).append(spinner());
    try {
      render(await loadMessages());
    } catch (err) {
      clear(node).append(loadFailed(err.message, load));
    }
  }

  function render(data) {
    editors = [];
    const sections = data.groups.map((group) => {
      const blocks = group.blocks.map((block, index) => {
        const editor = editableText({
          // 只有一則的區塊，名字跟區塊標題是同一個詞，不必再寫一次。
          label: group.blocks.length > 1 ? `Message ${index + 1} | ${block.name}` : 'Message',
          value: block.content,
          maxLength: data.max_length,
          onSave: (content) => saveMessage(block.id, content),
          emptyText: '(empty: this one is not sent)',
        });
        editors.push(editor);
        return editor.node;
      });
      return el('section', { class: 'mgroup' }, [
        el('div', { class: 'mgroup__head' }, [
          el('h2', {}, group.title),
          el('button', {
            class: 'btn btn--small', type: 'button',
            onClick: () => previewDialog(`Preview | ${group.title}`, () => previewGroup(group.key)),
          }, 'Preview'),
        ]),
        el('p', { class: 'muted mgroup__trigger' }, group.trigger),
        ...blocks,
      ]);
    });

    clear(node).append(
      el('div', { class: 'mview__head' }, [
        el('h1', {}, 'Messages'),
        el('p', {}, 'Messages Group Judge posts to the group. It only replies when triggered, so it uses no push quota.'),
      ]),
      el('details', { class: 'mfold' }, [
        el('summary', {}, 'Variables you can use in messages'),
        el('dl', { class: 'mvars' }, data.variables.flatMap((v) => [
          el('dt', {}, el('code', {}, v.name)),
          el('dd', {}, v.meaning),
        ])),
      ]),
      ...sections,
    );
  }

  load();
  return { node, hasUnsaved: () => editors.some((editor) => editor.isDirty()) };
}
