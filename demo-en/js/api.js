// 自動產生（demo-en/tools/build.py），來源是 demo/api.js。不要手改：改 demo-en/tools/translations.py 再重跑。
/**
 * 示範版的 js/api.js：介面一模一樣，但一個請求都不送出去。
 *
 * demo/index.html 的 import map 把 ../js/api.js 換成這一支，所以正式版的畫面
 * 程式（js/logic/、js/desktop/、js/mobile/）原封不動拿來用，它們以為在跟後端
 * 說話，其實是這裡照後端的回應格式（group-judge-backend/app.py）用假資料回答。
 *
 * ★ 這一支沒有 fetch。寫入的動作只改記憶體裡的那一份，重新整理就還原。
 */

import { MAX_LENGTH, VARIABLES, createStore } from './data.js';
import { demoUser } from './session.js';

export const IS_LOCAL = false;

// 正式版的 auth.js 會用到這兩個；示範版的登入狀態在 demo/session.js。
export const getToken = () => null;
export const setToken = () => {};

export class ApiError extends Error {
  constructor(status, message, payload) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

// 示範版不會有 401／403／資料庫逾時，註冊了也不會被叫到。
export function setAuthHandlers() {}

const store = createStore();
const { period } = store;
const DAY = 86400000;
const iso = (date) => new Date(date).toISOString();
const STATUS_ORDER = ['joined', 'leaved', 'banned'];

// ── 跟後端同一套的計算 ────────────────────────────────────

const fullDays = (since) => (since ? Math.floor((store.now - new Date(since)) / DAY) : null);
const byId = (id) => store.members.find((m) => m.id === id);
const joinedBeforePeriod = (m) => !m.join_at || new Date(m.join_at) < period.start;
const spoke = (m) => m.counts.some(Boolean);

/** 成員頁籤的一筆（後端 _member_json）。登入的人那一筆的 email 換成他登入用的。 */
function memberJson(m) {
  return {
    id: m.id, name: m.name, has_line_id: m.has_line_id,
    email: m.id === 1 ? demoUser()?.email ?? null : m.email,
    role: m.role, status: m.status, join_at: m.join_at, last_speak: m.last_speak,
    silent_days: fullDays(m.last_speak), last_leave: m.last_leave, exempt: m.exempt,
  };
}

function card(m) {
  return {
    user_id: m.id, name: m.name, status: m.status,
    join_at: m.join_at, last_speak: m.last_speak, silent_days: fullDays(m.last_speak),
  };
}

function order(rows) {
  return [...rows].sort((a, b) =>
    (a.silent_days === null) - (b.silent_days === null) ||
    (b.silent_days ?? 0) - (a.silent_days ?? 0) ||
    a.name.localeCompare(b.name) || a.user_id - b.user_id);
}

/** 系統算出來的待移除候選人：區間開始前就在、區間裡沒說話、沒設不列入整理。 */
function candidates() {
  return store.members.filter((m) =>
    m.status === 'joined' && !m.exempt && joinedBeforePeriod(m) && !spoke(m)).map((m) => m.id);
}

/** 待移除名單頁籤的全部東西（後端 db/cleanup.py 的 state）。 */
function cleanupState() {
  const saved = store.saved;
  const auto = candidates();
  const protectedIds = auto.filter((id) => byId(id).protected_at);
  const listed = [...new Set([...(saved?.kick_ids ?? []), ...(saved?.spare_ids ?? []),
    ...auto.filter((id) => !protectedIds.includes(id))])];
  const shownProtected = protectedIds.filter((id) => !listed.includes(id));

  const rows = listed.map(byId).filter(Boolean).map((m) => ({
    ...card(m),
    source: saved?.manual_ids.has(m.id) ? 'manual' : 'auto',
    state: saved?.spare_ids.includes(m.id) ? 'spare' : 'kick',
    identified: Boolean(saved?.identified_ids.has(m.id)),
    prior_whitelist_at: m.prior_whitelist_at,
    late_speak: m.last_speak && new Date(m.last_speak) >= period.endBefore ? m.last_speak : null,
  }));
  return {
    period: period.json,
    blind_since: null,
    saved: saved && { clean_at: saved.clean_at, kick_ids: saved.kick_ids, spare_ids: saved.spare_ids },
    rows: order(rows),
    protected: order(shownProtected.map(byId).map((m) => ({ ...card(m), white_listed_at: m.protected_at }))),
  };
}

function overview() {
  const unknownOpen = store.unknown.filter((u) => u.user_id === null).length;
  return {
    group: { bound: true, name: store.group.name, count: store.group.count, checked_at: store.group.checked_at },
    known_joined: store.members.filter((m) => m.status === 'joined').length,
    unknown: { total: store.unknown.length, open: unknownOpen, later: store.unknownLater },
    database: store.database,
  };
}

/** 被指認了一則訊息：從名單移到白名單（後端 cleanup.identify）。 */
function identify(userId) {
  const saved = store.saved;
  saved.kick_ids = saved.kick_ids.filter((id) => id !== userId);
  if (!saved.spare_ids.includes(userId)) saved.spare_ids.push(userId);
  saved.identified_ids.add(userId);
}

/** 取消指認：他沒有別的被指認的訊息了，就移回名單（後端 cleanup.unidentify）。 */
function unidentify(userId) {
  const saved = store.saved;
  if (store.unknown.some((u) => u.user_id === userId)) return;
  if (!saved.identified_ids.has(userId)) return;
  saved.identified_ids.delete(userId);
  saved.spare_ids = saved.spare_ids.filter((id) => id !== userId);
  if (!saved.kick_ids.includes(userId)) saved.kick_ids.push(userId);
}

function unknownJson(u) {
  return { ...u, user_name: u.user_id === null ? null : byId(u.user_id)?.name ?? null };
}

/** 預覽：變數換成假資料算出來的實際內容（後端 line_utils/render.py）。 */
function render(text) {
  const state = cleanupState();
  const names = (rows) => rows.map((r) => r.name).join('\n') || '(none)';
  const kick = state.rows.filter((r) => r.state === 'kick');
  const [, startMonth, startDay] = period.json.start.split('-').map(Number);
  const values = {
    '{month}': String(Number(period.months[1].slice(5)) % 12 + 1),
    '{start_date}': `${startMonth}/${startDay}`,
    '{protected_month}': String(startMonth),
    '{period}': period.json.label,
    '{list}': names(kick),
    '{count}': String(kick.length),
    '{no_endorse_list}': names(kick.filter((r) => r.prior_whitelist_at)),
    '{whitelist}': names(state.rows.filter((r) => r.state === 'spare')),
    '{admins}': store.members.filter((m) => m.role === 1 && m.status === 'joined').map((m) => ` @${m.name}`).join(''),
    '{name}': 'New Traveler',
    '{recorded_name}': 'Banned Demo Account',
  };
  return Object.entries(values).reduce((out, [key, value]) => out.replaceAll(key, value), text);
}

/**
 * 示範版的訊息內容是說明文字，裡面的「例：」那一段才是實際會發的樣子。預覽只
 * 換那一段的變數，說明文字裡提到的變數名稱不會被換掉。沒有「例：」（例如使用者
 * 自己改過內容）就整則照常預覽。
 */
function example(text) {
  const at = text.lastIndexOf('Example:');
  return at === -1 ? text : text.slice(at + 8).trim().split('\n\n')[0];
}

// ── 路由 ──────────────────────────────────────────────────

function fail(status, message) {
  throw new ApiError(status, message, { error: message });
}

function checkContent(content) {
  if (typeof content !== 'string') fail(400, 'Content is missing');
  if (content.length > MAX_LENGTH) fail(400, `Too long (${content.length} characters); a LINE message holds at most ${MAX_LENGTH}`);
  return content;
}

const routes = [
  ['GET', /^\/api\/rules$/, () => ({ ...store.rules, max_length: MAX_LENGTH })],
  ['PUT', /^\/api\/rules$/, (_m, body) => {
    Object.assign(store.rules, { content: checkContent(body?.content), updated_at: iso(Date.now()) });
    return { ...store.rules, max_length: MAX_LENGTH };
  }],
  ['GET', /^\/api\/extra-rules$/, () => ({ ...store.extraRules, max_length: MAX_LENGTH })],
  ['PUT', /^\/api\/extra-rules$/, (_m, body) => {
    Object.assign(store.extraRules, { content: checkContent(body?.content), updated_at: iso(Date.now()) });
    return { ...store.extraRules, max_length: MAX_LENGTH };
  }],

  ['GET', /^\/api\/messages$/, () => ({
    groups: store.messageGroups, variables: VARIABLES, max_length: MAX_LENGTH, max_per_reply: 5,
  })],
  ['GET', /^\/api\/messages\/preview$/, (_m, _body, query) => {
    const group = store.messageGroups.find((g) => g.key === query?.group);
    if (!group) fail(404, 'Section not found');
    return { texts: group.blocks.map((b) => render(example(b.content))).filter((t) => t.trim()) };
  }],
  ['PUT', /^\/api\/messages\/(\d+)$/, ([, id], body) => {
    const block = store.messageGroups.flatMap((g) => g.blocks).find((b) => b.id === Number(id));
    if (!block) fail(404, 'Message not found');
    Object.assign(block, { content: checkContent(body?.content), updated_at: iso(Date.now()) });
    return block;
  }],

  ['GET', /^\/api\/cleanup$/, cleanupState],
  ['POST', /^\/api\/cleanup$/, (_m, body) => {
    const kick = body?.kick_ids ?? [];
    const spare = body?.spare_ids ?? [];
    const auto = new Set(candidates());
    const before = store.saved;
    store.saved = {
      clean_at: iso(Date.now()),
      kick_ids: kick,
      spare_ids: spare,
      manual_ids: new Set(kick.filter((id) => !auto.has(id))),
      identified_ids: new Set(spare.filter((id) => before?.identified_ids.has(id))),
    };
    return cleanupState();
  }],

  ['GET', /^\/api\/members$/, () => ({
    // 跟後端 members.list_all 同一個順序：狀態 → 身分 → 名字。
    members: [...store.members]
      .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) ||
        a.role - b.role || a.name.localeCompare(b.name))
      .map(memberJson),
    overview: overview(),
    me: 1,
  })],
  ['PUT', /^\/api\/members\/(\d+)$/, ([, id], changes) => {
    const m = byId(Number(id));
    if (!m) fail(404, 'Member not found');
    if (m.id === 1 && ('role' in changes || 'email' in changes)) fail(400, 'You cannot change your own role or email');
    let dropped = false;
    if ('status' in changes) {
      if (changes.status === 'leaved' && m.status !== 'leaved') m.last_leave = iso(Date.now());
      m.status = changes.status;
    }
    if ('role' in changes) m.role = changes.role;
    if ('email' in changes) m.email = changes.email || null;
    if ('exempt' in changes) {
      m.exempt = Boolean(changes.exempt);
      const saved = store.saved;
      if (m.exempt && saved?.kick_ids.includes(m.id)) {
        saved.kick_ids = saved.kick_ids.filter((x) => x !== m.id);
        dropped = true;
      }
    }
    return { ...memberJson(m), dropped_from_list: dropped };
  }],
  ['POST', /^\/api\/members\/(\d+)\/merge$/, ([, id], body) => {
    const kept = byId(Number(id));
    const other = byId(body?.with);
    if (!kept || !other) fail(400, 'No row to merge with was given');
    if (other.id === 1) fail(400, 'The demo cannot merge away your own row — please pick someone else');
    kept.has_line_id = true;
    kept.name = other.name;
    kept.counts = kept.counts.map((c, i) => c + other.counts[i]);
    if (other.last_speak && (!kept.last_speak || other.last_speak > kept.last_speak)) kept.last_speak = other.last_speak;
    store.members = store.members.filter((m) => m !== other);
    return memberJson(kept);
  }],
  ['POST', /^\/api\/members\/mark-left$/, (_m, body) => {
    let marked = 0;
    for (const id of body?.ids ?? []) {
      const m = byId(id);
      if (m && m.status === 'joined') {
        m.status = 'leaved';
        m.last_leave = iso(Date.now());
        marked += 1;
      }
    }
    return { marked };
  }],
  ['POST', /^\/api\/members\/refresh$/, () => {
    const people = store.members.filter((m) => m.has_line_id && m.status === 'joined');
    const surprise = store.refreshSurprises;
    store.refreshSurprises = { renamed: null, missing: [] };
    const renamed = [];
    if (surprise.renamed) {
      const m = byId(surprise.renamed.id);
      renamed.push({ id: m.id, old: m.name, new: surprise.renamed.name });
      m.name = surprise.renamed.name;
    }
    store.group.checked_at = iso(Date.now());
    return {
      checked: people.length,
      renamed,
      missing: surprise.missing.map(byId).filter((m) => m?.status === 'joined').map((m) => ({ id: m.id, name: m.name })),
      failed: 0,
      overview: overview(),
    };
  }],
  ['POST', /^\/api\/records\/prune$/, () => {
    const result = { ...store.prune, keep_months: 6 };
    store.prune = { removed: 0, left: store.prune.left };
    return result;
  }],

  ['GET', /^\/api\/roster$/, () => ({
    period: period.json,
    months: period.months,
    blind_since: null,
    members: store.members.filter((m) => m.status === 'joined').map((m) => ({
      ...card(m),
      group: spoke(m) ? 'spoke' : !joinedBeforePeriod(m) ? 'new' : m.exempt ? 'exempt' : 'silent',
      counts: m.counts,
    })),
    group_count: store.group.count,
    group_checked_at: store.group.checked_at,
  })],

  ['GET', /^\/api\/unknown$/, () => ({
    period: { start: period.json.start, end: period.json.end },
    messages: store.unknown.map(unknownJson),
    assignable: store.saved
      ? order(store.saved.kick_ids.map(byId).filter(Boolean).map(card))
      : null,
    later: store.unknownLater,
  })],
  ['POST', /^\/api\/unknown\/([^/]+)\/assign$/, ([, id], body) => {
    const message = store.unknown.find((u) => u.id === decodeURIComponent(id));
    if (!message) fail(404, 'Message not found (it may have been unsent)');
    if (!store.saved?.kick_ids.includes(body?.user_id)) fail(400, 'You can only identify people on this month’s saved removal list');
    message.user_id = body.user_id;
    identify(body.user_id);
    return unknownJson(message);
  }],
  ['POST', /^\/api\/unknown\/([^/]+)\/unassign$/, ([, id]) => {
    const message = store.unknown.find((u) => u.id === decodeURIComponent(id));
    if (!message) fail(404, 'Message not found (it may have been unsent)');
    const userId = message.user_id;
    message.user_id = null;
    if (userId !== null) unidentify(userId);
    return unknownJson(message);
  }],
];

async function request(method, path, { body, query } = {}) {
  // 停一下，讓載入中的轉圈圈、按鈕的「處理中」看得到，跟真的一樣。
  await new Promise((resolve) => setTimeout(resolve, 250));
  for (const [verb, pattern, handle] of routes) {
    const match = verb === method && pattern.exec(path);
    if (match) return structuredClone(handle(match, body, query));
  }
  fail(404, `The demo does not simulate this (${method} ${path})`);
}

export const api = {
  get: (path, query) => request('GET', path, { query }),
  post: (path, body) => request('POST', path, { body }),
  put: (path, body) => request('PUT', path, { body }),
};
