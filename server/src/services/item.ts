import db from '../config/database';

/**
 * 题目行 → 接口 DTO 的**唯一映射**（契约 §4.1 §4.3，归属 be-api 的 services/**）。
 *
 * 为什么要单独一个文件：`GET /lessons/:id`、`GET /lessons/:id/items`、
 * `GET /wrongbook` 三处都要把 `items` 行转成 camelCase，且都要做
 * `options` 的 JSON.parse。三处各写一份的必然结果是某天有人只改了其中两处
 * （前端表现为"这个页面的 options 是字符串、那个页面是数组"）。
 *
 * 两个容易踩的点：
 *  - `options` 在库里是 **JSON 文本**（varchar/TEXT），返回前必须 parse 成数组；
 *    `kind='stroke'` 的题 options 为 null，**必须保持 null 而不是 []**
 *    （前端靠 null 判断"这题没有选项"）
 *  - 内容接口**返回 `answer`**（§4.1 明文，理由见「答案字段的取舍」）；
 *    但答题落库那一次仍由后端复判（services/attempt.ts）
 */

export interface ItemDto {
  id: number;
  kind: string;
  prompt: string;
  promptEn: string | null;
  options: string[] | null;
  answer: string;
  char: string | null;
  audioUrl: string | null;
  sort: number;
  lessonId: number;
  pointKey: string | null;
}

/** 库里是 JSON 文本 → 数组；null/空串/坏 JSON 一律返回 null */
export function parseOptions(raw: unknown): string[] | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (Array.isArray(raw)) return raw as string[];
  try {
    const v = JSON.parse(String(raw));
    return Array.isArray(v) ? (v as string[]) : null;
  } catch {
    return null; // 坏数据不抛错，宁可没选项也不要 500 掉整个列表
  }
}

/** items 行 → ItemDto。字段名与 §4.1 的 item 对象逐字一致 */
export function toItemDto(row: any): ItemDto {
  return {
    id: Number(row.id),
    kind: row.kind,
    prompt: row.prompt,
    promptEn: row.prompt_en ?? null,
    options: parseOptions(row.options),
    answer: row.answer,
    char: row.char ?? null,
    audioUrl: row.audio_url ?? null,
    sort: Number(row.sort ?? 0),
    lessonId: Number(row.lesson_id),
    pointKey: row.point_key ?? null,
  };
}

/**
 * `items.hint` 列是否存在 —— 探测一次，进程内缓存。
 *
 * 为什么要有这个探测：`hint` 列由 **content** 的迁移 `..._items_hint.ts` 负责新增，
 * 而他们落地的时间点不确定。硬写 `select('hint')` 会在迁移还没跑时直接抛
 * 「no such column: hint」，把答题接口整个打成 500。
 *
 * 调用方必须**同时**容错：拿到 false 就把 hint 当 null 返回，绝不抛错。
 * 注意探测结果在进程内缓存 —— 迁移是在服务启动前跑的，运行期不会变。
 */
let hintColumn: boolean | null = null;
export async function hasHintColumn(): Promise<boolean> {
  if (hintColumn !== null) return hintColumn;
  try {
    const cols = (await db.raw('PRAGMA table_info(items)')) as any[];
    hintColumn = cols.some((c) => String(c.name) === 'hint');
  } catch {
    hintColumn = false;
  }
  return hintColumn;
}

/** 某课的题目列表，按 sort 升序（§4.1 明文「按 sort 升序」） */
export async function itemsOfLesson(lessonId: number): Promise<ItemDto[]> {
  const rows = await db('items')
    .where({ lesson_id: lessonId })
    .orderBy('sort', 'asc')
    .orderBy('id', 'asc');
  return rows.map(toItemDto);
}

/**
 * 每课的题量（Map：lesson_id → count）。
 * 统计**一律 count 源表 rows**，不依赖任何冗余列 —— 冗余列迟早对不上。
 */
export async function itemCountByLesson(): Promise<Map<number, number>> {
  const rows = (await db('items')
    .groupBy('lesson_id')
    .select('lesson_id')
    .count({ c: '*' })) as any[];
  return new Map(rows.map((r) => [Number(r.lesson_id), Number(r.c)]));
}