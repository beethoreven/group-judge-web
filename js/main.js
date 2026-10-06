/**
 * 進入點：確認登入 → 判斷裝置 → 載入對應的那一套畫面。
 *
 * 沒登入的時候整頁只有一顆登入按鈕（案主 2026-10-05）。登入而且是管理員，
 * 才會去載入 js/desktop/ 或 js/mobile/ 底下的東西——兩套畫面各自獨立，
 * 沒用到的那一套連程式都不會下載。
 *
 *   js/api.js、auth.js、ui.js、widgets.js、format.js、logic/   兩種版面共用
 *   js/desktop/ + css/desktop.css                              桌面版
 *   js/mobile/  + css/mobile.css                               行動版
 */

import { setAuthHandlers } from './api.js';
import { NotPermitted, adoptDevSession, forgetLogin, logout, renderGoogleButton, restore } from './auth.js';
import { detectDevice, switchDevice } from './device.js';
import { clear, el, loadFailed, openModal, spinner, toast, toastError } from './ui.js';

const app = document.getElementById('app');
const NO_PERMISSION = '這個帳號沒有使用權限';

/** 目前掛著的外殼的卸載函式。在登入畫面時是 null。 */
let unmountShell = null;

function brandMark() {
  return el('span', { class: 'brand__mark', 'aria-hidden': 'true' }, '判');
}

// ── 登入畫面 ──────────────────────────────────────────────

function showLogin() {
  unmountShell?.();
  unmountShell = null;
  delete document.documentElement.dataset.device;

  const slot = el('div', { class: 'login__button' });
  clear(app).append(el('main', { class: 'login' }, el('div', { class: 'login__card' }, [
    el('div', { class: 'login__brand' }, [brandMark(), el('span', {}, '小判官')]),
    el('div', { class: 'login__hint' }, '群組整理後台'),
    slot,
  ])));
  renderGoogleButton(slot, { onSuccess: showApp, onError: loginFailed });
}

function loginFailed(err) {
  if (err instanceof NotPermitted) toast(NO_PERMISSION, { error: true });
  else toastError(err, '登入失敗');
}

// ── 登入之後 ──────────────────────────────────────────────

function loadStylesheet(href) {
  return new Promise((resolve) => {
    const existing = document.getElementById('device-css');
    if (existing?.getAttribute('href') === href) {
      resolve();
      return;
    }
    existing?.remove();
    const link = el('link', { id: 'device-css', rel: 'stylesheet', href });
    // 載入失敗也照樣往下走：沒有樣式的畫面還看得出哪裡壞了，白畫面看不出來。
    link.addEventListener('load', resolve);
    link.addEventListener('error', resolve);
    document.head.append(link);
  });
}

async function showApp(user) {
  kickingOut = false;
  const device = detectDevice();
  clear(app).append(spinner());
  try {
    const [shell] = await Promise.all([
      import(`./${device}/shell.js`),
      loadStylesheet(`css/${device}.css`),
    ]);
    document.documentElement.dataset.device = device;
    unmountShell?.();
    unmountShell = shell.mount(clear(app), {
      user,
      brandMark,
      onLogout: async () => {
        await logout();
        showLogin();
      },
      onSwitchDevice: () => switchDevice(device === 'mobile' ? 'desktop' : 'mobile'),
    });
  } catch (err) {
    clear(app).append(loadFailed(err?.message || '畫面載入失敗', () => showApp(user)));
  }
}

// ── 用到一半憑證失效 ──────────────────────────────────────

/**
 * API 回 401：請使用者當場重新登入，畫面留在原地。登入成功回傳 true，
 * api.js 會把剛才失敗的請求重送一次。
 */
function reauthenticate() {
  const { done } = openModal((close) => {
    const slot = el('div', { class: 'login__button' });
    renderGoogleButton(slot, {
      onSuccess: () => close(true),
      onError: (err) => {
        loginFailed(err);
        if (err instanceof NotPermitted) close(false);
      },
    });
    return el('div', {}, [
      el('div', { class: 'modal__body' }, [
        el('p', {}, '登入已經失效，請重新登入。畫面上還沒儲存的內容都還在，登入後會接著做完剛才的動作。'),
        slot,
      ]),
      el('div', { class: 'modal__actions' },
        el('button', { class: 'btn btn--ghost', type: 'button', onClick: () => close(false) }, '回到登入頁')),
    ]);
  }, { title: '請重新登入', dismissible: false });

  return done.then((ok) => {
    if (ok !== true) showLogin();
    return ok === true;
  });
}

// 好幾個請求同時收到 403 時，只處理第一個。下次成功進到後台時（showApp）才重設。
let kickingOut = false;

/** API 回 403：這個帳號已經不是管理員了。講一聲，清掉登入資訊，回登入頁。 */
function forbidden() {
  if (kickingOut) return;
  kickingOut = true;
  toast(NO_PERMISSION, { error: true });
  forgetLogin();
  showLogin();
}

// ── 啟動 ──────────────────────────────────────────────────

async function start() {
  setAuthHandlers({ reauthenticate, forbidden });
  adoptDevSession();
  clear(app).append(spinner());

  let user = null;
  try {
    user = await restore();
  } catch (err) {
    if (err instanceof NotPermitted) {
      toast(NO_PERMISSION, { error: true });
    } else {
      // 連不上後端。不要當成沒登入——那會讓人白白重登一次，而且一樣連不上。
      clear(app).append(loadFailed(err?.message || '連不上伺服器', start));
      return;
    }
  }
  if (user) await showApp(user);
  else showLogin();
}

// 啟動過程任何沒料到的錯誤都要顯示出來。少了這一段，畫面會永遠停在轉圈圈，
// 而錯誤只躺在主控台裡——使用者那邊什麼都看不出來。
start().catch((err) => {
  console.error(err);
  clear(app).append(loadFailed(err?.message || '啟動失敗', () => window.location.reload()));
});
