/**
 * 兩種版面共用的畫面工具：建 DOM、toast、對話框。
 *
 * 這裡只有「跟版面無關」的零件。桌面版與行動版長得不一樣的地方（對話框是置中
 * 還是從底部滑上來）交給各自的 CSS 決定，這一支不分裝置。
 *
 * ★ 刻意不用樣板字串 + innerHTML 組畫面：成員的 LINE 名稱、版規、訊息內容都是
 *   別人可以自由輸入的字，拼進 innerHTML 就是一個 XSS 洞。這裡一律用
 *   createElement + textContent，內容永遠是文字、不會被當成標記解析。
 */

/**
 * el('div', {class: 'card'}, [子元素或字串...])
 * 屬性名用 DOM 的寫法（class 例外）；on 開頭的屬性當成事件監聽器。
 */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'disabled' || key === 'checked' || key === 'selected' || key === 'hidden') {
      node[key] = Boolean(value);
    } else if (key === 'value') {
      node.value = value;
    } else {
      node.setAttribute(key, value === true ? '' : value);
    }
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function clear(node) {
  node.replaceChildren();
  return node;
}

/**
 * 把 node 的內容整個換成 children。
 *
 * ★ 有「可能沒有」的子節點時用這一支，不要用原生的 append：原生的 append(null)
 *   不會略過，而是在畫面上印出「null」四個字。這裡跟 el() 一樣，null、
 *   undefined、false 都當成「沒有這一塊」。
 */
export function setChildren(node, children) {
  node.replaceChildren(
    ...[].concat(children).filter((c) => c !== null && c !== undefined && c !== false),
  );
  return node;
}

/** 載入中。資料回來之前顯示這個，不要先放一個空的畫面——那會被當成「沒有資料」。 */
export function spinner(label = '載入中…') {
  return el('div', { class: 'loading' }, [
    el('div', { class: 'spinner', 'aria-hidden': 'true' }),
    el('div', {}, label),
  ]);
}

/**
 * 讀取失敗。★ 跟「沒有資料」是兩句不同的話，不能共用同一個畫面：
 * 一個空的清單看起來像「本來就沒有」，沒有人會去懷疑它其實是壞了。
 */
export function loadFailed(message, onRetry) {
  return el('div', { class: 'load-failed' }, [
    el('div', { class: 'load-failed__title' }, '讀取失敗'),
    el('div', { class: 'load-failed__detail' }, message),
    onRetry && el('button', { class: 'btn', type: 'button', onClick: onRetry }, '再試一次'),
  ]);
}

export function emptyState(message) {
  return el('div', { class: 'empty' }, message);
}

/** 小標籤。tone: neutral／warn／danger／ok／ink */
export function badge(text, tone = 'neutral', title) {
  return el('span', { class: `badge badge--${tone}`, title }, text);
}

/**
 * 會打 API 的按鈕。按下去之後停用並顯示忙碌，跑完才恢復。
 *
 * ★ 防連點靠的就是 disabled 本身——disabled 的按鈕不會派送 click。
 * ★ finally 不能省：API 失敗時按鈕一樣要復原，否則會留下一個再也點不動的東西。
 */
export function asyncButton(label, fn, attrs = {}) {
  const { class: cls = 'btn', ...rest } = attrs;
  const btn = el('button', {
    class: cls,
    type: 'button',
    ...rest,
    onClick: async (event) => {
      if (btn.disabled) return;
      btn.disabled = true;
      btn.classList.add('is-busy');
      try {
        await fn(event);
      } finally {
        btn.classList.remove('is-busy');
        // 忙碌期間別人可能已經重新決定了這顆按鈕該不該停用（setDisabled），
        // 照那個決定來，不是一律打開。
        btn.disabled = btn.dataset.wantDisabled === '1';
      }
    },
  }, label);
  btn.setDisabled = (value) => {
    btn.dataset.wantDisabled = value ? '1' : '';
    if (!btn.classList.contains('is-busy')) btn.disabled = Boolean(value);
  };
  if (attrs.disabled) btn.setDisabled(true);
  return btn;
}

