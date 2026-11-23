import type { Knex } from 'knex';

/**
 * 课程核心七张表（Day 1 下午）
 *
 *   units / lessons / items / attempts / lesson_progress / duels / xp_events
 *
 * DDL 主体照抄方案书第六节，三处需要说明：
 *
 *  1) lessons / lesson_progress / xp_events 方案书只给了表名和作用，没给 DDL，这里自行设计，
 *     风格与迁移一保持一致（时间戳 nullable、JSON 用 text、布尔用 boolean、外键用 integer）。
 *
 *  2) 时间戳不写 DEFAULT CURRENT_TIMESTAMP。SQLite 的 CURRENT_TIMESTAMP 给的是 UTC，
 *     跟 checkins.check_date 的本地日期对不上；全项目统一由应用层 localNowStr() 写
 *     'YYYY-MM-DD HH:mm:ss'（本地时间）。列一律 nullable，不设数据库默认值。
 *
 *  3) wrong_book 视图在方案书的基础上多了一列 correct_since（最近一次答错之后又答对了几次）。
 *     方案书原版只能回答「错过几次」，答不出「还该不该留在错题本里」；
 *     而错题本页面对用户承诺的是「连着做对两次就自动移出去」。
 *     把判定放进视图里，页面就只需要一句 WHERE correct_since < 2，
 *     不必在接口层再拼一次 attempts —— 单一真源，不会两边算出不同结果。
 *
 * 录音表（recordings，争取项）不在这里建：它是收尾日才做的东西，
 * 到时候单独一个迁移，免得留一张五天没人写的空表。
 */
