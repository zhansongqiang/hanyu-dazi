import type { Knex } from 'knex';

/**
 * 七张复用的核心表（来自 habit-arena，按汉语搭子的场景改造）
 *
 * 改造要点：
 *  - users：habit-arena 是微信 openid 登录，我们是用户名 + 密码（作业要求免登录门槛低）
 *  - checkins：habit-arena 挂在 challenge 上，我们挂在「完成任意一课」上，去掉 challenge_id
 *  - teams：habit-arena 是挑战内的队伍，我们是常驻学习小组，去掉 challenge_id，加邀请码
 *  - achievements：habit-arena 存的是「阶位解锁记录」，我们把它拆成
 *    achievements（印章定义，种子数据）+ user_achievements（谁得了哪枚章）
 *
 * 约定（沿用 habit-arena）：
 *  - 时间戳列 nullable，由应用层 localNowStr() 写入 'YYYY-MM-DD HH:mm:ss'，避开 SQLite/MySQL 时区差异
 *  - JSON 一律用 text 存
 *  - 布尔用 boolean，外键用 integer
 */
export async function up(knex: Knex): Promise<void> {
  // 1. users —— 账号
  await knex.schema.createTable('users', (t) => {
    t.increments('id').primary();
    t.string('username', 32).notNullable().unique();
    t.string('password_hash', 100).notNullable();
    t.string('nickname', 50).notNullable().defaultTo('');
    t.string('avatar_url', 500).nullable();
    t.string('status', 20).notNullable().defaultTo('active'); // active | banned
    t.dateTime('created_at').nullable();
    t.dateTime('updated_at').nullable();
  });

  // 2. checkins —— 每日打卡（一天一条；完成任意一课即触发，跨课不重复记）
  await knex.schema.createTable('checkins', (t) => {
    t.increments('id').primary();
    t.integer('user_id').notNullable();
    t.date('check_date').notNullable();
    t.integer('lesson_id').nullable(); // 触发当天打卡的那节课
    t.integer('xp_earned').notNullable().defaultTo(0);
    t.dateTime('created_at').nullable();
    t.unique(['user_id', 'check_date'], 'uq_checkin_per_day');
    t.index(['user_id', 'check_date'], 'idx_checkin_user_date');
  });

  // 3. user_streaks —— 连击缓存（断了清零，最长纪录保留）
  await knex.schema.createTable('user_streaks', (t) => {
    t.integer('user_id').primary();
    t.integer('current_streak').notNullable().defaultTo(0);
    t.integer('max_streak').notNullable().defaultTo(0);
    t.date('last_checkin_date').nullable();
    t.dateTime('updated_at').nullable();
  });

  // 4. teams —— 学习小组（2–8 人，邀请码加入）
  await knex.schema.createTable('teams', (t) => {
    t.increments('id').primary();
    t.string('name', 50).notNullable();
    t.string('invite_code', 12).notNullable().unique();
    t.integer('captain_id').notNullable();
    t.string('slogan', 100).nullable();
    t.dateTime('created_at').nullable();
  });

  // 5. team_members —— 小组成员
  await knex.schema.createTable('team_members', (t) => {
    t.increments('id').primary();
    t.integer('team_id').notNullable();
    t.integer('user_id').notNullable();
    t.dateTime('joined_at').nullable();
    t.unique(['team_id', 'user_id'], 'uq_team_member');
    t.index(['user_id'], 'idx_team_members_user');
  });

  // 6. achievements —— 印章定义
  await knex.schema.createTable('achievements', (t) => {
    t.increments('id').primary();
    t.string('code', 40).notNullable().unique(); // 稳定标识，代码里按 code 发章
    t.string('name', 30).notNullable(); // 印章名（朱砂刻字）
    t.string('description', 200).nullable();
    t.string('kind', 20).notNullable(); // unit | stroke | speak | streak | xp
    t.string('ref_key', 60).nullable(); // 关联的单元 key / 字数门槛等
    t.integer('threshold').nullable();
    t.integer('sort').notNullable().defaultTo(0);
  });

  // 7. user_achievements —— 已得印章
  await knex.schema.createTable('user_achievements', (t) => {
    t.increments('id').primary();
    t.integer('user_id').notNullable();
    t.integer('achievement_id').notNullable();
    t.dateTime('unlocked_at').nullable();
    t.unique(['user_id', 'achievement_id'], 'uq_user_achievement');
    t.index(['user_id'], 'idx_user_achievements_user');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('user_achievements');
  await knex.schema.dropTableIfExists('achievements');
  await knex.schema.dropTableIfExists('team_members');
  await knex.schema.dropTableIfExists('teams');
  await knex.schema.dropTableIfExists('user_streaks');
  await knex.schema.dropTableIfExists('checkins');
  await knex.schema.dropTableIfExists('users');
}
