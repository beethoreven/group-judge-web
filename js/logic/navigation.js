/**
 * 頁籤：有哪幾個、現在在哪一個、切換時要注意什麼。兩種版面共用。
 *
 * 頁籤列長什麼樣子（桌面版在上面一排、行動版在底部）是各自外殼的事；
 * 這裡管的是切換這件事本身。
 */

import { confirmDialog } from '../ui.js';

/** 所有頁籤。short 是行動版底部那一排用的短名字。 */
export const TABS = [
  { key: 'rules', label: '版規', short: '版規' },
  { key: 'cleanup', label: '待移除名單', short: '名單' },
  { key: 'messages', label: '訊息', short: '訊息' },
  { key: 'members', label: '成員', short: '成員' },
  { key: 'roster', label: '發話對照', short: '對照' },
  { key: 'unknown', label: '未知發話', short: '未知' },
];

const KEYS = TABS.map((t) => t.key);

/** 網址上的 #cleanup 之類。重新整理之後留在同一個頁籤。 */
function tabFromUrl() {
  const key = window.location.hash.replace(/^#/, '');
  return KEYS.includes(key) ? key : TABS[0].key;
}

export function confirmDiscard() {
  return confirmDialog({
    title: '還有沒儲存的變更',
    body: '離開這一頁的話，剛才的變更會不見。',
    confirmText: '不存了，離開',
    cancelText: '留在這裡',
    danger: true,
  });
}

/**
 * builders 是 { 頁籤 key: () => 畫面 }。每個畫面是：
 *
 *   node         要掛上去的節點
 *   hasUnsaved?  () => boolean，有沒有還沒儲存的東西
 *   reload?      () => void，成員資料變了之後重新載入
 *
 * onShow(key, view) 在每次換頁籤時被呼叫，由外殼把 view.node 掛上去、
 * 把頁籤列的反白移過去。
 */
export function createNavigator(builders, onShow) {
  let key = null;
  let view = null;

  async function go(next) {
    if (next === key) return;
    if (view?.hasUnsaved?.() && !(await confirmDiscard())) return;
    key = next;
    view = builders[next]();
    history.replaceState(null, '', `#${next}`);
    onShow(key, view);
  }

  // 關掉分頁或重新整理時，也提醒一次還有東西沒存。
  const beforeUnload = (event) => {
    if (view?.hasUnsaved?.()) event.preventDefault();
  };
  window.addEventListener('beforeunload', beforeUnload);

  return {
    go,
    start: () => go(tabFromUrl()),
    get key() { return key; },
    get view() { return view; },
    /** 登出、被踢回登入頁時呼叫。 */
    destroy() {
      window.removeEventListener('beforeunload', beforeUnload);
      view = null;
      key = null;
    },
  };
}
