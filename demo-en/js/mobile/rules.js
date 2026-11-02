// 自動產生（demo-en/tools/build.py），來源是 js/mobile/rules.js。不要手改：改 demo-en/tools/translations.py 再重跑。
/** 行動版｜版規頁籤：版規與群組額外規範，各自可以編輯。 */

import { clear, el, loadFailed, spinner } from '../ui.js';
import { editableText } from '../widgets.js';
import { EXTRA_RULES_EMPTY_NOTE, loadExtraRules, loadRules, saveExtraRules, saveRules } from '../logic/content.js';

export function createRulesView() {
  const node = el('div', { class: 'mview' });
  let editors = [];

  async function load() {
    clear(node).append(spinner());
    try {
      const [rules, extra] = await Promise.all([loadRules(), loadExtraRules()]);
      const rulesEditor = editableText({
        label: 'Current rules',
        value: rules.content,
        maxLength: rules.max_length,
        onSave: saveRules,
      });
      const extraEditor = editableText({
        label: 'Current extra guidelines',
        value: extra.content,
        maxLength: extra.max_length,
        onSave: saveExtraRules,
        note: EXTRA_RULES_EMPTY_NOTE,
      });
      editors = [rulesEditor, extraEditor];
      clear(node).append(
        el('div', { class: 'mview__head' }, [
          el('h1', {}, 'Rules'),
          el('p', {}, 'When someone in the group sends just “rules”, Group Judge replies with this text. In a private chat, only admins get the rules.'),
        ]),
        rulesEditor.node,
        el('div', { class: 'mview__head mview__head--next' }, [
          el('h2', {}, 'Extra guidelines'),
          el('p', {}, 'When someone in the group sends just “guidelines”, Group Judge replies with this text. In a private chat, only admins get it.'),
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
