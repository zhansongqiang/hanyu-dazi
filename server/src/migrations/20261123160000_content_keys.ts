import type { Knex } from 'knex';

/**
 * 内容侧的稳定标识（Day 1 下午，紧跟 20261123150000_course_core）
 *
 * 为什么要加这三列：content.json 是课程内容的唯一来源，接下来五天会反复改它、
 * 反复重导入。重导入必须做到「改了什么就更新什么」，而不是清空重插 ——
 * items 这条记录被 attempts.item_id 指着，删掉再插一遍会让所有答题记录
 * 指向不存在的题，错题本和课时进度当场全空，而且用户看不见任何报错。
 * 要用「更新」，就得先有能对上号的列。
 *
 *   units.key    content.json 里手写的单元标识，如 basic-char
 *   lessons.key  课时标识，如 basic-char-nature
 *   items.point_key  知识点标识，同一个知识点展开出的多条题共用它
 *
 * 都 nullable：这张表可能已经有行（本机已导入过一次），
 * 强加 NOT NULL 会在已有行上报错。但唯一约束照开 ——
 * SQLite 的唯一索引把多个 NULL 视为互不相同，所以已有行不受影响，
 * 而重复的 key 会被当场挡下来。导入脚本万一哪天写错了匹配逻辑，
 * 宁可在导入时报错，也不要悄悄多出一份重复的题。
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('units', (t) => {
    t.string('key', 60).nullable();
    t.unique(['key'], 'uq_units_key');
  });

  await knex.schema.alterTable('lessons', (t) => {
    t.string('key', 60).nullable();
    t.unique(['key'], 'uq_lessons_key');
  });

  await knex.schema.alterTable('items', (t) => {
    t.string('point_key', 60).nullable();
    // 一个知识点 × 一种题型 = 一条题。重复插入直接报错，不留下两份。
    t.unique(['lesson_id', 'point_key', 'kind'], 'uq_items_point_kind');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('items', (t) => {
    t.dropUnique(['lesson_id', 'point_key', 'kind'], 'uq_items_point_kind');
    t.dropColumn('point_key');
  });
  await knex.schema.alterTable('lessons', (t) => {
    t.dropUnique(['key'], 'uq_lessons_key');
    t.dropColumn('key');
  });
  await knex.schema.alterTable('units', (t) => {
    t.dropUnique(['key'], 'uq_units_key');
    t.dropColumn('key');
  });
}
