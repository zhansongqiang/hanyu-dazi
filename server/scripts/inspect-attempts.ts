/**
 * 只读探库 2：目标账号现有作答落在哪些题上、错题本 3 道是谁、别人的本周 XP
 *
 * 灌数据前必须知道这三件事：
 *  1. 错题本当前 3 道是哪些 item —— 灌数据时**不能**给它们补够 correct_since>=2，否则页面空掉
 *  2. 已有作答覆盖了哪些 item —— 避免重复插入同一 item 的重复行（虽不报错，但难看）
 *  3. 别人的本周 XP —— 灌完自己会排到第几，判断榜单是否还好看
 */
import Database from 'better-sqlite3';
import path from 'path';

const DB = process.env.DB_FILE
  ? path.resolve(process.env.DB_FILE)
  : path.resolve(__dirname, '../data/hanyu-dazi.db');
const username = process.argv[2] || 'apktest1124';

const db = new Database(DB, { readonly: true });
const q = (sql: string, ...args: any[]) => db.prepare(sql).all(...args) as any[];

const uid = (q('SELECT id FROM users WHERE username = ?', username)[0] as any)?.id;

console.log('== 现有 21 条作答 ==');
console.table(q(`
  SELECT a.id, a.item_id, a.lesson_id, i.kind, i.char, i.prompt, a.is_correct, a.user_answer, a.created_at,
         l.title AS lesson
  FROM attempts a
  LEFT JOIN items i ON i.id = a.item_id
  LEFT JOIN lessons l ON l.id = a.lesson_id
  WHERE a.user_id = ? ORDER BY a.id ASC`, uid));

console.log('\n== 错题本在册（correct_since < 2）==');
console.table(q(`
  SELECT w.item_id, i.kind, i.char, i.prompt, i.answer, w.wrong_times, w.correct_since, w.last_wrong_at
  FROM wrong_book w LEFT JOIN items i ON i.id = w.item_id
  WHERE w.user_id = ? ORDER BY w.wrong_times DESC, w.last_wrong_at DESC`, uid));

console.log('\n== 错题本全量（含已掌握）==');
console.table(q(`
  SELECT item_id, wrong_times, correct_since FROM wrong_book WHERE user_id = ?`, uid));

console.log('\n== lesson_progress 现有行 ==');
console.table(q('SELECT * FROM lesson_progress WHERE user_id = ?', uid));

console.log('\n== 全部用户的累计 XP / 本周 XP ==');
const WEEK_START = '2026-11-23 00:00:00';
console.table(q(`
  SELECT u.id, u.username,
    (SELECT COALESCE(SUM(amount),0) FROM xp_events e WHERE e.user_id = u.id) AS total_xp,
    (SELECT COALESCE(SUM(amount),0) FROM xp_events e WHERE e.user_id = u.id AND e.created_at >= '${WEEK_START}') AS week_xp
  FROM users u ORDER BY week_xp DESC`));

console.log('\n== 单元 1、2 的描红题（16 道，stroke 章判定源）==');
console.table(q(`
  SELECT i.id, i.lesson_id, i.kind, i.char, u.key AS unit_key
  FROM items i JOIN lessons l ON l.id = i.lesson_id JOIN units u ON u.id = l.unit_id
  WHERE u.key IN ('basic-char','basic-word') AND i.kind = 'stroke'
  ORDER BY u.id, i.lesson_id, i.id`));

console.log('\n== 单元 1、2 的题目总数（应 72 + 68 = 140）==');
console.table(q(`
  SELECT u.key, COUNT(*) AS items FROM items i
  JOIN lessons l ON l.id = i.lesson_id JOIN units u ON u.id = l.unit_id
  WHERE u.key IN ('basic-char','basic-word') GROUP BY u.key`));

db.close();
