import app from './app';
import db from './config/database';
import logger from './utils/logger';

const PORT = Number(process.env.PORT || 8091);
// 只监听回环：这台机器上还跑着学校那套生产系统，公网流量一律经 nginx 的 443 进来。
// 绑 0.0.0.0 等于把 8091 直接开到公网，且绕过了证书与限流。
const HOST = process.env.HOST || '127.0.0.1';

async function start() {
  // 1. 验证数据库连接
  try {
    await db.raw('SELECT 1');
    logger.info(`[DB] 连接成功 (client=${process.env.DB_CLIENT || 'sqlite3'}, file=${process.env.DB_FILENAME || './data/hanyu-dazi.db'})`);
  } catch (e) {
    logger.error('[DB] 连接失败: ' + (e as Error).message);
    process.exit(1);
  }

  // 2. 自动跑迁移（开发友好；生产设 AUTO_MIGRATE=false 走显式 npm run migrate）
  if (process.env.AUTO_MIGRATE !== 'false') {
    try {
      // 不要在这里传 loadExtensions —— 它会整个覆盖 config 里按 .ts/.js 判断好的那份，
      // 编译后就成了「只找 .ts、一个都找不到」，而 knex 找不到迁移是当「已是最新」静默通过：
      // 库是空的、日志写「自动迁移完成」、每个接口 500。让它用 config 的值。
      const [, migrations] = await db.migrate.latest();
      logger.info(`[DB] 自动迁移完成, 执行 ${migrations.length} 个文件`);
    } catch (e) {
      logger.error('[DB] 自动迁移失败: ' + (e as Error).message);
      console.error(e);
      process.exit(1);
    }
  }

  // 3. 监听端口
  app.listen(PORT, HOST, () => {
    logger.info(`[Server] 汉语搭子 后端启动: http://${HOST}:${PORT}`);
  });
}

start();
