/**
 * 把 content/content.json 展开成 units / lessons / items 三张表。
 *
 * 用法：npx tsx scripts/import-content.ts      （在 server/ 下跑）
 *
 * 两个必须说明的决定：
 *
 * 1) 按 key 更新，不清空重插。
 *    items 被 attempts.item_id 指着。删掉再插一遍，所有答题记录就指向不存在的题 ——
 *    错题本和课时进度当场变空，而且用户那侧看不到任何报错，只会觉得「我的记录没了」。
 *    所以每个单元 / 课时 / 题都先按 key 找一趟：找到就更新，找不到才插入。
 *    连跑两遍结果完全相同。
 *
 * 2) 干扰项由 key 做确定性打散。
 *    干扰项从同一个课时的兄弟知识点里取。如果每次导入随机取，同一条题的选项会在
 *    两次导入之间变样，用户复习时看到的是另一套选项 —— 明明内容没动，却像是题目改了。
 *    拿知识点 key 当随机种子，只要 content.json 不改，选项就一直是那一组。
 *
 * 校验先跑完再写库：内容文件是手写的，宁可一次性把十处错误全列出来，
 * 也不要改一处、跑一次、再报下一处。
 */
import fs from 'fs';
import path from 'path';
import db from '../src/config/database';

type Kind = 'recognize' | 'pinyin' | 'meaning' | 'stroke' | 'listen';
type Field = 'text' | 'pinyin' | 'gloss';

const KINDS: Kind[] = ['recognize', 'pinyin', 'meaning', 'stroke', 'listen'];
const LEVELS = ['basic', 'advanced', 'extended'];
const TYPES = ['char', 'word', 'sentence', 'dialogue'];
const KEY_RE = /^[a-z0-9-]+$/; // 纯 ASCII：要当音频文件名用
const DISTRACTORS = 3; // 加答案共 4 个选项

const INSTRUCTION: Record<Kind, string> = {
  recognize: '选出正确的拼音',
  pinyin: '选出对应的汉字',
  meaning: '选出正确的中文意思',
  listen: '听音频，选出你听到的内容',
  stroke: '跟着笔画写一遍',
};
const INSTRUCTION_EN: Record<Kind, string> = {
  recognize: 'Choose the correct pinyin.',
  pinyin: 'Choose the matching characters.',
  meaning: 'Choose the correct meaning.',
  listen: 'Listen and choose what you hear.',
  stroke: 'Trace the character stroke by stroke.',
};

interface Point {
  key: string;
  text: string;
  pinyin: string;
  gloss: string;
  hint?: string;
  kinds?: Kind[];
}
interface Lesson {
  key: string;
  title: string;
  title_en?: string;
  intro?: string;
  est_minutes?: number;
  kinds?: Kind[];
  points: Point[];
}
interface Unit {
  key: string;
  level: string;
  type: string;
  title: string;
  title_en?: string;
  intro?: string;
  lessons: Lesson[];
}
interface Content {
  units: Unit[];
}
/** 摊平后的一项：知识点带着它所属的课时和单元，干扰项要靠这个跨层级取 */
interface Flat {
  point: Point;
  lesson: Lesson;
  unit: Unit;
}

const contentDir = path.resolve(__dirname, '..', 'content');
const audioDir = path.join(contentDir, 'audio');
const contentFile = path.join(contentDir, 'content.json');

// ---------------------------------------------------------------- 确定性随机

