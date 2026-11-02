// 自動產生（demo-en/tools/build.py），來源是 js/logic/content.js。不要手改：改 demo-en/tools/translations.py 再重跑。
/**
 * 版規與訊息：跟後端拿資料、存資料。兩種版面共用，這裡不碰畫面。
 */

import { api } from '../api.js';

export const loadRules = () => api.get('/api/rules');

/** 存版規，回傳存好的內容。 */
export async function saveRules(content) {
  return (await api.put('/api/rules', { content })).content;
}

/** 群組額外規範：跟版規同一套，各自一份內容。 */
export const loadExtraRules = () => api.get('/api/extra-rules');

/** 存群組額外規範，回傳存好的內容。 */
export async function saveExtraRules(content) {
  return (await api.put('/api/extra-rules', { content })).content;
}

/** 群組額外規範是空白的時候會怎樣——兩種版面共用這一句。 */
export const EXTRA_RULES_EMPTY_NOTE = 'Leave it empty and Group Judge does not respond when someone types this keyword.';

/** 訊息頁籤的全部內容：{ groups, variables, max_length, max_per_reply } */
export const loadMessages = () => api.get('/api/messages');

/** 存一則訊息，回傳存好的內容。 */
export async function saveMessage(id, content) {
  return (await api.put(`/api/messages/${id}`, { content })).content;
}

/** 某一區實際發出去的樣子（變數換成真的值）。回傳文字陣列。 */
export async function previewGroup(key) {
  return (await api.get('/api/messages/preview', { group: key })).texts;
}
