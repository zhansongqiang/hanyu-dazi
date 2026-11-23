import { Request, Response, NextFunction } from 'express';
import { verifyToken, JwtPayload } from '../utils/jwt';
import { fail } from '../utils/response';

export interface AuthedRequest extends Request {
  userId?: number;
  user?: JwtPayload;
}

/** JWT 鉴权中间件: 解析 Bearer token, 挂载 req.userId / req.user */
export function authMiddleware(req: AuthedRequest, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return fail(res, '未登录', 401);
  }
  try {
    const decoded = verifyToken(auth.slice(7));
    req.userId = decoded.userId;
    req.user = decoded;
    next();
  } catch {
    return fail(res, '登录已过期,请重新登录', 401);
  }
}
