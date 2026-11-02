// 自動產生（demo-en/tools/build.py），來源是 js/mobile/cleanup.js。不要手改：改 demo-en/tools/translations.py 再重跑。
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
  const name = person.name || '(no name)';
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
        person.join_at ? `Joined ${fmtDateTime(person.join_at)}` : 'Join date unknown'),
      notes.length > 0 && el('span', { class: 'pcard__notes' },
        notes.map((n) => badge(n.text, n.tone, n.title))),
    ]),
    el('span', { class: 'pcard__days' }, [
      el('strong', {}, typeof person.silent_days === 'number' ? String(person.silent_days) : '—'),
      el('span', {}, 'days silent'),
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

  const addButton = asyncButton('Add', async () => {
    try {
      const { members } = await loadMembers();
      model.add(await pickMembers(model.addable(members)));
    } catch (err) {
      toastError(err, 'Could not load members');
    }
  });

  const removeButton = asyncButton('Remove', () => model.applyRemove());

  const saveButton = asyncButton('Save', async () => {
    try {
      const { kick, spare } = await model.save();
      toast(spare ? `Saved: ${kick} on the list, ${spare} whitelisted` : `Saved: ${kick} on the list`);
    } catch (err) {
      toastError(err, 'Could not save');
    }
  }, { class: 'btn btn--primary' });

  const leftButton = asyncButton('Mark all as left', async () => {
    try {
      const marked = await model.markAllLeft();
      if (marked !== null) toast(`${marked} marked as left`);
    } catch (err) {
      toastError(err, 'Could not update');
    }
  });

  const actions = el('div', { class: 'mactions__row' }, [addButton, removeButton, saveButton]);

  // ── 畫面 ──

  function render() {
    const counts = model.counts();
    const mode = model.removeMode();
    removeButton.firstChild.textContent =
      mode === 'unmark' ? `Undo remove (${counts.selected})` : mode ? `Remove (${counts.selected})` : 'Remove';
    removeButton.setDisabled(!mode);
    leftButton.setDisabled(!model.leftCandidates().length);
    const summary = savedSummary(model);

    setChildren(node, [
      el('div', { class: 'mview__head' }, [
        el('h1', {}, 'This month’s removal list'),
        el('p', {}, [
          el('strong', {}, `${fmtPlainDate(model.period.start)} – ${fmtPlainDate(model.period.end)}`),
          ': members who said nothing at all. People who joined during the period are not listed.',
        ]),
      ]),
      blindNotice(model.blindSince) && el('div', { class: 'notice' }, blindNotice(model.blindSince)),
      el('div', { class: 'mstatus' }, [
        el('div', { class: 'mstatus__counts' }, [
          el('span', {}, [el('strong', {}, String(counts.kick)), ' on the list']),
          counts.spare > 0 && el('span', {}, [el('strong', {}, String(counts.spare)), ' leaving']),
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
        : emptyState('Everyone spoke during this period — the list is empty.'),
      model.rows.length > 0 && el('div', { class: 'mview__extra' }, leftButton),
      protectedSection(),
    ]);
  }

  function protectedSection() {
    const people = model.protectedRows;
    if (!people.length) return null;
    return el('details', { class: 'mfold' }, [
      el('summary', {}, `Kept last time, skipped this time (${people.length})`),
      el('p', { class: 'muted' },
        'You took them off the list last time, and the months overlap with this time, so they are not listed twice. To deal with them now, use “Add”.'),
      el('ul', { class: 'mlist' }, people.map((p) => el('li', {}, [
        el('span', { class: 'mlist__name' }, p.name || '(no name)'),
        el('span', { class: 'muted' }, `Kept ${fmtDate(p.white_listed_at)} · ${fmtDays(p.silent_days)}`),
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
        toast('The list has unsaved changes, so this page does not reload for now.');
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
      confirm.textContent = chosen.size ? `Add to list (${chosen.size})` : 'Add to list';
      confirm.disabled = chosen.size === 0;
      if (!candidates.length) {
        clear(list).append(emptyState('Everyone in the group is already on the list.'));
      } else if (!shown.length) {
        clear(list).append(emptyState('No members match.'));
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
      class: 'field', type: 'search', placeholder: 'Search name', 'aria-label': 'Search name',
      onInput: (event) => {
        keyword = event.target.value;
        renderList();
      },
    });
    renderList();

    return el('div', {}, [
      el('div', { class: 'modal__body mpicker' }, [search, list]),
      el('div', { class: 'modal__actions' }, [
        el('button', { class: 'btn btn--ghost', type: 'button', onClick: () => close([]) }, 'Cancel'),
        confirm,
      ]),
    ]);
  }, { title: 'Add members to the list', wide: true });

  return done.then((members) => members ?? []);
}
