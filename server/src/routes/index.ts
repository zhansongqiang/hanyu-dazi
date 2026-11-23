import { Router } from 'express';
import authRoutes from './auth';

const router = Router();

/** 健康检查（放这里是为了 /api/health 与 /health 两个都能用） */
router.get('/health', (_req, res) => {
  res.json({ code: 0, message: 'ok', data: { app: 'hanyu-dazi', status: 'up', ts: new Date().toISOString() } });
});

router.use('/auth', authRoutes);

export default router;
