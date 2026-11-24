/**
 * 音频台账（content 侧）
 *
 * ## 这脚本解决什么
 * `content/audio/<key>.mp3` 是按 content.json 里该知识点的 `text` 合成的。
 * edge-tts 的输出**没有 ID3 标签**（文件头直接是 MPEG 帧同步 `fff364`），
 * 所以音频文件里查不出它念的到底是哪个字。
 *
 * 于是有一种错误是查不出来的：改了 `text` 却忘了重新生成音频。比如把「日」
 * 改成「阳」，文件名还是 `ri.mp3`，`import-content.ts` 的「文件存在吗」检查
 * 照样通过 —— 学习者看到「阳」、听到「rì」，页面不报错、测试也抓不到。
 *
 * `manifest.json` 把「每个 key 是按哪段文本生成的」记下来，导入时比对，
 * 对不上就直接告警。
 *
 * ## 用法
 *   npx tsx scripts/audio-manifest.ts           只检查：报出漂移 / 孤儿 / 缺音频
 *   npx tsx scripts/audio-manifest.ts --write   以当前 content.json 重写台账
 *
 * ## 为什么 --write 必须手动
 * 漂移的形态是「音频旧、文本新」。若检查时顺手把新文本写进台账，等于自己
 * 擦掉了证据，以后永远检测不到。所以只有确实重新生成了音频，才用 --write
 * 承认「现在这个 mp3 就是按新文本念的」。
 */
import * as fs from 'fs';
import * as path from 'path';

interface Point {
  key: string;
  text: string;
  kinds?: string[];
}
interface Lesson {
  key: string;
  kinds?: string[];
  points: Point[];
}
interface Unit {
  key: string;
  lessons: Lesson[];
}
interface Content {
  units: Unit[];
}

interface ManifestEntry {
  text: string;
  bytes: number;
}
interface Manifest {
  _note: string;
  voice: string;
  rate: string;
  generated_at: string;
  entries: Record<string, ManifestEntry>;
}

const contentDir = path.resolve(__dirname, '../content');
const audioDir = path.join(contentDir, 'audio');
const manifestFile = path.join(audioDir, 'manifest.json');

/** 台账里记的合成参数：改了就必须重新生成全部音频，否则台账与实物不符 */
const VOICE = 'zh-CN-XiaoxiaoNeural';
const RATE = '-15%';

function loadListenPoints(): Map<string, string> {
  const content = JSON.parse(fs.readFileSync(path.join(contentDir, 'content.json'), 'utf8')) as Content;
  const out = new Map<string, string>();
  for (const u of content.units) {
    for (const l of u.lessons) {
      for (const p of l.points) {
        const kinds = p.kinds ?? l.kinds ?? [];
        if (kinds.includes('listen')) out.set(p.key, p.text);
      }
    }
  }
  return out;
}

function loadManifest(): Manifest | null {
  if (!fs.existsSync(manifestFile)) return null;
  try {
    return JSON.parse(fs.readFileSync(manifestFile, 'utf8')) as Manifest;
  } catch {
    return null;
  }
}

function scanAudio(): Map<string, number> {
  const out = new Map<string, number>();
  if (!fs.existsSync(audioDir)) return out;
  for (const f of fs.readdirSync(audioDir)) {
    if (!f.endsWith('.mp3')) continue;
    out.set(f.replace(/\.mp3$/, ''), fs.statSync(path.join(audioDir, f)).size);
  }
  return out;
}

function main(): void {
  const write = process.argv.includes('--write');
  const listen = loadListenPoints();
  const audio = scanAudio();
  const old = loadManifest();

  const entries: Record<string, ManifestEntry> = {};
  const missing: string[] = [];
  const drift: string[] = [];
  const orphan: string[] = [];

  for (const [key, text] of [...listen].sort((a, b) => a[0].localeCompare(b[0]))) {
    const bytes = audio.get(key);
    if (bytes === undefined) {
      missing.push(`${key}「${text}」`);
      continue;
    }
    entries[key] = { text, bytes };
    const was = old?.entries?.[key];
    if (was && was.text !== text) {
      drift.push(`${key}：台账记「${was.text}」，content.json 现在是「${text}」`);
    } else if (!was && old) {
      drift.push(`${key}：台账新建，之前没有记录`);
    }
  }

  const listenKeys = new Set(listen.keys());
  for (const k of [...audio.keys()].sort()) {
    if (!listenKeys.has(k)) orphan.push(`${k}.mp3`);
  }

  console.log(`content.json 里的 listen 知识点：${listen.size} 个`);
  console.log(`content/audio/ 里的 mp3：${audio.size} 个`);
  console.log(`台账：${old ? `已有，记着 ${Object.keys(old.entries ?? {}).length} 条` : '还没有'}`);
  if (old && (old.voice !== VOICE || old.rate !== RATE)) {
    console.log(`  ⚠ 台账记的合成参数是 voice=${old.voice} rate=${old.rate}，脚本里现在是 ${VOICE} / ${RATE}`);
  }

  if (drift.length) {
    console.log(`\n⚠ ${drift.length} 个音频与文本对不上 —— 这些听音题会「看到 A、听到 B」，而且不报错：`);
    for (const d of drift) console.log(`    - ${d}`);
  }
  if (missing.length) {
    console.log(`\n⚠ ${missing.length} 个 listen 知识点还没有音频：`);
    for (const m of missing) console.log(`    - ${m}`);
  }
  if (orphan.length) {
    console.log(`\n注：${orphan.length} 个 mp3 没有对应的 listen 知识点（不影响运行，只是占地方）：`);
    for (const o of orphan) console.log(`    - ${o}`);
  }

  if (write) {
    const out: Manifest = {
      _note:
        '音频生成台账：记录每个 mp3 是按哪段文本合成的。content.json 里对应知识点的 text 一旦改动，必须重新生成该 mp3，再跑 scripts/audio-manifest.ts --write 更新此账；对不上时 import-content.ts 会告警。',
      voice: VOICE,
      rate: RATE,
      generated_at: new Date().toISOString().slice(0, 10),
      entries,
    };
    fs.writeFileSync(manifestFile, JSON.stringify(out, null, 2) + '\n', 'utf8');
    console.log(`\n台账已写入 ${path.relative(process.cwd(), manifestFile)}：${Object.keys(entries).length} 条`);
    if (drift.length) {
      console.log('  （注意：上面那些对不上的条目也按当前文本记了 —— 确认音频真的重新生成过）');
    }
  } else if (!old) {
    console.log('\n还没有台账。确认音频都是按当前 content.json 生成的之后，跑一次 --write 建账。');
  } else if (!drift.length && !missing.length) {
    console.log('\n台账与实物一致。');
  }
}

main();
