import db from './config/database';
import logger from './utils/logger';

async function main() {
  const cmd = process.argv[2] || 'latest';
  const opt = { loadExtensions: ['.ts'] as const };
  logger.info(`[migrate] 执行: knex migrate:${cmd} (client=${process.env.DB_CLIENT})`);

  try {
    if (cmd === 'latest') {
      const [batch, migrations] = await db.migrate.latest(opt);
      logger.info(`[migrate] 完成 batch ${batch}, 共 ${migrations.length} 个文件`);
      migrations.forEach((m: string) => logger.info(`  - ${m}`));
    } else if (cmd === 'rollback') {
      const [batch, migrations] = await db.migrate.rollback(opt);
      logger.info(`[migrate] 回滚 batch ${batch}, ${migrations.length} 个文件`);
    } else if (cmd === 'status') {
      const s = await db.migrate.status(opt);
      logger.info(`[migrate] status = ${s}  (>0: 有待执行迁移, 0: 最新, <0: 已超最新)`);
    } else {
      logger.error(`[migrate] 未知命令: ${cmd} (支持 latest/rollback/status)`);
      process.exit(1);
    }
    await db.destroy();
    process.exit(0);
  } catch (err) {
    logger.error(`[migrate] 失败: ${(err as Error).message}`);
    console.error(err);
    process.exit(1);
  }
}

main();
