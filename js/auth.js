/**
 * Google 登入與登入狀態。
 *
 * 流程：Google 只在登入當下驗證一次身分，換到後端簽發的 session token，
 * 之後所有 API 都帶那個 token。Google 的 ID token 效期只有約一小時，拿它當
 * 長效憑證會讓人每小時被登出一次——所以它用完就丟，不存、不重複使用。
 *
 * ★ 這裡與畫面上的鎖都只是化妝品：真正的把關在後端每一支路由的
 *   require_admin。用 devtools 繞過前端拿不到任何資料。
 */

import { api, ApiError, IS_LOCAL, getToken, setToken } from './api.js';

// Google OAuth 用戶端 ID。部署時由 index.html 的 window.__GOOGLE_CLIENT_ID__
// 提供，本機開發可以用 ?googleClientId= 覆寫。
//
// ★ 覆寫只在本機有效，理由同 js/api.js 的 ?apiBase=：正式站不讓網址決定
//   「跟誰登入、把憑證交給誰」。
const CLIENT_ID =
  (IS_LOCAL && new URLSearchParams(window.location.search).get('googleClientId')) ||
  window.__GOOGLE_CLIENT_ID__ ||
  '';

let currentUser = null;

export function getUser() {
  return currentUser;
}

/** 登入失敗的原因是「這個帳號不是管理員」。 */
export class NotPermitted extends Error {}

/**
 * 本機開發：接受 tools/dev_session.py 印出來的網址上帶的 session。
 *
 * ★ 只在 localhost 生效，正式站不會執行到。帶進來的 token 一樣要通過後端的
 *   查驗，隨便寫一串是沒用的。
 */
export function adoptDevSession() {
  if (!IS_LOCAL) return;
  const match = window.location.hash.match(/^#dev-session=([0-9a-f]{64})$/);
  if (!match) return;
  setToken(match[1]);
  history.replaceState(null, '', window.location.pathname + window.location.search);
}

/**
 * 用現有的 token 問後端「我是誰」。
 *
 * 回傳使用者，或 null（沒登入、憑證失效）。憑證還有效但帳號已經不是管理員時
 * 丟 NotPermitted，讓呼叫端可以告訴他原因。
 */
export async function restore() {
  currentUser = null;
  if (!getToken()) return null;
  let status;
  try {
    status = await api.get('/auth/status');
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      setToken(null);
      return null;
    }
    throw err; // 連不上之類的：不要因此把人登出
  }
  if (!status.authorized) {
    setToken(null);
    throw new NotPermitted();
  }
  currentUser = status;
  return currentUser;
}

/** 拿 Google ID token 換後端的 session token。 */
async function loginWithGoogle(idToken) {
  let result;
  try {
    result = await api.post('/auth/login', { id_token: idToken });
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) throw new NotPermitted();
    throw err;
  }
  setToken(result.session_token);
  currentUser = result;
  return currentUser;
}

export async function logout() {
  try {
    await api.post('/auth/logout');
  } catch {
    // 後端說不行也沒關係——本地清掉 token，登出的目的就達成了
  }
  setToken(null);
  currentUser = null;
  // Google 那一側能做的只有這一件事：關掉「下次自動用同一個帳號登入」。
  try {
    window.google?.accounts?.id?.disableAutoSelect?.();
  } catch {
    // Google 的 script 還沒載到就算了
  }
}

/** 本地把登入狀態清掉，不通知後端。帳號被拿掉權限時用。 */
export function forgetLogin() {
  setToken(null);
  currentUser = null;
}

/**
 * 掛載 Google 登入按鈕。登入成功呼叫 onSuccess(user)，失敗呼叫 onError(err)。
 *
 * Google Identity Services 的 script 由 index.html 載入；這裡等它就緒再初始化，
 * 避免因為載入順序而拿不到 window.google。
 */
export function renderGoogleButton(container, { onSuccess, onError }) {
  if (!CLIENT_ID) {
    container.textContent = '尚未設定 Google 用戶端 ID（index.html 的 __GOOGLE_CLIENT_ID__）';
    return;
  }

  const start = () => {
    window.google.accounts.id.initialize({
      client_id: CLIENT_ID,
      callback: async (response) => {
        try {
          onSuccess(await loginWithGoogle(response.credential));
        } catch (err) {
          onError(err);
        }
      },
    });
    window.google.accounts.id.renderButton(container, {
      theme: 'outline',
      size: 'large',
      shape: 'pill',
      text: 'signin_with',
      locale: 'zh_TW',
    });
  };

  if (window.google?.accounts?.id) {
    start();
    return;
  }
  // script 還沒載完，等它。這段只在登入畫面跑，等到了或十秒到了就停。
  const timer = setInterval(() => {
    if (window.google?.accounts?.id) {
      clearInterval(timer);
      clearTimeout(giveUp);
      start();
    }
  }, 100);
  const giveUp = setTimeout(() => {
    clearInterval(timer);
    container.textContent = 'Google 登入元件載入失敗，請重新整理頁面。';
  }, 10000);
}
