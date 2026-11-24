import type { Knex } from 'knex';

/**
 * 印章定义种子（content 侧，契约 §4.7 / §6.2）
 *
 * ## 这里定义的只是「有哪些章」，不是「谁得了章」
 * 发章规则在 `src/services/stamps.ts`（be-api 归属），本文件只写 `achievements` 这张**定义表**。
 * 两者的接口就是 `ref_key` / `threshold` 两个字段：本文件写什么，那边就按什么判。
 *
 * ## ref_key 必须是 units.key
 * `services/stamps.ts` 的 unitAllDone / unitAllStrokesCorrect 都是
 * `db('units').where({ key: ref_key })` 去找单元，所以：
 *
 *   kind='unit'   ref_key = 单元 key  → 该单元**全部课时**都 done 才发
 *   kind='stroke' ref_key = 单元 key  → 该单元**全部描红题**（items.kind='stroke'）都答对过才发
 *   kind='streak' 用 threshold（连续打卡天数）
 *   kind='xp'     用 threshold（累计 XP）
 *
 * ⚠️ 由此推出一条必须守住的约束：**stroke 章的 ref_key 只能指向真的有描红题的单元**。
 * 描红题只出在单字知识点上（导入脚本：`kind === 'stroke' && text 长度 !== 1` 就跳过）。
 * 指向一个没有描红题的单元，`unitAllStrokesCorrect` 会因 `itemIds.length === 0` 直接 false ——
 * 这枚章**永远发不出去**，而且不会报任何错，只会一直灰着。
 * 所以下面三枚 stroke 章的 ref_key 是 basic-char / basic-word / advanced-char-radical，
 * 而不是「每个单元一枚」。改 content.json 时如果动了这三课的单字，这里要一起看。
 *
 * ## 为什么按 code upsert 而不是先清空
 * `user_achievements.achievement_id` 指着这张表。清空重插会换掉 id，
 * 已经拿到的章会全部对不上号 —— 用户打开印章墙，得来的章全没了，同样不会有报错。
 * 所以按 code 找：找到就更新文案，找不到才插入。连跑两遍结果相同。
 *
 * ## 单独跑
 *   npx tsx src/seeds/stamps.seed.ts       （会自己连库、打印结果、退出）
 * 正常路径是 import-content.ts 末尾调用它：改内容 → 重跑导入 → 印章跟着对齐。
 */

export interface StampSeedRow {
  code: string;
  name: string;
  description: string;
  kind: 'unit' | 'stroke' | 'streak' | 'xp';
  ref_key: string | null;
  threshold: number | null;
  sort: number;
}

/** 15 枚：6 单元 + 3 描红 + 3 连续 + 3 经验。契约要求 ≥12。 */
export const STAMP_SEEDS: StampSeedRow[] = [
  // ---- 单元章：跟着课程地图走，六个单元各一枚 ----
  {
    code: 'unit-basic-char',
    name: '初识汉字',
    description: '学完「象形入门」的全部课时',
    kind: 'unit',
    ref_key: 'basic-char',
    threshold: null,
    sort: 1,
  },
  {
    code: 'unit-basic-word',
    name: '生活词汇',
    description: '学完「日常词汇」的全部课时',
    kind: 'unit',
    ref_key: 'basic-word',
    threshold: null,
    sort: 2,
  },
  {
    code: 'unit-basic-sentence',
    name: '开口说话',
    description: '学完「开口说话」的全部课时',
    kind: 'unit',
    ref_key: 'basic-sentence',
    threshold: null,
    sort: 3,
  },
  {
    code: 'unit-advanced-char-radical',
    name: '偏旁小行家',
    description: '学完「偏旁识义」的全部课时',
    kind: 'unit',
    ref_key: 'advanced-char-radical',
    threshold: null,
    sort: 4,
  },
  {
    code: 'unit-advanced-word-city',
    name: '上街不求人',
    description: '学完「上街办事」的全部课时',
    kind: 'unit',
    ref_key: 'advanced-word-city',
    threshold: null,
    sort: 5,
  },
  {
    code: 'unit-extended-dialogue-daily',
    name: '办事能手',
    description: '学完「开口办事」的全部课时',
    kind: 'unit',
    ref_key: 'extended-dialogue-daily',
    threshold: null,
    sort: 6,
  },

  // ---- 描红章：ref_key 必须指向真的有描红题的单元（见文件头的约束） ----
  {
    code: 'stroke-basic-char',
    name: '笔顺入门',
    description: '把「象形入门」里的十二个象形字都描对一遍',
    kind: 'stroke',
    ref_key: 'basic-char',
    threshold: null,
    sort: 7,
  },
  {
    code: 'stroke-basic-word',
    name: '数字描红',
    description: '把「一、二、三、十」都描对一遍',
    kind: 'stroke',
    ref_key: 'basic-word',
    threshold: null,
    sort: 8,
  },
  {
    code: 'stroke-advanced-char-radical',
    name: '偏旁描红',
    description: '把「偏旁识义」里的十二个字都描对一遍',
    kind: 'stroke',
    ref_key: 'advanced-char-radical',
    threshold: null,
    sort: 9,
  },

  // ---- 连续打卡章：threshold = 连续天数 ----
  {
    code: 'streak-3',
    name: '三日不辍',
    description: '连续打卡 3 天',
    kind: 'streak',
    ref_key: null,
    threshold: 3,
    sort: 10,
  },
  {
    code: 'streak-7',
    name: '七日之约',
    description: '连续打卡 7 天',
    kind: 'streak',
    ref_key: null,
    threshold: 7,
    sort: 11,
  },
  {
    code: 'streak-14',
    name: '半月有恒',
    description: '连续打卡 14 天',
    kind: 'streak',
    ref_key: null,
    threshold: 14,
    sort: 12,
  },

  // ---- 经验章：threshold = 累计 XP（段位梯度：秀才 500 / 举人 1500 / 贡士 3000） ----
  {
    code: 'xp-500',
    name: '初出茅庐',
    description: '累计获得 500 点经验',
    kind: 'xp',
    ref_key: null,
    threshold: 500,
    sort: 13,
  },
  {
    code: 'xp-1500',
    name: '小有名气',
    description: '累计获得 1500 点经验',
    kind: 'xp',
    ref_key: null,
    threshold: 1500,
    sort: 14,
  },
  {
    code: 'xp-3000',
    name: '学有所成',
    description: '累计获得 3000 点经验',
    kind: 'xp',
    ref_key: null,
    threshold: 3000,
    sort: 15,
  },
];

