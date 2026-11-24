/**
 * C2 验收：答题反馈里到底有没有 `hint`？
 *
 * 契约 §4.2 规定 `POST /attempts` 的 `data` 里带 `hint`（来自 content 的 content.json，
 * 由导入脚本写进 `items.hint`）；§6 把「答题反馈里出现 hint」定为 content 这一路的验收口径。
 * 「导入时确实写进库了」和「接口真的把它回出来了」是两件事 —— 这个脚本测的是**后者**。
 *
 * 为什么要一个脚本，而不是手敲两条 curl：
 *   1. 这条口径必须**真的发一次 HTTP 请求**才算数（走真实路由 + 真实中间件 + 真实复判）；
 *   2. `/auth/login` 有 5 次/分钟的限流，手测几次就把自己限死，后面全是 500 看不出原因 ——
 *      所以这里走 `POST /auth/register`（不限流）直接换 token；
 *   3. 手测最容易忘的是 `DB_FILENAME` —— 忘了就会往共用开发库里塞探针用户和答题记录。
 *      这里**主动拒绝**指向共用库的运行（见下面的守卫）；
 *   4. 「跑过了」和「跑对了」要能分开：退出码就是断言。
 *
 * 用法（在 server/ 下，指到一次性库）：
 *   rm -f data/_verify.db*
 *   DB_FILENAME=./data/_verify.db npx tsx src/migrate.ts
 *   DB_FILENAME=./data/_verify.db npx tsx scripts/import-content.ts
 *   DB_FILENAME=./data/_verify.db npx tsx scripts/check-hint-feedback.ts
 *
 * 退出码：0 = 全部成立；1 = 有断言不成立；2 = 环境不对（没导入 / 指向共用库）。
 */
import { once } from 'events';
import fs from 'fs';
import type { AddressInfo } from 'net';
import path from 'path';
import app from '../src/app';
import db from '../src/config/database';

// 写库守卫：这个脚本会插一个用户、几条答题记录和 XP。共用开发库不行。
// 注意守卫放在 main() 里而不是模块顶层：顶层若调 process.exit()，一旦将来某个 import
// 在加载期开了 socket，就会踩到下面说的那个 Windows 断言（退出码变 127）——
// 「拒绝运行」和「自检崩了」会得到同一个退出码，两种结论长得一样，等于没区分。
const dbFile = path.resolve(process.cwd(), process.env.DB_FILENAME || './data/hanyu-dazi.db');
const isSharedDb = /hanyu-dazi\.db$/.test(dbFile) && process.env.ALLOW_SHARED_WRITE !== '1';

interface Envelope {
  status: number;
  body: any;
}

async function call(base: string, url: string, opt: RequestInit = {}): Promise<Envelope> {
  const r = await fetch(base + url, opt);
  const text = await r.text();
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: r.status, body };
}

