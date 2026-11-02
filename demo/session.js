/**
 * 示範版的登入狀態：登入的是誰。存在 localStorage，關掉分頁、重新整理都還在，
 * 按登出才清掉。
 *
 * ★ demo/index.html 一開頭就把這一頁的 localStorage key 全部加上「demo:」，
 *   所以這裡跟正式版的 group-judge-session（管理員的登入憑證）不會互相讀到。
 */

const KEY = 'group-judge-demo-user';

/** { email } 或 null。 */
export function demoUser() {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || 'null');
    return value && typeof value.email === 'string' ? value : null;
  } catch {
    return null;
  }
}

export function rememberDemoUser(user) {
  try {
    if (user) localStorage.setItem(KEY, JSON.stringify(user));
    else localStorage.removeItem(KEY);
  } catch {
    // 存不進去就算了，這一頁關掉前還是能用
  }
}
