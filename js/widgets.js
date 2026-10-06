/**
 * 兩種版面都會用到的小元件。跟 ui.js 的差別：ui.js 是通用零件（按鈕、對話框），
 * 這裡是這個後台自己的東西（可以編輯的一段文字、訊息預覽）。
 *
 * 元件只負責自己內部的結構與行為；它在頁面上放哪裡、長多寬，由桌面版與
 * 行動版各自的畫面與 CSS 決定。
 */

import { asyncButton, el, openModal, toast, toastError } from './ui.js';

/**
 * 一段可以編輯的文字：平常顯示內容與「編輯」鈕；按下去變成輸入框，同一顆按鈕
 * 變成「儲存」，旁邊多一顆「取消」（案主 2026-10-05 的規格）。
 *
 *   label      這一段叫什麼（顯示在標題列）
 *   value      目前的內容
 *   maxLength  字數上限
 *   onSave     async (新內容) => 儲存後的內容。失敗就丟例外，這裡會顯示錯誤並留在編輯狀態
 *   extra      標題列上「編輯」旁邊要多放的東西（節點或節點陣列）
 *   note       內容下方的小字說明
 *
 * 回傳 { node, isDirty() }。isDirty 是「正在編輯而且改過還沒存」。
 */
export function editableText({ label, value, maxLength, onSave, extra, note, emptyText = '（空白）' }) {
  let current = value ?? '';
  let editing = false;

  const body = el('div', { class: 'etext__body' });
  const actions = el('div', { class: 'etext__actions' });
  const node = el('section', { class: 'etext' }, [
    el('div', { class: 'etext__head' }, [
      el('div', { class: 'etext__label' }, label),
      actions,
    ]),
    body,
    note && el('div', { class: 'etext__note' }, note),
  ]);

  let textarea = null;

  function showView() {
    editing = false;
    textarea = null;
    node.classList.remove('is-editing');
    body.replaceChildren(
      current.trim()
        ? el('div', { class: 'etext__text' }, current)
        : el('div', { class: 'etext__text etext__text--empty' }, emptyText),
    );
    actions.replaceChildren(
      ...[].concat(extra ?? []),
      el('button', { class: 'btn', type: 'button', onClick: showEdit }, '編輯'),
    );
  }

  function showEdit() {
    editing = true;
    node.classList.add('is-editing');
    const counter = el('div', { class: 'etext__counter' });
    const updateCounter = () => {
      const length = textarea.value.length;
      counter.textContent = `${length} / ${maxLength} 字`;
      counter.classList.toggle('is-over', length > maxLength);
      save.setDisabled(length > maxLength);
    };
    textarea = el('textarea', { class: 'etext__input', 'aria-label': label, onInput: () => updateCounter() });
    textarea.value = current;

    const save = asyncButton('儲存', async () => {
      try {
        current = await onSave(textarea.value);
        showView();
        toast('已儲存');
      } catch (err) {
        toastError(err, '儲存失敗');
      }
    }, { class: 'btn btn--primary' });

    body.replaceChildren(textarea, counter);
    actions.replaceChildren(
      el('button', { class: 'btn btn--ghost', type: 'button', onClick: showView }, '取消'),
      save,
    );
    updateCounter();
    // 輸入框的高度跟著內容走，不要讓人在一個小框框裡捲動長文。
    const fit = () => {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.max(textarea.scrollHeight + 2, 120)}px`;
    };
    textarea.addEventListener('input', fit);
    fit();
    textarea.focus();
  }

  showView();
  return {
    node,
    isDirty: () => editing && textarea !== null && textarea.value !== current,
  };
}

/**
 * 「預覽」對話框：把幾則訊息畫成聊天室裡的樣子。
 * load 是 async () => string[]，打開之後才去要，對話框先出現。
 */
export function previewDialog(title, load) {
  openModal((close) => {
    const list = el('div', { class: 'chat' }, el('div', { class: 'chat__loading' }, '載入中…'));
    load().then((texts) => {
      list.replaceChildren(...(texts.length
        ? texts.map((text) => el('div', { class: 'chat__bubble' }, text))
        : [el('div', { class: 'chat__loading' }, '這一區的訊息都是空的，小判官不會發任何東西。')]));
    }).catch((err) => {
      list.replaceChildren(el('div', { class: 'chat__loading chat__loading--error' },
        `讀取失敗：${err?.message || '請稍後再試'}`));
    });
    return el('div', {}, [
      el('div', { class: 'modal__body' }, [
        el('div', { class: 'chat__hint' }, '小判官實際會發出去的樣子（變數已經換成現在的值）：'),
        list,
      ]),
      el('div', { class: 'modal__actions' },
        el('button', { class: 'btn btn--primary', type: 'button', onClick: () => close() }, '關閉')),
    ]);
  }, { title, wide: true });
}
