/**
 * 只读探库：录屏演示账号的底牌 + 课程内容分布（决定能灌出哪几枚章）
 *
 * 只读打开，不加锁、不写库 —— 后端此刻正开着同一个文件（WAL），
 * 读走 `readonly: true` 是安全的。
 *
 * 跑法： npx tsx scripts/inspect-demo.ts [用户名]
 */
import Database from 'better-sqlite3';
import path from 'path';

const DB = process.env.DB_FILE
  ? path.resolve(process.env.DB_FILE)
  : path.resolve(__dirname, '../data/hanyu-dazi.db');
const username = process.argv[2] || 'apktest1124';

const db = new Database(DB, { readonly: true });
const q = (sql: string, ...args: any[]) => db.prepare(sql).all(...args) as any[];

console.log(`DB = ${DB}`);
console.log(`账号 = ${username}\n`);

// ---- 1. 用户 ----
const users = q('SELECT id, username, nickname, status, created_at FROM users WHERE username = ?', username);
console.log('== users ==');
console.log(JSON.stringify(users, null, 1));
if (!users.length) {
  console.log('!! 找不到该账号');
  process.exit(1);
}
const uid = users[0].id;

// ---- 2. 单元 × 课时 × 描红题 ----
console.log('\n== units / lessons / stroke-items ==');
const units = q(`
  SELECT u.id, u.key, u.title, u.level, u.type, u.sort,
         (SELECT COUNT(*) FROM lessons l WHERE l.unit_id = u.id) AS lessons,
         (SELECT COUNT(*) FROM items i JOIN lessons l2 ON i.lesson_id = l2.id
            WHERE l2.unit_id = u.id AND i.kind = 'stroke') AS stroke_items,
         (SELECT COUNT(*) FROM items i JOIN lessons l2 ON i.lesson_id = l2.id
            WHERE l2.unit_id = u.id) AS items
  FROM units u ORDER BY u.id ASC`);
console.table(units);

// ---- 3. 全部课时 ----
console.log('\n== all lessons ==');
console.table(q(`
  SELECT l.id, l.key, l.unit_id, u.key AS unit_key, l.title, l.sort,
         (SELECT COUNT(*) FROM items i WHERE i.lesson_id = l.id) AS items
  FROM lessons l JOIN units u ON u.id = l.unit_id
  ORDER BY l.unit_id ASC, l.sort ASC, l.id ASC`));

// ---- 4. 目标账号现状 ----
console.log('\n== 该账号现状 ==');
const scalar = (sql: string) => (db.prepare(sql).get(uid) as any)?.v ?? null;
console.log('checkins          =', scalar('SELECT COUNT(*) v FROM checkins WHERE user_id = ?'));
console.log('user_streaks      =', JSON.stringify(q('SELECT * FROM user_streaks WHERE user_id = ?', uid)));
console.log('attempts 总数     =', scalar('SELECT COUNT(*) v FROM attempts WHERE user_id = ?'));
console.log('attempts 答对     =', scalar('SELECT COUNT(*) v FROM attempts WHERE user_id = ? AND is_correct = 1'));
console.log('lesson_progress   =', scalar('SELECT COUNT(*) v FROM lesson_progress WHERE user_id = ?'));
console.log('  ...其中 done    =', scalar("SELECT COUNT(*) v FROM lesson_progress WHERE user_id = ? AND status = 'done'"));
console.log('xp_events 条数    =', scalar('SELECT COUNT(*) v FROM xp_events WHERE user_id = ?'));
console.log('xp 累计           =', scalar('SELECT COALESCE(SUM(amount),0) v FROM xp_events WHERE user_id = ?'));
console.log('user_achievements =', scalar('SELECT COUNT(*) v FROM user_achievements WHERE user_id = ?'));
console.log('错题本在册        =', scalar('SELECT COUNT(*) v FROM wrong_book WHERE user_id = ? AND correct_since < 2'));
console.log('xp_events by reason =', JSON.stringify(q('SELECT reason, COUNT(*) n, SUM(amount) s FROM xp_events WHERE user_id = ? GROUP BY reason', uid)));

// ---- 5. 印章墙现状 ----
console.log('\n== achievements 定义 × 该账号是否已得 ==');
console.table(q(`
  SELECT a.id, a.code, a.name, a.kind, a.ref_key, a.threshold, a.sort,
         (SELECT COUNT(*) FROM user_achievements ua WHERE ua.achievement_id = a.id AND ua.user_id = ?) AS earned
  FROM achievements a ORDER BY a.sort ASC, a.id ASC`, uid));

// ---- 6. 排行相关的其他账号（同榜有谁）----
console.log('\n== users 全表（看榜上还有谁） ==');
console.table(q('SELECT id, username, nickname, created_at FROM users ORDER BY id ASC'));

db.close();