function post(base: string, url: string, payload: unknown, token?: string): Promise<Envelope> {
  return call(base, url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
}

const isNonEmptyStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/** content.json 里每个知识点 key 对应的 hint —— 这才是「那句话」的唯一真相源。 */
function hintsFromContent(): Map<string, string> {
  const file = path.join(process.cwd(), 'content', 'content.json');
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as {
    units: { lessons: { points: { key: string; hint?: string }[] }[] }[];
  };
  const m = new Map<string, string>();
  for (const u of raw.units || []) {
    for (const l of u.lessons || []) {
      for (const p of l.points || []) {
        if (typeof p.hint === 'string' && p.hint.length > 0) m.set(p.key, p.hint);
      }
    }
  }
  return m;
}

async function main(): Promise<void> {
  if (isSharedDb) {
    console.error(`拒绝运行：DB_FILENAME 指到了共用开发库\n  ${dbFile}`);
    console.error('这是会写库的自检。请指到一次性库，例如：');
    console.error('  DB_FILENAME=./data/_verify.db npx tsx scripts/check-hint-feedback.ts');
    console.error('确实要在共用库上跑，就显式带上 ALLOW_SHARED_WRITE=1。');
    process.exitCode = 2;
    return;
  }

  console.log(`库文件：${dbFile}\n`);

  // 起真实服务，端口交给系统挑（0）—— 免得和别人的 dev server 抢端口
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = (server.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${port}`;
  console.log(`临时服务：${base}（本进程内，跑完即关）`);

  const teardown = async () => {
    // 先断开 keep-alive，再关服务；否则 close() 会等空闲连接，脚本挂住不退出
    (server as any).closeAllConnections?.();
    await new Promise<void>((r) => server.close(() => r()));
    await db.destroy();
  };

  try {
    // 先确认 items.hint 列在。少了这一列，下面的查询会抛 SQLITE_ERROR 长栈，
    // 看不出「是迁移没跑」还是「脚本坏了」—— 报清楚再退出。
    const cols: string[] = (await db.raw("select name from pragma_table_info('items')")).map((r: any) => r.name);
    if (!cols.includes('hint')) {
      console.error('\n一次性库的 items 表没有 hint 列 —— 迁移 20261123160001_items_hint.ts 没跑到。');
      console.error('先跑：DB_FILENAME=./data/_verify.db npx tsx src/migrate.ts');
      await teardown();
      process.exitCode = 2;
      return;
    }

    const contentHints = hintsFromContent();
    // 挑一条「content.json 里有 hint、库里也写进去了」的题：这正是要验的那条链路的起点
    const item: any = await db('items')
      .whereNotNull('hint')
      .andWhereNot('hint', '')
      .orderBy('id')
      .first('id', 'kind', 'prompt', 'answer', 'hint', 'point_key', 'lesson_id');
    if (!item) {
      console.error('\n一次性库里没有带 hint 的题 —— 先跑 src/migrate.ts 和 scripts/import-content.ts。');
      await teardown();
      process.exitCode = 2;
      return;
    }
    const expectHint = contentHints.get(item.point_key) ?? null;
    console.log(`探针题目：#${item.id} [${item.kind}] 知识点 ${item.point_key} 「${item.prompt}」→ ${item.answer}`);
    console.log(`content.json 里的 hint：「${expectHint ?? '（这个知识点没写 hint）'}」`);
    console.log(`库里 items.hint ：「${item.hint}」`);

    const username = `c2check${String(Date.now()).slice(-6)}`;
    const reg = await post(base, '/api/auth/register', {
      username,
      password: 'probe123456',
      nickname: 'C2 自检',
    });
    const token: string | undefined = reg.body?.data?.token;
    console.log(`\n注册 ${username}：HTTP ${reg.status} code=${reg.body?.code} ${token ? '已拿到 token' : '没拿到 token'}`);
    if (!token) {
      console.error(JSON.stringify(reg.body));
      await teardown();
      process.exitCode = 2;
      return;
    }

    // 答错一次：这是学生在 APP 里真正会遇到 hint 的那条路径
    const wrong = await post(base, '/api/attempts', { itemId: item.id, userAnswer: '__故意答错__', durationMs: 1200 }, token);
    const w = wrong.body?.data ?? {};
    console.log(`\n【答错】HTTP ${wrong.status} code=${wrong.body?.code}`);
    console.log(`  ${JSON.stringify(w)}`);

    // 再答对一次：契约 §4.2 的示例正是 `isCorrect:true` 也带 hint，一并验掉
    const right = await post(base, '/api/attempts', { itemId: item.id, userAnswer: item.answer, durationMs: 900 }, token);
    const r = right.body?.data ?? {};
    console.log(`\n【答对】HTTP ${right.status} code=${right.body?.code}`);
    console.log(`  ${JSON.stringify(r)}`);

    const checks: [string, boolean][] = [
      ['答错时 后端复判 isCorrect === false', w.isCorrect === false],
      ['答错时 hint 非空', isNonEmptyStr(w.hint)],
      ['答对时 hint 非空（契约 §4.2 的示例就是答对也带）', isNonEmptyStr(r.hint)],
      ['两次的 hint 都与 items.hint 逐字相同（不是拼接、不是截断）', w.hint === item.hint && r.hint === item.hint],
      [
        '接口回的 hint 就是 content.json 那一句（唯一真相源，逐字相同）',
        expectHint !== null && w.hint === expectHint && r.hint === expectHint,
      ],
      ['答错发的 XP 与答对不同（2 / 10，来自 constants）', w.xpEarned === 2 && r.xpEarned === 10],
    ];

    console.log('\n断言：');
    let bad = 0;
    for (const [name, ok] of checks) {
      if (!ok) bad++;
      console.log(`  ${ok ? '✓' : '✗'} ${name}`);
    }
    console.log(bad === 0 ? '\nC2 通过：0 条不成立' : `\nC2 未通过：${bad} 条不成立`);

    await teardown();
    // 不调 process.exit()：Windows 上它在 socket 关闭途中调用会撞 libuv 断言（退出码变 127），
    // 断言全过却给出非 0 退出码，等于把「退出码就是断言」这条纪律毁掉。
    process.exitCode = bad === 0 ? 0 : 1;
  } catch (e) {
    console.error('自检异常：', e);
    await teardown().catch(() => undefined);
    process.exitCode = 2;
  }
}

main();
