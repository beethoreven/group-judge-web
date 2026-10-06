/**
 * 行動版｜待移除名單頁籤：一個人一張卡片，「新增／移除／儲存」固定在頁籤列上方。
 *
 * 這裡只管怎麼畫。點一張卡片是選取、按「移除」才標記、標記的卡片會反白——
 * 這些規則都在 js/logic/cleanup.js，桌面版用的是同一份。
 */

import { asyncButton, badge, clear, el, emptyState, loadFailed, openModal, setChildren, spinner, toast, toastError } from '../ui.js';
import { fmtDate, fmtDateTime, fmtDays, fmtPlainDate } from '../format.js';
import { blindNotice, createCleanup, rowNotes, savedSummary } from '../logic/cleanup.js';
import { filterMembers, loadMembers } from '../logic/members.js';

/** 名單與「新增」對話框共用的卡片。 */
function personCard(person, { selected, spare = false, notes = [], onToggle }) {
  const name = person.name || '（沒有名字）';
  return el('button', {
    class: ['pcard', selected && 'is-selected', spare && 'is-spare'].filter(Boolean).join(' '),
    type: 'button',
    'aria-pressed': String(selected),
    onClick: onToggle,
  }, [
    el('span', { class: 'pcard__check', 'aria-hidden': 'true' }, selected ? '✓' : ''),
    el('span', { class: 'pcard__main' }, [
      el('span', { class: 'pcard__name' }, name),
      el('span', { class: 'pcard__meta' },
        person.join_at ? `${fmtDateTime(person.join_at)} 加入` : '加入時間不明'),
      notes.length > 0 && el('span', { class: 'pcard__notes' },
        notes.map((n) => badge(n.text, n.tone, n.title))),
    ]),
    el('span', { class: 'pcard__days' }, [
      el('strong', {}, typeof person.silent_days === 'number' ? String(person.silent_days) : '—'),
      el('span', {}, '天未發話'),
    ]),
  ]);
}

