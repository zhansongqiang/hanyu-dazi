/**
 * 路由挂载表 —— 波次 0 冻结，**归属 be-api，其余三路不要改本文件**。
 *
 * ## 唯一规则
 * **每个路由文件都挂在 `/`，文件内部写的路径 = `/api` 之后的完整路径。**
 * 例：`content.ts` 里写 `router.get('/units', ...)` → 对外就是 `GET /api/units`。
 * 这样 §4 的表和代码是逐行对得上的，不需要做"前缀 + 相对路径"的心算。
 *
 * ## 为什么不用 `router.use('/units', ...)` 这类前缀挂载
 * 因为 `content.ts` 同时提供 `/units`、`/lessons/:id`、`/users/:id`、`/reports`，
 * 没有共同前缀；`xp.ts` 同时提供 `/xp`、`/rank`、`/stamps`。硬凑前缀只会让路径对不上契约。
 *
 * ## ⚠️ 顺序仍然重要
 * 挂在 `/` 的多个 router 是按注册顺序依次尝试的，第一个匹配的路由赢。
 * 所以**具体路径必须排在参数路径之前**（已在各文件内部注释标明，
 * 例如 duel.ts 的 `/duels/recent` 必须早于 `/duels/:code`）。
 */
import { Router } from 'express';
import authRoutes from './auth';
import contentRoutes from './content';
import attemptsRoutes from './attempts';
import wrongbookRoutes from './wrongbook';
import progressRoutes from './progress';
import checkinRoutes from './checkin';
import xpRoutes from './xp';
import duelRoutes from './duel';
import teamRoutes from './team';

const router = Router();

/** 健康检查（放这里是为了 /api/health 与 /health 两个都能用） */
router.get('/health', (_req, res) => {
  res.json({ code: 0, message: 'ok', data: { app: 'hanyu-dazi', status: 'up', ts: new Date().toISOString() } });
});

// ===== 波次 0 已挂好全部模块 =====
// 未实现的路由文件统一返回 501（不是 404）—— 这样"还没做"和"路径写错"一眼可分。
// 波次 1 各 agent 只替换自己文件里的 handler，**不动这里**。
router.use('/auth', authRoutes);

router.use('/', contentRoutes);   // §4.1 §4.9  /units /lessons/:id /users/:id /reports
router.use('/', attemptsRoutes);  // §4.2       POST /attempts  POST /lessons/:id/finish
router.use('/', wrongbookRoutes); // §4.3       /wrongbook
router.use('/', progressRoutes);  // §4.5       /profile/summary /profile/calendar
router.use('/', checkinRoutes);   // §4.6       /checkin
router.use('/', xpRoutes);        // §4.6 §4.7  /xp/ledger /rank/* /stamps
router.use('/', duelRoutes);      // §4.4       /duels
router.use('/', teamRoutes);      // §4.8       /teams

export default router;