// ── Toast ─────────────────────────────────────────────────

let toastLayer = null;

export function toast(message, { error = false, duration = error ? 5000 : 3200 } = {}) {
  if (!toastLayer) {
    toastLayer = el('div', { class: 'toast-layer', role: 'status', 'aria-live': 'polite' });
    document.body.append(toastLayer);
  }
  // 同一句話已經在畫面上就不再疊一則——同一個錯誤常常會從兩個地方各報一次
  // （例如資料庫逾時：api.js 統一報一次，按鈕自己的失敗處理又報一次）。
  if ([...toastLayer.children].some((shown) => shown.textContent === message)) return;
  const node = el('div', { class: `toast${error ? ' toast--error' : ''}` }, message);
  toastLayer.append(node);
  setTimeout(() => node.remove(), duration);
}

/** API 失敗時的統一說法。 */
export function toastError(err, fallback = '操作失敗') {
  toast(err?.message || fallback, { error: true });
}

// ── 對話框 ────────────────────────────────────────────────

/** 目前掛在畫面上的對話框，後開的在後面。 */
const openModals = [];

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || !openModals.length) return;
  const top = openModals[openModals.length - 1];
  if (top.dismissible) top.close(undefined);
});

/**
 * 開一個對話框，回傳 { close, done }。done 是關閉時 resolve 的 Promise，
 * 值是傳給 close() 的那個（按 Esc 或點遮罩關閉是 undefined）。
 *
 * build(close) 回傳對話框的內容節點。
 */
export function openModal(build, { title, wide = false, dismissible = true } = {}) {
  let resolve;
  const done = new Promise((r) => { resolve = r; });

  const entry = { dismissible, close: null };
  const close = (result) => {
    const index = openModals.indexOf(entry);
    if (index === -1) return; // 已經關過了
    openModals.splice(index, 1);
    layer.remove();
    resolve(result);
  };
  entry.close = close;

  const layer = el('div', {
    class: 'modal-layer',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': title,
    // 只有點在遮罩本身（不是對話框內部）才關閉
    onClick: (event) => { if (dismissible && event.target === layer) close(undefined); },
  }, el('div', { class: `modal${wide ? ' modal--wide' : ''}` }, [
    title && el('div', { class: 'modal__title' }, title),
    build(close),
  ]));

  openModals.push(entry);
  document.body.append(layer);
  return { close, done };
}

/**
 * 確認對話框。回傳 Promise<boolean>。
 *
 * 用在「按下去會改到別人」或需要先警告的操作。一般的結果提示用 toast 就好，
 * 不要動不動就跳對話框擋住畫面。
 */
export function confirmDialog({ title, body, confirmText = '是', cancelText = '否', danger = false }) {
  const { done } = openModal((close) => {
    const confirmBtn = el('button', {
      class: `btn ${danger ? 'btn--danger' : 'btn--primary'}`,
      type: 'button',
      onClick: () => close(true),
    }, confirmText);
    // 等掛上去之後才能 focus。預設焦點放在「確認」，Enter 就是確認、Esc 是取消。
    queueMicrotask(() => confirmBtn.focus());
    return el('div', {}, [
      body && el('div', { class: 'modal__body' }, body),
      el('div', { class: 'modal__actions' }, [
        cancelText && el('button', { class: 'btn btn--ghost', type: 'button', onClick: () => close(false) }, cancelText),
        confirmBtn,
      ]),
    ]);
  }, { title });
  return done.then((result) => result === true);
}

/** 把一段文字照換行切成幾個段落節點（保留空行）。 */
export function paragraphs(text) {
  return String(text).split('\n').map((line) => el('div', { class: 'para' }, line || ' '));
}
