import type { Knex } from 'knex';

/**
 * 题目提示语（Day 1 下午，紧跟 20261123160000_content_keys）
 *
 * 契约 §4.2 的作答结果里有 `hint` 字段：答错时给学生一句「为什么」，
 * 而不是只给一个红叉。这句话是内容侧写的（content.json 每个知识点的 `hint`），
 * 所以必须有地方落库 —— 那就是这一列。
 *
 * nullable：`hint` 是内容里的可选字段，不是每个知识点都写；
 * 而且这张表可能已经有行了（本机已导入过一次），强加 NOT NULL 会在已有行上报错。
 * 导入脚本读到没有 `hint` 的知识点时写 null，不是空字符串 ——
 * 空串会让前端 `v-if="item.hint"` 判真，弹出一块空白提示条。
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('items', (t) => {
    t.string('hint', 200).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('items', (t) => {
    t.dropColumn('hint');
  });
}
