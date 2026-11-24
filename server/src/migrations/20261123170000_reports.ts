import type { Knex } from 'knex';

/**
 * 举报表 —— 契约 §4.9，**全项目唯一的新表**（归属 be-api）。
 *
 * 只有这一张表是本项目新建的，其余七张（users/checkins/user_streaks/teams/
 * team_members/achievements/user_achievements）+ 课程六张都是复用/改造来的，
 * 见 20261123090000_reused_core 与 20261123150000_course_core 的注释。
 *
 * 沿用全局约定：
 *  - 时间戳列 nullable，由应用层 localNowStr() 写入 'YYYY-MM-DD HH:mm:ss'
 *    （**不用** SQLite 的 CURRENT_TIMESTAMP —— 那是 UTC，与本地 check_date 会错位）
 *  - 不加外键约束：与既有表一致（其余表也都没建 FK，靠应用层保证）
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('reports', (t) => {
    t.increments('id').primary();
    t.integer('reporter_id').notNullable();
    t.string('target_type', 20).notNullable(); // user | duel
    t.integer('target_id').notNullable();
    t.string('reason', 30).notNullable();
    t.string('detail', 200).nullable();
    t.string('status', 20).notNullable().defaultTo('open'); // open | handled
    t.dateTime('created_at').nullable();
    t.index(['target_type', 'target_id'], 'idx_reports_target');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('reports');
}
