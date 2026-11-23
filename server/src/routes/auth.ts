import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import db from '../config/database';
import { signToken } from '../utils/jwt';
import { success, fail } from '../utils/response';
import { authMiddleware, AuthedRequest } from '../middleware/auth';
import { localNowStr } from '../utils/datetime';

const router = Router();

/**
 * 登录限流：每分钟 5 次
 * 这是照搬 SmartCampus 的教训 —— 开发期间反复用 curl 打登录接口会打满限额，
 * 所以本地验证一律优先用 /api/health 与非登录接口。
 */
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 1, message: '尝试过于频繁，请一分钟后再试', data: null },
});

const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;

function publicUser(u: any) {
  return {
    id: u.id,
    username: u.username,
    nickname: u.nickname,
    avatarUrl: u.avatar_url,
    createdAt: u.created_at,
  };
}

/** POST /auth/register { username, password, nickname? } */
router.post('/register', async (req, res) => {
  try {
    const { username, password, nickname } = req.body || {};

    if (!USERNAME_RE.test(String(username || ''))) {
      return fail(res, '用户名需为 3–20 位字母、数字或下划线');
    }
    if (typeof password !== 'string' || password.length < 6 || password.length > 64) {
      return fail(res, '密码需为 6–64 位');
    }

    const exists = await db('users').where({ username }).first();
    if (exists) return fail(res, '这个用户名已经有人用了，换一个吧');

    const now = localNowStr();
    const [id] = await db('users').insert({
      username,
      password_hash: bcrypt.hashSync(password, 10),
      nickname: (nickname && String(nickname).slice(0, 50)) || username,
      avatar_url: null,
      status: 'active',
      created_at: now,
      updated_at: now,
    });

    const user = await db('users').where({ id }).first();
    const token = signToken({ userId: user.id, username: user.username, nickname: user.nickname });
    return success(res, { token, user: publicUser(user) });
  } catch (e) {
    return fail(res, (e as Error).message, 500);
  }
});

/** POST /auth/login { username, password } */
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return fail(res, '请填写用户名和密码');

    const user = await db('users').where({ username }).first();
    // 用户不存在与密码错误返回同一句话：不泄露用户名是否注册过
    if (!user) return fail(res, '用户名或密码不对');
    if (user.status === 'banned') return fail(res, '这个账号已被停用');

    if (!bcrypt.compareSync(String(password), user.password_hash)) {
      return fail(res, '用户名或密码不对');
    }

    await db('users').where({ id: user.id }).update({ updated_at: localNowStr() });
    const token = signToken({ userId: user.id, username: user.username, nickname: user.nickname });
    return success(res, { token, user: publicUser(user) });
  } catch (e) {
    return fail(res, (e as Error).message, 500);
  }
});

/** GET /auth/me —— 带 token 换当前用户 */
router.get('/me', authMiddleware, async (req: AuthedRequest, res) => {
  const user = await db('users').where({ id: req.userId }).first();
  if (!user) return fail(res, '用户不存在', 404);
  return success(res, publicUser(user));
});

export default router;
