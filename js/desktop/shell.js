/**
 * 桌面版的外殼：頂端一列（品牌、頁籤、讀取成員資料、帳號選單），下面是內容。
 *
 * 行動版的對應檔案是 js/mobile/shell.js。兩邊各寫各的版面，
 * 「按下去會發生什麼」則都交給 js/logic/。
 */

import { asyncButton, clear, el, toastError } from '../ui.js';
import { TABS, createNavigator } from '../logic/navigation.js';
import { refreshFromLine } from '../logic/members.js';
import { createRulesView } from './rules.js';
import { createCleanupView } from './cleanup.js';
import { createMessagesView } from './messages.js';
import { createMembersView } from './members.js';
import { createRosterView } from './roster.js';
import { createUnknownView } from './unknown.js';

/** 掛上去，回傳卸載用的函式。 */
export function mount(root, { user, brandMark, onLogout, onSwitchDevice }) {
  const content = el('main', { class: 'page' });
  const tabButtons = new Map();

  const nav = createNavigator({
    rules: createRulesView,
    cleanup: createCleanupView,
    messages: createMessagesView,
    members: () => createMembersView({ me: user.id }),
    roster: createRosterView,
    unknown: createUnknownView,
  }, (key, view) => {
    for (const [tabKey, button] of tabButtons) {
      button.classList.toggle('is-active', tabKey === key);
      button.setAttribute('aria-selected', String(tabKey === key));
    }
    clear(content).append(view.node);
    window.scrollTo(0, 0);
  });

  const tabs = el('nav', { class: 'tabs', role: 'tablist', 'aria-label': '功能' }, TABS.map((tab) => {
    const button = el('button', {
      class: 'tabs__tab', type: 'button', role: 'tab', onClick: () => nav.go(tab.key),
    }, tab.label);
    tabButtons.set(tab.key, button);
    return button;
  }));

  const refresh = asyncButton('讀取成員資料', async () => {
    try {
      await refreshFromLine();
      nav.view?.reload?.();
    } catch (err) {
      toastError(err, '讀取成員資料失敗');
    }
  }, { class: 'btn', title: '向 LINE 確認每位成員現在的名字，更新到資料庫' });

  // ── 帳號選單 ──
  const panel = el('div', { class: 'menu__panel', hidden: true }, [
    el('div', { class: 'menu__who' }, user.email),
    el('button', { class: 'menu__item', type: 'button', onClick: onSwitchDevice }, '切換到行動版'),
    el('button', { class: 'menu__item', type: 'button', onClick: onLogout }, '登出'),
  ]);
  const toggle = el('button', {
    class: 'btn btn--ghost menu__toggle', type: 'button', 'aria-haspopup': 'true',
    onClick: (event) => {
      // 不讓這一下冒泡到 document——下面那個「點別的地方就收起來」會把它立刻關掉。
      event.stopPropagation();
      panel.hidden = !panel.hidden;
    },
  }, [user.name || user.email, el('span', { class: 'menu__caret', 'aria-hidden': 'true' }, '▾')]);
  const closeMenu = () => { panel.hidden = true; };
  document.addEventListener('click', closeMenu);

  root.append(
    el('header', { class: 'topbar' }, el('div', { class: 'topbar__inner' }, [
      el('div', { class: 'topbar__brand' }, [brandMark(), '小判官']),
      tabs,
      el('div', { class: 'topbar__tools' }, [refresh, el('div', { class: 'menu' }, [toggle, panel])]),
    ])),
    content,
  );
  nav.start();

  return () => {
    document.removeEventListener('click', closeMenu);
    nav.destroy();
  };
}
