// 自動產生（demo-en/tools/build.py），來源是 demo/auth.js。不要手改：改 demo-en/tools/translations.py 再重跑。
/**
 * 示範版的 js/auth.js：介面一模一樣，但不跟後端換憑證。
 *
 * 用 Google 登入的話，只在瀏覽器裡讀出 email 拿來顯示，ID token 不送去任何地方。
 * 不管登入的是哪個帳號（包含真正的管理員），進來的都是同一位「示範使用者」：
 * 成員名單裡身分是「一般成員」的那一筆，看到的全是 demo/data.js 的假資料。
 */

import { demoUser, rememberDemoUser } from './session.js';

const CLIENT_ID = window.__GOOGLE_CLIENT_ID__ || '';
const FALLBACK_EMAIL = 'guest@example.com';

let currentUser = null;

const asUser = ({ email }) => ({ id: 1, name: 'Demo User', email, authorized: true });

export function getUser() {
  return currentUser;
}

export class NotPermitted extends Error {}

export function adoptDevSession() {}

export async function restore() {
  const saved = demoUser();
  currentUser = saved && asUser(saved);
  return currentUser;
}

function enter(email) {
  rememberDemoUser({ email });
  currentUser = asUser({ email });
  return currentUser;
}

/** Google 給的 ID token 是 JWT：中間那段 base64url 是 JSON，裡面有 email。不驗簽——只拿來顯示。 */
function emailFrom(credential) {
  try {
    const part = credential.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(part), (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)).email || FALLBACK_EMAIL;
  } catch {
    return FALLBACK_EMAIL;
  }
}

export async function logout() {
  rememberDemoUser(null);
  currentUser = null;
  try {
    window.google?.accounts?.id?.disableAutoSelect?.();
  } catch {
    // Google 的 script 還沒載到就算了
  }
}

export function forgetLogin() {
  rememberDemoUser(null);
  currentUser = null;
}

/**
 * 登入畫面上的按鈕：Google 登入，以及一顆不用 Google 帳號的「直接進入」——
 * 面試現場的電腦不一定登得了 Google。
 */
export function renderGoogleButton(container, { onSuccess }) {
  const googleSlot = document.createElement('div');
  const guest = document.createElement('button');
  guest.type = 'button';
  guest.className = 'btn btn--ghost demo-guest';
  guest.textContent = 'Enter the demo without a Google account';
  guest.addEventListener('click', () => onSuccess(enter(FALLBACK_EMAIL)));
  const note = document.createElement('p');
  note.className = 'demo-note';
  note.textContent = 'Demo: whichever account you use, you enter as the same Demo User without admin rights. All data is fictional and nothing is sent to the Group Judge backend.';
  container.append(googleSlot, guest, note);

  if (!CLIENT_ID) {
    googleSlot.hidden = true;
    return;
  }
  const start = () => {
    window.google.accounts.id.initialize({
      client_id: CLIENT_ID,
      callback: (response) => onSuccess(enter(emailFrom(response.credential))),
    });
    window.google.accounts.id.renderButton(googleSlot, {
      theme: 'outline', size: 'large', shape: 'pill', text: 'signin_with', locale: 'en',
    });
  };
  if (window.google?.accounts?.id) {
    start();
    return;
  }
  const timer = setInterval(() => {
    if (window.google?.accounts?.id) {
      clearInterval(timer);
      clearTimeout(giveUp);
      start();
    }
  }, 100);
  const giveUp = setTimeout(() => {
    clearInterval(timer);
    googleSlot.textContent = 'Google sign-in failed to load — use the button below to enter.';
  }, 10000);
}
