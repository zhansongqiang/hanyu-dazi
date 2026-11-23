/**
 * 轻量日志(MVP 用 console; 生产可换 winston + daily-rotate-file 轮转)
 * 格式: [YYYY-MM-DD HH:MM:SS] [LEVEL] message
 *
 * 时间戳必须走 localNowStr()：toISOString() 是 UTC，
 * 却按本地格式打印出来 —— 看着像本地时间，其实差 8 小时，
 * 排查「今天的数据为什么没写进去」时会把人带偏。同 datetime.ts 的约定。
 */
import { localNowStr } from './datetime';

type Level = 'info' | 'warn' | 'error' | 'debug';

function ts(): string {
  return localNowStr();
}
function fmt(level: Level, msg: string): string {
  return `[${ts()}] [${level.toUpperCase()}] ${msg}`;
}

const logger = {
  info: (msg: string) => console.log(fmt('info', msg)),
  warn: (msg: string) => console.warn(fmt('warn', msg)),
  error: (msg: string) => console.error(fmt('error', msg)),
  debug: (msg: string) => {
    if (process.env.LOG_LEVEL === 'debug') console.log(fmt('debug', msg));
  },
};

export default logger;
