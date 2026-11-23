/**
 * 看库：列出所有表 / 视图 / 索引，以及某个视图的定义。
 *
 * 为什么不直接在客户端里手敲 SQL：better-sqlite3 是原生模块，
 * 脚本必须待在 server/ 下才能解析到 node_modules —— 放到 /tmp 里 require 会 MODULE_NOT_FOUND
 * （Windows 上 /tmp 还会被解析成 C:\Users\...\Temp，路径对不上）。
 *
 * 用法：npx tsx scripts/db-inspect.ts [视图名]
 */
import Database from 'better-sqlite3';
import path from 'path';

const file = path.resolve(process.cwd(), process.env.DB_FILENAME || './data/hanyu-dazi.db');
const db = new Database(file, { readonly: true });

console.log(`库文件: ${file}\n`);

const rows = db
  .prepare(
    `SELECT type, name FROM sqlite_master
     WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE 'knex_%'
     ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'view' THEN 1 ELSE 2 END, name`
  )
  .all() as { type: string; name: string }[];

let lastType = '';
for (const r of rows) {
  if (r.type !== lastType) {
    console.log(`\n== ${r.type} ==`);
    lastType = r.type;
  }
  const n = r.type === 'table'
    ? (db.prepare(`SELECT COUNT(*) AS c FROM "${r.name}"`).get() as { c: number }).c
    : '';
  console.log(`  ${r.name}${n === '' ? '' : `  (${n} 行)`}`);
}

const target = process.argv[2];
if (target) {
  const row = db.prepare('SELECT sql FROM sqlite_master WHERE name = ?').get(target) as { sql: string } | undefined;
  console.log(`\n== ${target} 定义 ==`);
  console.log(row ? row.sql : '(不存在)');
}

db.close();
