/** 桌面版｜版規頁籤：顯示目前的版規，可以編輯。 */

import { clear, el, loadFailed, spinner } from '../ui.js';
import { editableText } from '../widgets.js';
import { loadRules, saveRules } from '../logic/content.js';

export function createRulesView() {
  const node = el('div', { class: 'view view--narrow' });
  let editor = null;

  async function load() {
    clear(node).append(spinner());
    try {
      const rules = await loadRules();
      editor = editableText({
        label: '目前的版規',
        value: rules.content,
        maxLength: rules.max_length,
        onSave: saveRules,
      });
      clear(node).append(
        el('div', { class: 'view__head' }, [
          el('h1', {}, '版規'),
          el('p', {}, '任何人在群組裡輸入「版規」或「板規」（整則訊息只有這兩個字，不必 tag），小判官就會回下面這段文字。私訊它的話只有管理員會得到版規。'),
        ]),
        editor.node,
      );
    } catch (err) {
      clear(node).append(loadFailed(err.message, load));
    }
  }

  load();
  return { node, hasUnsaved: () => editor?.isDirty() ?? false };
}