export function createCleanupView() {
  const model = createCleanup();
  const node = el('div', { class: 'mview' });

  async function load() {
    clear(node).append(spinner());
    try {
      await model.load();
    } catch (err) {
      clear(node).append(loadFailed(err.message, load));
    }
  }

  // ── 固定在底部的三顆按鈕 ──

  const addButton = asyncButton('新增', async () => {
    try {
      const { members } = await loadMembers();
      model.add(await pickMembers(model.addable(members)));
    } catch (err) {
      toastError(err, '讀取成員失敗');
    }
  });

  const removeButton = asyncButton('移除', () => model.applyRemove());

  const saveButton = asyncButton('儲存', async () => {
    try {
      const { kick, spare } = await model.save();
      toast(spare ? `已儲存：名單 ${kick} 人，${spare} 人列入白名單` : `已儲存：名單 ${kick} 人`);
    } catch (err) {
      toastError(err, '儲存失敗');
    }
  }, { class: 'btn btn--primary' });

  const actions = el('div', { class: 'mactions__row' }, [addButton, removeButton, saveButton]);

  // ── 畫面 ──

  function render() {
    const counts = model.counts();
    const mode = model.removeMode();
    removeButton.firstChild.textContent =
      mode === 'unmark' ? `取消移除（${counts.selected}）` : mode ? `移除（${counts.selected}）` : '移除';
    removeButton.setDisabled(!mode);
    const summary = savedSummary(model);

    setChildren(node, [
      el('div', { class: 'mview__head' }, [
        el('h1', {}, '本次待移除名單'),
        el('p', {}, [
          el('strong', {}, `${fmtPlainDate(model.period.start)} – ${fmtPlainDate(model.period.end)}`),
          ' 完全沒有發話的成員。區間內才加入的人不會列入。',
        ]),
      ]),
      blindNotice(model.blindSince) && el('div', { class: 'notice' }, blindNotice(model.blindSince)),
      el('div', { class: 'mstatus' }, [
        el('div', { class: 'mstatus__counts' }, [
          el('span', {}, [el('strong', {}, String(counts.kick)), ' 人在名單上']),
          counts.spare > 0 && el('span', {}, [el('strong', {}, String(counts.spare)), ' 人將移出']),
        ]),
        badge(summary.text, summary.tone),
      ]),
      model.rows.length
        ? el('div', { class: 'pcards' }, model.rows.map((row) => personCard(row, {
          selected: model.isSelected(row.user_id),
          spare: row.state === 'spare',
          notes: rowNotes(row),
          onToggle: () => model.toggle(row.user_id),
        })))
        : emptyState('這段期間每個人都有發話，名單是空的。'),
      protectedSection(),
    ]);
  }

  function protectedSection() {
    const people = model.protectedRows;
    if (!people.length) return null;
    return el('details', { class: 'mfold' }, [
      el('summary', {}, `上次保留、這次自動略過（${people.length} 人）`),
      el('p', { class: 'muted' },
        '上次整理時你把他們從名單拿掉，而上次看的月份跟這次有重疊，所以這次不重複列入。想現在處理，可以用「新增」把他加進來。'),
      el('ul', { class: 'mlist' }, people.map((p) => el('li', {}, [
        el('span', { class: 'mlist__name' }, p.name || '（沒有名字）'),
        el('span', { class: 'muted' }, `${fmtDate(p.white_listed_at)} 保留・${fmtDays(p.silent_days)}`),
      ]))),
    ]);
  }

  model.subscribe(render);
  load();

  return {
    node,
    actions,
    hasUnsaved: () => model.loaded && model.touched,
    // 成員資料變了。名單有還沒存的變更時不重載，不然剛標好的會整個不見。
    reload: () => {
      if (model.loaded && model.touched) {
        toast('名單有還沒儲存的變更，這一頁先不重新載入。');
        return;
      }
      load();
    },
  };
}

/**
 * 「新增」：從在群組裡、還不在名單上的人裡面挑。整個螢幕高的面板，
 * 上面搜尋、中間一張張卡片、確認鈕固定在底部。
 * 回傳 Promise<成員陣列>（取消就是空的）。
 */
function pickMembers(candidates) {
  const chosen = new Set();
  let keyword = '';

  const { done } = openModal((close) => {
    const list = el('div', { class: 'pcards' });
    const confirm = el('button', {
      class: 'btn btn--primary', type: 'button',
      onClick: () => close(candidates.filter((m) => chosen.has(m.id))),
    });

    function renderList() {
      const shown = filterMembers(candidates, { keyword });
      confirm.textContent = chosen.size ? `加入名單（${chosen.size} 人）` : '加入名單';
      confirm.disabled = chosen.size === 0;
      if (!candidates.length) {
        clear(list).append(emptyState('在群組裡的人都已經在名單上了。'));
      } else if (!shown.length) {
        clear(list).append(emptyState('找不到符合的成員。'));
      } else {
        clear(list).append(...shown.map((m) => personCard(m, {
          selected: chosen.has(m.id),
          onToggle: () => {
            if (chosen.has(m.id)) chosen.delete(m.id);
            else chosen.add(m.id);
            renderList();
          },
        })));
      }
    }

    const search = el('input', {
      class: 'field', type: 'search', placeholder: '搜尋名稱', 'aria-label': '搜尋名稱',
      onInput: (event) => {
        keyword = event.target.value;
        renderList();
      },
    });
    renderList();

    return el('div', {}, [
      el('div', { class: 'modal__body mpicker' }, [search, list]),
      el('div', { class: 'modal__actions' }, [
        el('button', { class: 'btn btn--ghost', type: 'button', onClick: () => close([]) }, '取消'),
        confirm,
      ]),
    ]);
  }, { title: '新增成員到名單', wide: true });

  return done.then((members) => members ?? []);
}
