/**
 * 行動版的外殼：上面一條（品牌、讀取成員資料、選單），中間是內容，
 * 頁籤在螢幕最底下一排——拇指碰得到的地方。
 *
 * 桌面版的對應檔案是 js/desktop/shell.js。兩邊各寫各的版面，
 * 「按下去會發生什麼」則都交給 js/logic/。
 */

import { asyncButton, clear, el, openModal, toastError } from '../ui.js';
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
  const content = el('main', { class: 'mpage' });
  // 某些頁籤（待移除名單）有固定在頁籤列上方的操作列，放在這一格。
  const actionSlot = el('div', { class: 'mactions' });
  const tabButtons = new Map();

  const nav = createNavigator({
    rules: createRulesView,
    cleanup: createCleanupView,
    messages: createMessagesView,
    members: createMembersView,
    roster: createRosterView,
    unknown: createUnknownView,
  }, (key, view) => {
    for (const [tabKey, button] of tabButtons) {
      button.classList.toggle('is-active', tabKey === key);
      button.setAttribute('aria-selected', String(tabKey === key));
    }
    clear(content).append(view.node);
    clear(actionSlot);
    if (view.actions) actionSlot.append(view.actions);
    root.classList.toggle('has-actions', Boolean(view.actions));
    window.scrollTo(0, 0);
  });

  const refresh = asyncButton('讀取成員資料', async () => {
    try {
      await refreshFromLine();
      nav.view?.reload?.();
    } catch (err) {
      toastError(err, '讀取成員資料失敗');
    }
  }, { class: 'btn btn--small' });

  const menuButton = el('button', {
    class: 'btn btn--ghost btn--small mbar__menu', type: 'button', 'aria-label': '選單',
    onClick: () => openModal((close) => el('div', {}, [
      el('div', { class: 'modal__body' }, [
        el('div', { class: 'msheet__who' }, [user.name && el('strong', {}, user.name), el('div', {}, user.email)]),
        el('div', { class: 'msheet__list' }, [
          el('button', {
            class: 'btn', type: 'button',
            onClick: () => { close(); onSwitchDevice(); },
          }, '切換到桌面版'),
          el('button', {
            class: 'btn', type: 'button',
            onClick: () => { close(); onLogout(); },
          }, '登出'),
        ]),
      ]),
      el('div', { class: 'modal__actions' },
        el('button', { class: 'btn btn--ghost', type: 'button', onClick: () => close() }, '關閉')),
    ]), { title: '帳號' }),
  }, '⋯');

  root.classList.add('mroot');
  root.append(
    el('header', { class: 'mbar' }, [
      el('div', { class: 'mbar__brand' }, [brandMark(), '小判官']),
      el('div', { class: 'mbar__tools' }, [refresh, menuButton]),
    ]),
    content,
    el('footer', { class: 'mfoot' }, [
      actionSlot,
      el('nav', { class: 'mtabs', role: 'tablist', 'aria-label': '功能' }, TABS.map((tab) => {
        const button = el('button', {
          class: 'mtabs__tab', type: 'button', role: 'tab', onClick: () => nav.go(tab.key),
        }, tab.short);
        tabButtons.set(tab.key, button);
        return button;
      })),
    ]),
  );
  nav.start();

  return () => {
    root.classList.remove('mroot', 'has-actions');
    nav.destroy();
  };
}
