import knex, { Knex } from 'knex';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const client = (process.env.DB_CLIENT || 'sqlite3').toLowerCase();
const migrationsDir = path.join(__dirname, '..', 'migrations');

// 源码直跑（tsx src/index.ts）时迁移是 .ts，编译后（node dist/index.js）是 .js。
// 按当前文件自己的扩展名判断，不写死。
// 写死的后果不是报错，是 knex 找不到任何迁移文件、当作「已是最新」静默通过 ——
// 线上会得到一张空库，而进程启动日志照样打印「自动迁移完成」，看起来一切正常。
const selfExt = path.extname(__filename);
const migrations = {
  directory: migrationsDir,
  extension: selfExt.slice(1),
  loadExtensions: [selfExt],
};

let config: Knex.Config;

if (client === 'mysql' || client === 'mysql2') {
  config = {
    client: 'mysql2',
    connection: {
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'hanyu_dazi',
      charset: 'utf8mb4',
    },
    pool: { min: 2, max: 10 },
    useNullAsDefault: true,
    migrations,
  };
} else {
  // 本地开发与线上都用 better-sqlite3：单文件、零安装、备份就是拷一个文件
  config = {
    client: 'better-sqlite3',
    connection: {
      filename: path.resolve(process.cwd(), process.env.DB_FILENAME || './data/hanyu-dazi.db'),
    },
    useNullAsDefault: true,
    // WAL：读写不互相阻塞；代价是备份前必须先 checkpoint（见方案书第十二节）
    pool: {
      afterCreate: (conn: any, done: (err?: Error) => void) => {
        try {
          conn.pragma('journal_mode = WAL');
          conn.pragma('foreign_keys = ON');
          done();
        } catch (e) {
          done(e as Error);
        }
      },
    },
    migrations,
  };
}

const db = knex(config);

export default db;
export type Db = typeof db;
