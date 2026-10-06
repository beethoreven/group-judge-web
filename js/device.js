/**
 * 這一頁要用桌面版還是行動版的畫面。
 *
 * 兩種版面是兩套獨立的程式（js/desktop/、js/mobile/）與各自的 CSS，同一個網址
 * 進來，在載入時決定用哪一套，之後不會跟著視窗大小切換——要換就重新載入。
 *
 * 判斷順序：
 *   1. 使用者自己選過（選單裡的「切換到行動版／桌面版」，記在 localStorage）
 *   2. 網址帶 ?device=mobile 或 ?device=desktop（測試用，不會記住）
 *   3. 瀏覽器說自己是不是行動裝置
 *   4. 都看不出來就看螢幕寬度
 */

const KEY = 'group-judge-device';
const KINDS = ['desktop', 'mobile'];

function stored() {
  try {
    const value = localStorage.getItem(KEY);
    return KINDS.includes(value) ? value : null;
  } catch {
    return null;
  }
}

function guess() {
  // 新的瀏覽器直接有答案。
  const hinted = navigator.userAgentData?.mobile;
  if (typeof hinted === 'boolean') return hinted ? 'mobile' : 'desktop';
  // iPad 不算在內：它的螢幕夠大，桌面版比較好用（而且 iPadOS 本來就自稱 Mac）。
  if (/Android.+Mobile|iPhone|iPod|Windows Phone/i.test(navigator.userAgent)) return 'mobile';
  return window.matchMedia('(max-width: 720px)').matches ? 'mobile' : 'desktop';
}

export function detectDevice() {
  const fromUrl = new URLSearchParams(window.location.search).get('device');
  if (KINDS.includes(fromUrl)) return fromUrl;
  return stored() ?? guess();
}

/** 使用者手動換版面：記住選擇，然後重新載入。 */
export function switchDevice(kind) {
  try {
    // 選的跟自動判斷的一樣，就不必記——之後換裝置開同一個網址時照樣自動判斷。
    if (kind === guess()) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, kind);
  } catch {
    // 記不住就算了
  }
  // ?device= 的優先權比較高，留著會讓剛選的沒有效果，所以拿掉再載入。
  //
  // ★ 網址沒變的時候要用 reload()，不能用 location.replace(同一個網址)：
  //   網址後面帶著 #頁籤 時，瀏覽器會把它當成「捲到那個錨點」而不是重新載入，
  //   版面就換不過去。
  const url = new URL(window.location.href);
  if (url.searchParams.has('device')) {
    url.searchParams.delete('device');
    window.location.replace(url);
  } else {
    window.location.reload();
  }
}
