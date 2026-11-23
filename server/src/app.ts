import express, { ErrorRequestHandler } from 'express';
import cors from 'cors';
import routes from './routes';
import { fail } from './utils/response';
import logger from './utils/logger';

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 健康检查
app.get('/health', (_req, res) => {
  res.json({ code: 0, message: 'ok', data: { status: 'up', ts: new Date().toISOString() } });
});

// 业务路由(全部挂在 /api 下)
app.use('/api', routes);

// 404
app.use((req, res) => {
  fail(res, `接口不存在: ${req.method} ${req.path}`, 404);
});

// 错误兜底(捕获 multer 等 try-catch 抓不到的错误, 同 SmartCampus 教训)
const errHandler: ErrorRequestHandler = (err, req, res, _next) => {
  logger.error(`[ERR] ${req.method} ${req.path} - ${err.message}`);
  res.status(500).json({ code: 500, message: err.message || '服务器内部错误', data: null });
};
app.use(errHandler);

export default app;
