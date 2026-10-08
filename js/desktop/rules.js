/** 桌面版｜版規頁籤：版規與群組額外規範，各自可以編輯。 */

import { clear, el, loadFailed, spinner } from '../ui.js';
import { editableText } from '../widgets.js';
import { EXTRA_RULES_EMPTY_NOTE, loadExtraRules, loadRules, saveExtraRules, saveRules } from '../logic/content.js';

export function createRulesView() {
  const node = el('div', { class: 'view view--narrow' });
  let editors = [];

  async function load() {
    clear(node).append(spinner());
    try {
      const [rules, extra] = await Promise.all([loadRules(), loadExtraRules()]);
      const rulesEditor = editableText({
        label: '目前的版規',
        value: rules.content,
        maxLength: rules.max_length,
        onSave: saveRules,
      });
      const extraEditor = editableText({
        label: '目前的群組額外規範',
        value: extra.content,
        maxLength: extra.max_length,
        onSave: saveExtraRules,
        note: EXTRA_RULES_EMPTY_NOTE,
      });
      editors = [rulesEditor, extraEditor];
      clear(node).append(
        el('div', { class: 'view__head' }, [
          el('h1', {}, '版規'),
          el('p', {}, '任何人在群組裡輸入「版規」或「板規」（整則訊息只有這兩個字，不必 tag），小判官就會回下面這段文字。私訊它的話只有管理員會得到版規。'),
        ]),
        rulesEditor.node,
        el('div', { class: 'view__head view__head--next' }, [
          el('h2', {}, '群組額外規範'),
          el('p', {}, '任何人在群組裡輸入「群組額外規範」（整則訊息只有這六個字，不必 tag），小判官就會回下面這段文字。私訊它的話只有管理員會得到這段文字。'),
        ]),
        extraEditor.node,
      );
    } catch (err) {
      clear(node).append(loadFailed(err.message, load));
    }
  }

  load();
  return { node, hasUnsaved: () => editors.some((editor) => editor.isDirty()) };
}
