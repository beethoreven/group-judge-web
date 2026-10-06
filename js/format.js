/**
 * 日期、時間、天數的顯示方式。兩種版面共用。
 *
 * ★ 一律用 GMT+8 顯示，不看瀏覽器所在的時區——人在國外打開後台，看到的加入
 *   時間也要跟群組裡大家講的是同一個時間。
 */

const PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Taipei',
  year: 'numeric', month: 'numeric', day: 'numeric',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

function parts(iso) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const out = {};
  for (const { type, value } of PARTS.formatToParts(date)) out[type] = value;
  return out;
}

/** 2026/8/5。沒有值就是「—」。 */
export function fmtDate(iso) {
  const p = parts(iso);
  return p ? `${p.year}/${p.month}/${p.day}` : '—';
}

/** 2026/8/5 14:30 */
export function fmtDateTime(iso) {
  const p = parts(iso);
  return p ? `${p.year}/${p.month}/${p.day} ${p.hour}:${p.minute}` : '—';
}

/** 8/5 14:30（同一年裡的事，省掉年份） */
export function fmtShortDateTime(iso) {
  const p = parts(iso);
  return p ? `${p.month}/${p.day} ${p.hour}:${p.minute}` : '—';
}

/** 後端給的純日期字串 '2026-08-01' → 2026/8/1。這種沒有時區問題，直接拆。 */
export function fmtPlainDate(text) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text ?? '');
  return match ? `${Number(match[1])}/${Number(match[2])}/${Number(match[3])}` : '—';
}

/** 96 天。算不出來（已離開）就是「—」。 */
export function fmtDays(days) {
  return typeof days === 'number' ? `${days} 天` : '—';
}