export async function up(knex: Knex): Promise<void> {
  // 1. units —— 课程单元：level（基础/进阶/拓展）× type（字/词/句/对话）
  await knex.schema.createTable('units', (t) => {
    t.increments('id').primary();
    t.string('level', 20).notNullable(); // basic | advanced | extended
    t.string('type', 20).notNullable(); // char | word | sentence | dialogue
    t.string('title', 60).notNullable();
    t.string('title_en', 120).nullable();
    t.string('intro', 200).nullable(); // 单元卡片上的一句话说明
    t.integer('sort').notNullable().defaultTo(0);
    t.index(['level', 'type', 'sort'], 'idx_units_level_type');
  });

  // 2. lessons —— 单元下的课时
  await knex.schema.createTable('lessons', (t) => {
    t.increments('id').primary();
    t.integer('unit_id').notNullable().references('id').inTable('units');
    t.string('title', 60).notNullable();
    t.string('title_en', 120).nullable();
    t.string('intro', 200).nullable();
    t.integer('est_minutes').notNullable().defaultTo(10); // 「每天一刻钟」得有个依据
    t.integer('sort').notNullable().defaultTo(0);
    t.index(['unit_id', 'sort'], 'idx_lessons_unit');
  });

  // 3. items —— 题目
  await knex.schema.createTable('items', (t) => {
    t.increments('id').primary();
    t.integer('lesson_id').notNullable().references('id').inTable('lessons');
    t.string('kind', 20).notNullable(); // recognize | pinyin | meaning | stroke | listen
    t.string('prompt', 200).notNullable();
    t.string('prompt_en', 300).nullable();
    t.text('options').nullable(); // JSON 数组，选择题才有
    t.string('answer', 200).notNullable();
    t.string('char', 8).nullable(); // 描红用，单字
    t.string('audio_url', 300).nullable();
    t.integer('sort').notNullable().defaultTo(0);
    t.index(['lesson_id', 'sort'], 'idx_items_lesson');
  });

  // 4. attempts —— 每次作答一行，错题本的唯一数据源
  await knex.schema.createTable('attempts', (t) => {
    t.increments('id').primary();
    t.integer('user_id').notNullable();
    t.integer('item_id').notNullable();
    t.integer('lesson_id').notNullable();
    t.boolean('is_correct').notNullable();
    t.string('user_answer', 200).nullable();
    t.integer('duration_ms').nullable();
    t.dateTime('created_at').nullable();
    // 错题本视图的主查询路径
    t.index(['user_id', 'is_correct', 'item_id'], 'idx_attempts_wrong');
    // 课时进度：「这一课我做过几遍、最高分多少」
    t.index(['user_id', 'lesson_id'], 'idx_attempts_user_lesson');
  });

  // 5. wrong_book —— 视图，不是表
  //    错题本不单独存一份，避免「答题记录说做对了、错题本说还错着」这种不一致。
  await knex.raw(`
    CREATE VIEW wrong_book AS
    SELECT
      a.user_id,
      a.item_id,
      SUM(CASE WHEN a.is_correct = 0 THEN 1 ELSE 0 END)     AS wrong_times,
      MAX(CASE WHEN a.is_correct = 0 THEN a.created_at END) AS last_wrong_at,
      SUM(CASE WHEN a.is_correct = 1 AND a.id > (
            SELECT MAX(b.id) FROM attempts b
            WHERE b.user_id = a.user_id AND b.item_id = a.item_id AND b.is_correct = 0
          ) THEN 1 ELSE 0 END)                              AS correct_since
    FROM attempts a
    GROUP BY a.user_id, a.item_id
    HAVING SUM(CASE WHEN a.is_correct = 0 THEN 1 ELSE 0 END) > 0
  `);

  // 6. lesson_progress —— 课时进度（每人每课一行）
  await knex.schema.createTable('lesson_progress', (t) => {
    t.increments('id').primary();
    t.integer('user_id').notNullable();
    t.integer('lesson_id').notNullable();
    t.string('status', 20).notNullable().defaultTo('in_progress'); // in_progress | done
    t.integer('best_score').notNullable().defaultTo(0);
    // 分数要带分母才有意义：只记「8 分」不知道满分是 8 还是 20
    t.integer('best_total').nullable();
    t.integer('attempts_count').notNullable().defaultTo(0);
    t.integer('last_item_id').nullable(); // 下次接着上次练
    t.dateTime('completed_at').nullable();
    t.dateTime('created_at').nullable();
    t.dateTime('updated_at').nullable();
    t.unique(['user_id', 'lesson_id'], 'uq_lesson_progress');
  });

  // 7. duels —— 异步 PK（对手可以是免注册游客，所以只留名字和分数）
  await knex.schema.createTable('duels', (t) => {
    t.increments('id').primary();
    t.string('code', 12).notNullable().unique(); // 6 位挑战码
    t.integer('lesson_id').notNullable();
    t.integer('challenger_id').notNullable();
    t.integer('challenger_score').nullable();
    t.integer('challenger_ms').nullable();
    t.string('opponent_name', 50).nullable();
    t.integer('opponent_score').nullable();
    t.integer('opponent_ms').nullable();
    t.string('status', 20).notNullable().defaultTo('open'); // open | done | expired
    t.dateTime('expires_at').nullable();
    t.dateTime('created_at').nullable();
    t.index(['status', 'expires_at'], 'idx_duels_status');
  });

  // 8. xp_events —— XP 流水，段位由此结算（只记正数：只做奖励，不做惩罚）
  await knex.schema.createTable('xp_events', (t) => {
    t.increments('id').primary();
    t.integer('user_id').notNullable();
    t.integer('amount').notNullable();
    t.string('reason', 30).notNullable(); // correct | wrong | lesson_done | streak | seal | duel
    t.string('ref_type', 20).nullable(); // attempt | lesson | achievement | duel | checkin
    t.integer('ref_id').nullable();
    t.string('note', 100).nullable();
    t.dateTime('created_at').nullable();
    t.index(['user_id', 'created_at'], 'idx_xp_user_time');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP VIEW IF EXISTS wrong_book');
  await knex.schema.dropTableIfExists('xp_events');
  await knex.schema.dropTableIfExists('duels');
  await knex.schema.dropTableIfExists('lesson_progress');
  await knex.schema.dropTableIfExists('attempts');
  await knex.schema.dropTableIfExists('items');
  await knex.schema.dropTableIfExists('lessons');
  await knex.schema.dropTableIfExists('units');
}