/** FNV-1a：把 key 压成一个 32 位种子。要的不是随机性好，是「同样的输入永远同样的输出」。 */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function shuffled<T>(arr: T[], seed: string): T[] {
  let a32 = hash(seed);
  const rnd = () => {
    a32 = (a32 + 0x6d2b79f5) | 0;
    let t = Math.imul(a32 ^ (a32 >>> 15), 1 | a32);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ------------------------------------------------------------------ 展开题目

interface ItemRow {
  point_key: string;
  kind: Kind;
  prompt: string;
  prompt_en: string;
  options: string | null;
  answer: string;
  char: string | null;
  audio_url: string | null;
  sort: number;
}

/**
 * 挑干扰项：先同课时，不够向同单元、同难度扩。
 *
 * 三层的顺序必须保住 —— 先按层取满，某层不够才往下一层要。
 * 如果先把三层合成一个池子再洗牌（第一版就是这么写的），
 * 「日」的选拼音题会配上整句的拼音 qǐng zài shuō yí biàn：
 * 正确答案一眼就看出是最短的那个，题等于白出。
 * 同层取满后，干扰项天然同质 —— 选拼音时不会混进英文，选词义时不会混进别的词类。
 */
function pickDistractors(field: Field, self: Flat, all: Flat[], tag: string): string[] {
  const answer = self.point[field];
  const others = all.filter((x) => x.point.key !== self.point.key && x.point[field] !== answer);
  const tiers = [
    others.filter((x) => x.lesson.key === self.lesson.key),
    others.filter((x) => x.unit.key === self.unit.key && x.lesson.key !== self.lesson.key),
    others.filter((x) => x.unit.level === self.unit.level && x.unit.key !== self.unit.key),
  ];

  const out: string[] = [];
  for (let i = 0; i < tiers.length; i++) {
    const values = shuffled(
      [...new Set(tiers[i].map((x) => x.point[field]))],
      `${self.point.key}:${tag}:tier${i}`
    );
    for (const v of values) {
      if (out.length >= DISTRACTORS) break;
      if (!out.includes(v)) out.push(v);
    }
    if (out.length >= DISTRACTORS) break;
  }
  return out;
}

function makeOptions(
  self: Flat,
  all: Flat[],
  field: Field,
  tag: string
): { options: string[]; short: boolean } {
  const picked = pickDistractors(field, self, all, tag);
  return {
    options: shuffled([self.point[field], ...picked], `${self.point.key}:${tag}:order`),
    short: picked.length < DISTRACTORS,
  };
}

function expand(self: Flat, all: Flat[], kinds: Kind[], order: number, hasAudio: boolean): ItemRow[] {
  const p = self.point;
  const rows: ItemRow[] = [];

  for (const kind of kinds) {
    // 音频不在位就不出这道题。宁可这一课少一种练法，
    // 也不要放一个点了没声音的喇叭在那儿 —— 那才是真的坏。
    if (kind === 'listen' && !hasAudio) continue;
    if (kind === 'stroke' && [...p.text].length !== 1) continue; // 描红只能描单字

    let prompt: string;
    let answer: string;
    let options: string[] | null = null;
    let field: Field | null = null;

    switch (kind) {
      case 'recognize': // 给汉字，选拼音
        prompt = p.text;
        answer = p.pinyin;
        field = 'pinyin';
        break;
      case 'pinyin': // 给拼音，选汉字
        prompt = p.pinyin;
        answer = p.text;
        field = 'text';
        break;
      case 'meaning': // 给汉字，选英文意思
        prompt = p.text;
        answer = p.gloss;
        field = 'gloss';
        break;
      case 'listen': // 给音频，选汉字。prompt 是提示语，不能放答案
        prompt = INSTRUCTION.listen;
        answer = p.text;
        field = 'text';
        break;
      case 'stroke': // 米字格描红
        prompt = p.text;
        answer = p.text;
        break;
    }

    if (field) {
      const r = makeOptions(self, all, field, kind);
      options = r.options;
      if (r.short) {
        shortPool.push(
          `${p.key} / ${kind}：干扰项只凑到 ${r.options.length - 1} 个（同课时、同单元、同难度的知识点加起来不够）`
        );
      }
    }

    rows.push({
      point_key: p.key,
      kind,
      prompt,
      prompt_en: INSTRUCTION_EN[kind],
      options: options ? JSON.stringify(options) : null,
      answer,
      char: kind === 'stroke' ? p.text : null,
      audio_url: kind === 'listen' ? `/audio/${p.key}.mp3` : null,
      sort: order * 10 + rows.length + 1,
    });
  }
  return rows;
}

// -------------------------------------------------------------------- 校验

const errors: string[] = [];
const shortPool: string[] = [];
const staleDeleted: string[] = [];
const staleKept: string[] = [];
const orphanUnits: string[] = [];
const orphanLessons: string[] = [];

function loadContent(): Content {
  if (!fs.existsSync(contentFile)) {
    console.error(`找不到内容文件：${contentFile}`);
    process.exit(1);
  }
  let parsed: Content;
  try {
    parsed = JSON.parse(fs.readFileSync(contentFile, 'utf8')) as Content;
  } catch (e) {
    console.error(`content.json 不是合法 JSON：${(e as Error).message}`);
    process.exit(1);
  }
  if (!Array.isArray(parsed.units)) {
    console.error('content.json 顶层必须是 { units: [...] }');
    process.exit(1);
  }
  return parsed;
}

function validate(c: Content): void {
  const unitKeys = new Set<string>();
  const lessonKeys = new Set<string>();
  const pointKeys = new Set<string>();

  c.units.forEach((u, ui) => {
    const at = `units[${ui}]`;
    if (!u.key || !KEY_RE.test(u.key)) errors.push(`${at}.key 缺失或不是纯小写 ASCII：${u.key}`);
    else if (unitKeys.has(u.key)) errors.push(`${at}.key 重复：${u.key}`);
    else unitKeys.add(u.key);

    if (!LEVELS.includes(u.level)) errors.push(`${at}.level 只能是 ${LEVELS.join(' / ')}：${u.level}`);
    if (!TYPES.includes(u.type)) errors.push(`${at}.type 只能是 ${TYPES.join(' / ')}：${u.type}`);
    if (!u.title) errors.push(`${at}.title 不能为空`);
    if (!Array.isArray(u.lessons) || u.lessons.length === 0) errors.push(`${at}.lessons 不能为空`);

    (u.lessons || []).forEach((l, li) => {
      const lat = `${at}.lessons[${li}]`;
      if (!l.key || !KEY_RE.test(l.key)) errors.push(`${lat}.key 缺失或不是纯小写 ASCII：${l.key}`);
      else if (lessonKeys.has(l.key)) errors.push(`${lat}.key 重复：${l.key}`);
      else lessonKeys.add(l.key);

      if (!l.title) errors.push(`${lat}.title 不能为空`);
      if (!Array.isArray(l.points) || l.points.length === 0) errors.push(`${lat}.points 不能为空`);
      for (const k of l.kinds || []) {
        if (!KINDS.includes(k)) errors.push(`${lat}.kinds 里有未知题型：${k}`);
      }

      (l.points || []).forEach((p, pi) => {
        const pat = `${lat}.points[${pi}]`;
        if (!p.key || !KEY_RE.test(p.key)) errors.push(`${pat}.key 缺失或不是纯小写 ASCII：${p.key}`);
        else if (pointKeys.has(p.key)) {
          errors.push(`${pat}.key 全局重复：${p.key}（音频文件名靠它，不能两处同名）`);
        } else pointKeys.add(p.key);

        if (!p.text) errors.push(`${pat}.text 不能为空`);
        if (!p.pinyin) errors.push(`${pat}.pinyin 不能为空（${p.key}）`);
        if (!p.gloss) errors.push(`${pat}.gloss 不能为空（${p.key}）—— 选词义题的选项就是它`);

        if (p.kinds && p.kinds.length === 0) {
          errors.push(`${pat}.kinds 是空数组 —— 想继承所属课时的就别写这个字段`);
        }
        const kinds = p.kinds ?? l.kinds;
        if (!kinds || kinds.length === 0) {
          errors.push(`${pat}（${p.key}）没有 kinds，所属课时也没给默认值`);
        }
        for (const k of kinds || []) {
          if (!KINDS.includes(k)) errors.push(`${pat}.kinds 里有未知题型：${k}`);
        }
        if (kinds?.includes('stroke') && [...(p.text || '')].length !== 1) {
          errors.push(`${pat}（${p.key}）要出描红题，但 text 不是单字：${p.text}`);
        }
      });
    });
  });
}

// ---------------------------------------------------------------------- 主流程

async function main(): Promise<void> {
  const content = loadContent();
  validate(content);
  if (errors.length) {
    console.error(`content.json 有 ${errors.length} 处问题，一个字都没写进库：\n`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  // 摊平，供干扰项跨层级取用
  const all: Flat[] = [];
  for (const unit of content.units) {
    for (const lesson of unit.lessons) {
      for (const point of lesson.points) all.push({ point, lesson, unit });
    }
  }
  const nLessonsTotal = content.units.reduce((a, u) => a + u.lessons.length, 0);

  const audioKeys = new Set<string>(
    fs.existsSync(audioDir)
      ? fs
          .readdirSync(audioDir)
          .filter((f) => f.endsWith('.mp3'))
          .map((f) => f.replace(/\.mp3$/, ''))
      : []
  );

  let nUnitsNew = 0;
  let nUnitsUpd = 0;
  let nLessonsNew = 0;
  let nLessonsUpd = 0;
  let nItemsNew = 0;
  let nItemsUpd = 0;
  let nNoAudio = 0;
  const writtenItemIds: number[] = [];
  const importedLessonIds: number[] = [];

  await db.transaction(async (trx) => {
    for (let ui = 0; ui < content.units.length; ui++) {
      const u = content.units[ui];
      const unitRow = {
        key: u.key,
        level: u.level,
        type: u.type,
        title: u.title,
        title_en: u.title_en ?? null,
        intro: u.intro ?? null,
        sort: ui + 1,
      };
      const foundUnit = await trx('units').where({ key: u.key }).first();
      let unitId: number;
      if (foundUnit) {
        await trx('units').where({ id: foundUnit.id }).update(unitRow);
        unitId = Number(foundUnit.id);
        nUnitsUpd++;
      } else {
        const ids = (await trx('units').insert(unitRow)) as unknown as number[];
        unitId = Number(Array.isArray(ids) ? ids[0] : ids);
        nUnitsNew++;
      }

      for (let li = 0; li < u.lessons.length; li++) {
        const l = u.lessons[li];
        const lessonRow = {
          key: l.key,
          unit_id: unitId,
          title: l.title,
          title_en: l.title_en ?? null,
          intro: l.intro ?? null,
          est_minutes: l.est_minutes ?? 10,
          sort: li + 1,
        };
        const foundLesson = await trx('lessons').where({ key: l.key }).first();
        let lessonId: number;
        if (foundLesson) {
          await trx('lessons').where({ id: foundLesson.id }).update(lessonRow);
          lessonId = Number(foundLesson.id);
          nLessonsUpd++;
        } else {
          const ids = (await trx('lessons').insert(lessonRow)) as unknown as number[];
          lessonId = Number(Array.isArray(ids) ? ids[0] : ids);
          nLessonsNew++;
        }
        importedLessonIds.push(lessonId);

        for (let pi = 0; pi < l.points.length; pi++) {
          const p = l.points[pi];
          const kinds = (p.kinds ?? l.kinds ?? []) as Kind[];
          const hasAudio = audioKeys.has(p.key);
          if (kinds.includes('listen') && !hasAudio) nNoAudio++;

          const self = all.find((x) => x.point.key === p.key)!;
          for (const r of expand(self, all, kinds, pi, hasAudio)) {
            const { point_key, ...fields } = r;
            const found = await trx('items')
              .where({ lesson_id: lessonId, point_key, kind: r.kind })
              .first();
            if (found) {
              await trx('items').where({ id: found.id }).update(fields);
              writtenItemIds.push(Number(found.id));
              nItemsUpd++;
            } else {
              const ids = (await trx('items')
                .insert({ lesson_id: lessonId, point_key, ...fields })) as unknown as number[];
              writtenItemIds.push(Number(Array.isArray(ids) ? ids[0] : ids));
              nItemsNew++;
            }
          }
        }
      }
    }

    // 内容里已经没有的题：只扫本次导入的课时，别去动别人的地盘。
    // 且只有没人作答过才删 —— 作答过的留着：删了会让那些答题记录指向不存在的题，
    // 这正是整套导入逻辑一开始就要避开的后果。
    const stale = await trx('items')
      .whereIn('lesson_id', importedLessonIds)
      .whereNotIn('id', writtenItemIds.length ? writtenItemIds : [-1])
      .select('id', 'kind', 'prompt');
    for (const s of stale) {
      const used = await trx('attempts').where({ item_id: s.id }).first();
      if (used) {
        staleKept.push(`#${s.id} ${s.kind}「${s.prompt}」—— 已被作答过，保留`);
      } else {
        await trx('items').where({ id: s.id }).delete();
        staleDeleted.push(`#${s.id} ${s.kind}「${s.prompt}」`);
      }
    }

    // 库里有、内容里没有的单元和课时：只报不删。
    // 删课时会连带一串东西（进度、题），这不是导入脚本该自作主张的事。
    const dbUnits = await trx('units').select('id', 'key', 'title');
    const dbLessons = await trx('lessons').select('id', 'key', 'title');
    for (const du of dbUnits) {
      if (!content.units.some((u) => u.key === du.key)) orphanUnits.push(`#${du.id} ${du.key}（${du.title}）`);
    }
    for (const dl of dbLessons) {
      if (!all.some((x) => x.lesson.key === dl.key)) orphanLessons.push(`#${dl.id} ${dl.key}（${dl.title}）`);
    }
  });

  const itemsTotal = Number(((await db('items').count({ c: 'id' }).first()) as any)?.c ?? 0);

  console.log('\n导入完成');
  console.log(`  知识点  ${all.length} 个`);
  console.log(`  单元    ${content.units.length} 个（新增 ${nUnitsNew}，更新 ${nUnitsUpd}）`);
  console.log(`  课时    ${nLessonsTotal} 个（新增 ${nLessonsNew}，更新 ${nLessonsUpd}）`);
  console.log(`  题目    新增 ${nItemsNew}，更新 ${nItemsUpd} —— 库里现有 ${itemsTotal} 条`);

  if (staleDeleted.length) {
    console.log(`\n  清掉 ${staleDeleted.length} 条内容里已删除的题（无人作答）：`);
    for (const s of staleDeleted) console.log(`    - ${s}`);
  }
  if (staleKept.length) {
    console.log(`\n  有 ${staleKept.length} 条题在 content.json 里已经没了，但已被作答过，保留：`);
    for (const s of staleKept) console.log(`    - ${s}`);
  }
  if (orphanUnits.length || orphanLessons.length) {
    console.log('\n  库里有、content.json 里没有（只报不删，要删请手工决定）：');
    for (const s of orphanUnits) console.log(`    - 单元 ${s}`);
    for (const s of orphanLessons) console.log(`    - 课时 ${s}`);
  }
  if (nNoAudio) {
    console.log(`\n  跳过 ${nNoAudio} 道听音题：content/audio/ 里还没有对应的 mp3（音频生成后再跑一次就有了）`);
  }
  if (shortPool.length) {
    console.log(`\n  有 ${shortPool.length} 道题选项不满 4 个：`);
    for (const s of shortPool) console.log(`    - ${s}`);
  }

  // 抽查几条，便于肉眼确认干扰项选得像回事
  console.log('\n  抽查：');
  for (const k of KINDS) {
    const s = await db('items').where({ kind: k }).first();
    if (s) console.log(`    [${s.kind}] ${s.prompt} → ${s.answer}　选项 ${s.options ?? '(无)'}`);
  }

  await db.destroy();
}

main().catch(async (e) => {
  console.error('导入失败：', e);
  await db.destroy();
  process.exit(1);
});