export interface SeedResult {
  inserted: string[];
  updated: string[];
  unchanged: string[];
  /** 库里有、种子里没有的章：只报不删，可能是别的来源加的 */
  foreign: string[];
}

function toRow(s: StampSeedRow) {
  return {
    code: s.code,
    name: s.name,
    description: s.description,
    kind: s.kind,
    ref_key: s.ref_key,
    threshold: s.threshold,
    sort: s.sort,
  };
}

/**
 * 幂等写入印章定义。按 `code` 找：找到就更新，找不到才插入。
 * 不动库里有、种子里没有的行（只报告），也不删任何东西。
 */
export async function seedStamps(db: Knex): Promise<SeedResult> {
  const result: SeedResult = { inserted: [], updated: [], unchanged: [], foreign: [] };

  await db.transaction(async (trx) => {
    const existing = (await trx('achievements').select('code', 'name', 'description', 'kind', 'ref_key', 'threshold', 'sort')) as Array<
      Record<string, unknown>
    >;
    const byCode = new Map(existing.map((r) => [String(r.code), r]));

    for (const s of STAMP_SEEDS) {
      const row = toRow(s);
      const found = byCode.get(s.code);
      if (!found) {
        await trx('achievements').insert(row);
        result.inserted.push(s.code);
        continue;
      }
      const same =
        found.name === row.name &&
        (found.description ?? null) === row.description &&
        found.kind === row.kind &&
        (found.ref_key ?? null) === row.ref_key &&
        (found.threshold ?? null) === row.threshold &&
        Number(found.sort ?? 0) === row.sort;
      if (same) {
        result.unchanged.push(s.code);
      } else {
        await trx('achievements').where({ code: s.code }).update(row);
        result.updated.push(s.code);
      }
    }

    const known = new Set(STAMP_SEEDS.map((s) => s.code));
    for (const r of existing) {
      const code = String(r.code);
      if (!known.has(code)) result.foreign.push(code);
    }
  });

  return result;
}

/** 直接 `npx tsx src/seeds/stamps.seed.ts` 时自己跑一趟 */
async function runAsScript(): Promise<void> {
  const { default: db } = await import('../config/database');
  const r = await seedStamps(db);
  console.log('\n印章种子写入完成');
  console.log(`  新增 ${r.inserted.length}：${r.inserted.join(', ') || '(无)'}`);
  console.log(`  更新 ${r.updated.length}：${r.updated.join(', ') || '(无)'}`);
  console.log(`  未变 ${r.unchanged.length}`);
  if (r.foreign.length) {
    console.log(`  库里有、种子里没有（只报不删）：${r.foreign.join(', ')}`);
  }
  const total = Number(((await db('achievements').count({ c: '*' }).first()) as any)?.c ?? 0);
  console.log(`  achievements 共 ${total} 枚`);
  await db.destroy();
}

if (require.main === module) {
  runAsScript().catch(async (e) => {
    console.error('印章种子写入失败：', e);
    process.exit(1);
  });
}
