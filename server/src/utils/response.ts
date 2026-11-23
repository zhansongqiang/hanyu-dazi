import { Response } from 'express';

/**
 * 统一成功响应: { code: 0, message, data }
 * 前端 utils/request.ts 解包后直接把 data 交给调用方（不要再 data.data 剥一层）
 */
export function success(res: Response, data?: unknown, message = 'ok') {
  return res.json({ code: 0, message, data: data ?? null });
}

/**
 * 统一失败响应
 */
export function fail(res: Response, message: string, httpStatus = 400, code = 1) {
  return res.status(httpStatus).json({ code, message, data: null });
}

/**
 * 分页响应
 */
export function paginate(res: Response, list: unknown[], total: number, page: number, pageSize: number) {
  return res.json({
    code: 0,
    message: 'ok',
    data: { list, total, page, pageSize, hasMore: page * pageSize < total },
  });
}
