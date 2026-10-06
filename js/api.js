/**
 * 後端 API 的唯一入口。所有 fetch 都走這裡，不要在別的模組直接 fetch——
 * session token 的附加、401／403 的處理、錯誤訊息的取出都集中在這一支，
 * 分散出去就會有地方漏掉。
 */

// 前端跑在 localhost 上就是本機開發，沒有第二種可能——正式站掛在
// Cloudflare 的網域下。
const HOST = window.location.hostname;
export const IS_LOCAL = HOST === 'localhost' || HOST === '127.0.0.1' || HOST === '[::1]';

// 後端位址，依序取第一個有值的。
//
// ★ 本機那一段不能省。index.html 裡寫死的是正式站的後端網址，而本機開發用的
//   是同一份 index.html——少了這一段，在 localhost 開頁面時這一頁會去跟正式
//   後端說話，症狀是一整排 `Failed to fetch`，看起來像「本機後端沒開」。
//   5002 是後端的預設 port。要在本機打別的位址，帶 ?apiBase= 就好。
const API_BASE =
  new URLSearchParams(window.location.search).get('apiBase') ??
  (IS_LOCAL ? 'http://localhost:5002' : null) ??
  window.__GROUP_JUDGE_API_HOST__ ??
  '';

const TOKEN_KEY = 'group-judge-session';

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || null;
  } catch {
    return null; // 無痕視窗之類不給用 localStorage 的環境：當成沒登入
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // 存不進去就算了，這一頁關掉前還是能用
  }
}

export class ApiError extends Error {
  constructor(status, message, payload) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

/**
 * 憑證失效（401）與沒有權限（403）時要做什麼。由 main.js 啟動時註冊，
 * 這一層不直接相依於畫面。
 *
 *   reauthenticate()  請使用者重新登入。回傳 Promise<boolean>：登入成功了沒。
 *   forbidden()       這個帳號已經不是管理員了。
 */
let handlers = { reauthenticate: async () => false, forbidden: () => {} };
export function setAuthHandlers(next) {
  handlers = { ...handlers, ...next };
}

// 同時只會有一次重新登入在進行。背景的請求與使用者按的按鈕同時收到 401 時，
// 兩邊等的是同一個結果，不會各跳一個登入框。
let reauthInFlight = null;
function reauthenticateOnce() {
  if (!reauthInFlight) {
    reauthInFlight = handlers.reauthenticate().finally(() => { reauthInFlight = null; });
  }
  return reauthInFlight;
}

async function send(method, path, { body, query } = {}) {
  const url = new URL(API_BASE + path, window.location.origin);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    }
  }
  const headers = {};
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    // 連不上（後端沒醒、網路斷了）。status 0 讓呼叫端分得出這不是後端回的錯。
    throw new ApiError(0, '連不上伺服器，請稍後再試');
  }

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    // 不是 JSON（例如 502 之類的閘道錯誤頁），維持 null
  }
  return { res, payload };
}

async function request(method, path, options = {}) {
  // /auth/* 是登入流程自己的請求，它的 401／403 由 auth.js 處理，
  // 不走下面那兩條——否則登入失敗會觸發「請重新登入」，繞成一圈。
  const isAuthCall = path.startsWith('/auth/');

  let { res, payload } = await send(method, path, options);

  // 401 = 憑證無效或過期。請使用者重新登入，成功之後把**同一個請求**重送一次，
  // 對呼叫端來說就像什麼都沒發生——正在編輯的內容、勾好的名單都還在。
  if (res.status === 401 && !isAuthCall) {
    setToken(null);
    if (await reauthenticateOnce()) {
      ({ res, payload } = await send(method, path, options));
    }
  }

  // 403 且 code 是 forbidden = 憑證有效，但這個帳號不是管理員。重新登入沒有用，
  // 只會繞一圈得到同樣的結果。
  if (res.status === 403 && payload?.code === 'forbidden' && !isAuthCall) {
    handlers.forbidden();
  }

  if (!res.ok) {
    throw new ApiError(res.status, payload?.error || `請求失敗（${res.status}）`, payload);
  }
  return payload;
}

export const api = {
  get: (path, query) => request('GET', path, { query }),
  post: (path, body) => request('POST', path, { body }),
  put: (path, body) => request('PUT', path, { body }),
};
