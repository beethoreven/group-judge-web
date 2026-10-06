/**
 * 發話對照：小判官認得的每一個人，在這次統計區間裡有沒有發話。兩種版面共用。
 *
 * 用途是拿著 LINE 的群組成員名單逐一對照——LINE 上有、這裡沒有的人，就是小判官
 * 從來沒看過的人。所以排序要盡量跟 LINE 的成員名單一樣。
 *
 * ★ LINE 沒有公布成員名單的排序規則，各平台還不一樣：
 *     電腦版  數字 → 英文 → 中文 → 標點符號 → 特殊符號
 *             （案主 2026-10-06 在自己的電腦版上看到的順序，預設用這個。用
 *               虛構的名字示意：13579 2468 bob Cindy Xavier 丁丁 小華 王大明 陳二
 *               *甲* -乙-——英文不分大小寫，中文照字碼）
 *     手機版  符號 → 數字 → 英文 → 日文 → 中文（網路上查到的說法，沒驗證過）
 *   中文字之間不是照筆畫也不是照注音（最接近的是 Unicode 的字碼順序）。
 *   另外兩種排法留著備用。選過會記住。
 *   另外 LINE 顯示的是「你幫好友取的名字」，這裡是對方自己設的名字，有改過
 *   名字的好友位置會不一樣——所以另外給了搜尋。
 */

import { api } from '../api.js';

export const loadRoster = () => api.get('/api/roster');

export const GROUPS = {
  spoke: { label: '有發話', tone: 'ok' },
  new: { label: '區間內加入', tone: 'neutral' },
  silent: { label: '沒發話', tone: 'danger' },
};

const base = new Intl.Collator('en');

/** 電腦版的大類順序：看名字的第一個字。同一類裡面照字碼順序。 */
function pcClass(name) {
  if (/^\p{N}/u.test(name)) return 0;                 // 數字
  if (/^\p{Script=Latin}/u.test(name)) return 1;      // 英文
  if (/^\p{L}/u.test(name)) return 2;                 // 中文（與其他文字）
  if (/^\p{P}/u.test(name)) return 3;                 // 標點符號
  return 4;                                           // 特殊符號、表情符號、空白
}

/**
 * 符號開頭的名字之間照字碼順序。不能用上面那個 collator：它會把「-」排在「*」
 * 前面，而案主在電腦版看到的是「*」開頭的名字排在「-」開頭的前面（2026-10-06）。
 */
function byCodePoint(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

export const SORTS = [
  {
    key: 'pc',
    label: 'LINE 電腦版（數字 → 英文 → 中文 → 標點 → 特殊符號）',
    compare: (a, b) => (pcClass(a) - pcClass(b)) || (pcClass(a) >= 3 ? byCodePoint(a, b) : base.compare(a, b)),
  },
  { key: 'mobile', label: 'LINE 手機版（符號 → 數字 → 英文 → 日文 → 中文）', compare: base.compare },
  { key: 'stroke', label: '中文照筆畫', compare: new Intl.Collator('zh-TW-u-co-stroke').compare },
  { key: 'zhuyin', label: '中文照注音', compare: new Intl.Collator('zh-TW-u-co-zhuyin').compare },
];

const SORT_KEY = 'group-judge-roster-sort';

export function savedSort() {
  try {
    const key = localStorage.getItem(SORT_KEY);
    return SORTS.some((s) => s.key === key) ? key : SORTS[0].key;
  } catch {
    return SORTS[0].key;
  }
}

export function rememberSort(key) {
  try {
    localStorage.setItem(SORT_KEY, key);
  } catch {
    // 記不住就算了
  }
}

/** 依群組與關鍵字篩選，再照選的方式排序。groups 是要顯示的群組 key 的 Set。 */
export function arrange(members, { groups, keyword = '', sort }) {
  const key = keyword.trim().toLowerCase();
  const compare = (SORTS.find((s) => s.key === sort) ?? SORTS[0]).compare;
  return members
    .filter((m) => groups.has(m.group) && (!key || (m.name || '').toLowerCase().includes(key)))
    .sort((a, b) => compare(a.name || '', b.name || '') || a.user_id - b.user_id);
}

/** '2026-08' → '8 月'。 */
export const monthLabel = (month) => `${Number(month.slice(5))} 月`;

/**
 * 一個人在區間裡每個月說了幾則，寫成一句：「8 月 12 則・9 月 3 則」。
 * months 是後端給的月份清單，counts 的順序跟它一樣（後端一個人一個月記一個數字）。
 */
export function countsText(months, counts) {
  return months.map((month, i) => `${monthLabel(month)} ${counts[i]} 則`).join('・');
}

/** 各群組幾個人。 */
export function tally(members) {
  const out = { spoke: 0, new: 0, silent: 0 };
  for (const m of members) out[m.group] += 1;
  return out;
}

/** 名冊上方那句話：群組實際幾人、這裡幾人、差幾人。 */
export function coverage(data) {
  const known = data.members.length;
  if (data.group_count === null) {
    return `小判官認得 ${known} 人。按「讀取成員資料」可以知道群組實際有幾個人。`;
  }
  const unseen = Math.max(0, data.group_count - known);
  return unseen
    ? `群組實際 ${data.group_count} 人，小判官認得 ${known} 人：有 ${unseen} 人它從來沒看過（進群之後沒說過話），這些人不會出現在下面。`
    : `群組實際 ${data.group_count} 人，小判官每一個都認得。`;
}
