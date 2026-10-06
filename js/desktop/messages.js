/**
 * 桌面版｜訊息頁籤：小判官會發的每一則訊息，一則一塊，可以編輯。
 *
 * 沒有「推播」按鈕：推播到群組是按群組人數計費的，免費額度發沒幾次就用完
 * （案主 2026-10-06 決定不用）。訊息改成由管理員在群組叫小判官時才發——那是
 * 回覆，不計費——所以這裡提供的是「預覽」：發之前先看一眼實際的樣子。
 */

import { clear, el, loadFailed, spinner } from '../ui.js';
import { editableText, previewDialog } from '../widgets.js';
import { loadMessages, previewGroup, saveMessage } from '../logic/content.js';

export function createMessagesView() {
  const node = el('div', { class: 'view view--narrow' });
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
          label: group.blocks.length > 1 ? `第 ${index + 1} 則｜${block.name}` : '訊息內容',
          value: block.content,
          maxLength: data.max_length,
          onSave: (content) => saveMessage(block.id, content),
          emptyText: '（空白：這一則不會發出去）',
        });
        editors.push(editor);
        return editor.node;
      });
      return el('section', { class: 'group' }, [
        el('div', { class: 'group__head' }, [
          el('div', {}, [
            el('h2', {}, group.title),
            el('p', { class: 'muted' }, group.trigger),
          ]),
          el('button', {
            class: 'btn', type: 'button',
            onClick: () => previewDialog(`預覽｜${group.title}`, () => previewGroup(group.key)),
          }, '預覽'),
        ]),
        ...blocks,
      ]);
    });

    clear(node).append(
      el('div', { class: 'view__head' }, [
        el('h1', {}, '訊息'),
        el('p', {}, '小判官會發到群組的訊息。它不會主動推播——都是有人觸發時才回覆，所以不佔 LINE 的推播額度。'),
      ]),
      el('aside', { class: 'hintbox' }, [
        el('div', { class: 'hintbox__title' }, '訊息裡可以放變數，發出去的時候會換成實際的內容'),
        el('dl', { class: 'hintbox__list' }, data.variables.flatMap((v) => [
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
