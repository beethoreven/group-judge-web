// 自動產生（demo-en/tools/build.py），來源是 js/desktop/cleanup.js。不要手改：改 demo-en/tools/translations.py 再重跑。
/**
 * 桌面版｜待移除名單頁籤：一張表格，右上角三顆按鈕「新增／移除／儲存」。
 *
 * 這裡只管怎麼畫。點一列是選取、按「移除」才標記、標記的那幾列會反白——
 * 這些規則都在 js/logic/cleanup.js，行動版用的是同一份。
 */

import { asyncButton, badge, clear, el, emptyState, loadFailed, openModal, setChildren, spinner, toast, toastError } from '../ui.js';
import { fmtDate, fmtDateTime, fmtDays, fmtPlainDate } from '../format.js';
import { blindNotice, createCleanup, rowNotes, savedSummary } from '../logic/cleanup.js';
import { filterMembers, loadMembers } from '../logic/members.js';

export function createCleanupView() {
  const model = createCleanup();
  const node = el('div', { class: 'view' });
  // 剛才用鍵盤切換的是哪一列。整張表重畫之後要把焦點放回去，
  // 不然用 Tab 與空白鍵操作的人每按一次就得從頭 Tab 回來。
  let refocus = null;

  async function load() {
    clear(node).append(spinner());
    try {
      await model.load();
    } catch (err) {
      clear(node).append(loadFailed(err.message, load));
    }
  }

  // ── 三顆按鈕 ──

  const addButton = asyncButton('Add', async () => {
    try {
      const { members } = await loadMembers();
      const chosen = await pickMembers(model.addable(members));
      model.add(chosen);
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

  // ── 畫面 ──

  function render() {
    const counts = model.counts();
    const mode = model.removeMode();
    removeButton.firstChild.textContent = mode === 'unmark' ? 'Undo remove' : 'Remove';
    removeButton.setDisabled(!mode);
    leftButton.setDisabled(!model.leftCandidates().length);
    const summary = savedSummary(model);

    setChildren(node, [
      el('div', { class: 'view__head view__head--split' }, [
        el('div', {}, [
          el('h1', {}, 'This month’s removal list'),
          el('p', {}, [
            'Review period ',
            el('strong', {}, `${fmtPlainDate(model.period.start)} – ${fmtPlainDate(model.period.end)}`),
            ': members who said nothing at all during this period. People who joined during the period are not listed.',
          ]),
        ]),
        el('div', { class: 'toolbar' }, [leftButton, addButton, removeButton, saveButton]),
      ]),
      blindNotice(model.blindSince) && el('div', { class: 'notice' }, blindNotice(model.blindSince)),
      el('div', { class: 'statusline' }, [
        el('span', {}, [el('strong', {}, String(counts.kick)), ' on the list']),
        counts.spare > 0 && el('span', {}, [el('strong', {}, String(counts.spare)), ' leaving the list']),
        counts.selected > 0 && el('span', {}, [
          `${counts.selected} selected  `,
          el('button', { class: 'linklike', type: 'button', onClick: () => model.clearSelection() }, 'Clear selection'),
        ]),
        el('span', { class: 'statusline__saved' }, badge(summary.text, summary.tone)),
      ]),
      model.rows.length ? table() : emptyState('Everyone spoke during this period — the list is empty.'),
      protectedSection(),
    ]);
    if (refocus !== null) {
      node.querySelector(`input[data-id="${refocus}"]`)?.focus({ preventScroll: true });
      refocus = null;
    }
  }

  function table() {
    return el('div', { class: 'tablewrap' }, el('table', { class: 'table table--pick' }, [
      el('thead', {}, el('tr', {}, [
        el('th', { class: 'table__check' }),
        el('th', {}, 'LINE name'),
        el('th', {}, 'Joined'),
        el('th', { class: 'table__num' }, 'Silent for'),
        el('th', {}, 'Notes'),
      ])),
      el('tbody', {}, model.rows.map((row) => {
        const selected = model.isSelected(row.user_id);
        return el('tr', {
          class: [row.state === 'spare' && 'is-spare', selected && 'is-selected'].filter(Boolean).join(' '),
          onClick: () => model.toggle(row.user_id),
        }, [
          el('td', { class: 'table__check' }, el('input', {
            type: 'checkbox', checked: selected, 'aria-label': `Select ${row.name}`,
            dataset: { id: row.user_id },
            // 整列都能點，勾勾的狀態由重畫決定；這一下照常冒泡到列上去切換。
            onClick: (event) => {
              event.preventDefault();
              if (document.activeElement === event.target) refocus = row.user_id;
            },
          })),
          el('td', { class: 'table__name' }, row.name || '(no name)'),
          el('td', { class: 'nowrap' }, row.join_at ? fmtDateTime(row.join_at) : el('span', {
            class: 'muted', title: 'Group Judge did not see them join (usually they were here before it was)',
          }, '—')),
          el('td', { class: 'table__num nowrap' }, fmtDays(row.silent_days)),
          el('td', {}, el('div', { class: 'notes' },
            rowNotes(row).map((n) => badge(n.text, n.tone, n.title)))),
        ]);
      })),
    ]));
  }

  function protectedSection() {
    const people = model.protectedRows;
    if (!people.length) return null;
    return el('details', { class: 'fold' }, [
      el('summary', {}, `Kept last time, skipped automatically this time (${people.length})`),
      el('p', { class: 'muted' },
        'You took them off the list last time, and last time’s months overlap with this one, so they are not listed twice. If they are still silent at the next cleanup they reappear. To deal with them now, use “Add”.'),
      el('table', { class: 'table' }, [
        el('thead', {}, el('tr', {}, [
          el('th', {}, 'LINE name'), el('th', {}, 'Kept on'), el('th', { class: 'table__num' }, 'Silent for'),
        ])),
        el('tbody', {}, people.map((p) => el('tr', {}, [
          el('td', { class: 'table__name' }, p.name || '(no name)'),
          el('td', {}, fmtDate(p.white_listed_at)),
          el('td', { class: 'table__num' }, fmtDays(p.silent_days)),
        ]))),
      ]),
    ]);
  }

  model.subscribe(render);
  load();

  return {
    node,
    hasUnsaved: () => model.loaded && model.touched,
    // 成員資料變了（讀取成員資料、標記離開）。名單有還沒存的變更時不重載，
    // 不然剛標好的會整個不見。
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
 * 「新增」的對話框：從在群組裡、還不在名單上的人裡面挑。
 * 回傳 Promise<成員陣列>（取消就是空的）。
 */
function pickMembers(candidates) {
  const chosen = new Set();
  let keyword = '';

  const { done } = openModal((close) => {
    const list = el('div', { class: 'picker__list' });
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
        return;
      }
      if (!shown.length) {
        clear(list).append(emptyState('No members match.'));
        return;
      }
      clear(list).append(el('table', { class: 'table table--pick' }, [
        el('thead', {}, el('tr', {}, [
          el('th', { class: 'table__check' }),
          el('th', {}, 'LINE name'),
          el('th', {}, 'Joined'),
          el('th', { class: 'table__num' }, 'Silent for'),
        ])),
        el('tbody', {}, shown.map((m) => el('tr', {
          class: chosen.has(m.id) ? 'is-selected' : '',
          onClick: () => {
            if (chosen.has(m.id)) chosen.delete(m.id);
            else chosen.add(m.id);
            renderList();
          },
        }, [
          el('td', { class: 'table__check' }, el('input', {
            type: 'checkbox', checked: chosen.has(m.id), 'aria-label': `Select ${m.name}`,
            onClick: (event) => event.preventDefault(),
          })),
          el('td', { class: 'table__name' }, m.name || '(no name)'),
          el('td', { class: 'nowrap' }, m.join_at ? fmtDateTime(m.join_at) : el('span', { class: 'muted' }, '—')),
          el('td', { class: 'table__num nowrap' }, fmtDays(m.silent_days)),
        ]))),
      ]));
    }

    const search = el('input', {
      class: 'field', type: 'search', placeholder: 'Search name', 'aria-label': 'Search name',
      onInput: (event) => {
        keyword = event.target.value;
        renderList();
      },
    });
    renderList();
    queueMicrotask(() => search.focus());

    return el('div', {}, [
      el('div', { class: 'modal__body picker' }, [search, list]),
      el('div', { class: 'modal__actions' }, [
        el('button', { class: 'btn btn--ghost', type: 'button', onClick: () => close([]) }, 'Cancel'),
        confirm,
      ]),
    ]);
  }, { title: 'Add members to the list', wide: true });

  return done.then((members) => members ?? []);
}
