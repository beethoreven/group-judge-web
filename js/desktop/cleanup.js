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

  const addButton = asyncButton('新增', async () => {
    try {
      const { members } = await loadMembers();
      const chosen = await pickMembers(model.addable(members));
      model.add(chosen);
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

  // ── 畫面 ──

  function render() {
    const counts = model.counts();
    const mode = model.removeMode();
    removeButton.firstChild.textContent = mode === 'unmark' ? '取消移除' : '移除';
    removeButton.setDisabled(!mode);
    const summary = savedSummary(model);

    setChildren(node, [
      el('div', { class: 'view__head view__head--split' }, [
        el('div', {}, [
          el('h1', {}, '本次待移除名單'),
          el('p', {}, [
            '統計區間 ',
            el('strong', {}, `${fmtPlainDate(model.period.start)} – ${fmtPlainDate(model.period.end)}`),
            '：這段期間完全沒有發話的成員。區間內才加入的人不會列入。',
          ]),
        ]),
        el('div', { class: 'toolbar' }, [addButton, removeButton, saveButton]),
      ]),
      blindNotice(model.blindSince) && el('div', { class: 'notice' }, blindNotice(model.blindSince)),
      el('div', { class: 'statusline' }, [
        el('span', {}, [el('strong', {}, String(counts.kick)), ' 人在名單上']),
        counts.spare > 0 && el('span', {}, [el('strong', {}, String(counts.spare)), ' 人將移出']),
        counts.selected > 0 && el('span', {}, [
          `已選取 ${counts.selected} 人　`,
          el('button', { class: 'linklike', type: 'button', onClick: () => model.clearSelection() }, '取消選取'),
        ]),
        el('span', { class: 'statusline__saved' }, badge(summary.text, summary.tone)),
      ]),
      model.rows.length ? table() : emptyState('這段期間每個人都有發話，名單是空的。'),
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
        el('th', {}, 'LINE 名稱'),
        el('th', {}, '加入群組'),
        el('th', { class: 'table__num' }, '累積未發話'),
        el('th', {}, '備註'),
      ])),
      el('tbody', {}, model.rows.map((row) => {
        const selected = model.isSelected(row.user_id);
        return el('tr', {
          class: [row.state === 'spare' && 'is-spare', selected && 'is-selected'].filter(Boolean).join(' '),
          onClick: () => model.toggle(row.user_id),
        }, [
          el('td', { class: 'table__check' }, el('input', {
            type: 'checkbox', checked: selected, 'aria-label': `選取 ${row.name}`,
            dataset: { id: row.user_id },
            // 整列都能點，勾勾的狀態由重畫決定；這一下照常冒泡到列上去切換。
            onClick: (event) => {
              event.preventDefault();
              if (document.activeElement === event.target) refocus = row.user_id;
            },
          })),
          el('td', { class: 'table__name' }, row.name || '（沒有名字）'),
          el('td', { class: 'nowrap' }, row.join_at ? fmtDateTime(row.join_at) : el('span', {
            class: 'muted', title: '小判官沒看到他加入（多半是它進群之前就在的人）',
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
      el('summary', {}, `上次整理保留、這次自動略過的人（${people.length} 人）`),
      el('p', { class: 'muted' },
        '他們上次被你從名單上拿掉，而上次看的月份跟這次有重疊，所以這次不重複列入。下次整理如果還是沒有發話，就會再出現在名單上。想現在就處理，可以用「新增」把他加進來。'),
      el('table', { class: 'table' }, [
        el('thead', {}, el('tr', {}, [
          el('th', {}, 'LINE 名稱'), el('th', {}, '上次保留'), el('th', { class: 'table__num' }, '累積未發話'),
        ])),
        el('tbody', {}, people.map((p) => el('tr', {}, [
          el('td', { class: 'table__name' }, p.name || '（沒有名字）'),
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
        toast('名單有還沒儲存的變更，這一頁先不重新載入。');
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
      confirm.textContent = chosen.size ? `加入名單（${chosen.size} 人）` : '加入名單';
      confirm.disabled = chosen.size === 0;
      if (!candidates.length) {
        clear(list).append(emptyState('在群組裡的人都已經在名單上了。'));
        return;
      }
      if (!shown.length) {
        clear(list).append(emptyState('找不到符合的成員。'));
        return;
      }
      clear(list).append(el('table', { class: 'table table--pick' }, [
        el('thead', {}, el('tr', {}, [
          el('th', { class: 'table__check' }),
          el('th', {}, 'LINE 名稱'),
          el('th', {}, '加入群組'),
          el('th', { class: 'table__num' }, '累積未發話'),
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
            type: 'checkbox', checked: chosen.has(m.id), 'aria-label': `選取 ${m.name}`,
            onClick: (event) => event.preventDefault(),
          })),
          el('td', { class: 'table__name' }, m.name || '（沒有名字）'),
          el('td', { class: 'nowrap' }, m.join_at ? fmtDateTime(m.join_at) : el('span', { class: 'muted' }, '—')),
          el('td', { class: 'table__num nowrap' }, fmtDays(m.silent_days)),
        ]))),
      ]));
    }

    const search = el('input', {
      class: 'field', type: 'search', placeholder: '搜尋名稱', 'aria-label': '搜尋名稱',
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
        el('button', { class: 'btn btn--ghost', type: 'button', onClick: () => close([]) }, '取消'),
        confirm,
      ]),
    ]);
  }, { title: '新增成員到名單', wide: true });

  return done.then((members) => members ?? []);
}
