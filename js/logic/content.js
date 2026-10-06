/**
 * 版規與訊息：跟後端拿資料、存資料。兩種版面共用，這裡不碰畫面。
 */

import { api } from '../api.js';

export const loadRules = () => api.get('/api/rules');

/** 存版規，回傳存好的內容。 */
export async function saveRules(content) {
  return (await api.put('/api/rules', { content })).content;
}

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
