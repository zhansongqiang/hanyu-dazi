# 汉语搭子 · hanyu-dazi

给北语留学生的中文课后陪练社区（手机端优先）。课程作业项目，五天交付，交链接。

**当前状态：方案已定稿，等待开工确认。还没有写任何应用代码。**

## 先看这个

`plan.html` —— 完整项目方案书。用浏览器打开（双击即可），15 节：需求、取舍、技术方案、
数据模型、五天排期、开发与部署纪律、答辩预案。所有决策都在里面，看这一份就够。

改完方案后跑一遍校验：

```
python -I tools/verify-plan.py
```

（检查 HTML 标签开闭配对 + 旧方案残留词是否归零。理论上应该 PASSED。）

## 开工前需要确认的四件事

1. 应用名 **汉语搭子**，文件夹 `hanyu-dazi`
2. 科举称号链 **蒙学 → 童生 → 秀才 → 举人 → 贡士 → 进士 → 状元**
3. 12 个象形描红字 **日 月 山 水 人 大 小 上 下 中 口 火**
4. 子域名 **`hanyu.zj17z.cn`**（证书和 nginx vhost 都跟着这个名字，改了要重来）

## 开发形态：本地优先（重要）

开发全程在本机跑通闭环，**服务器一次都不碰**：

- 前端 `localhost:5173`（uni-app + Vue3 + TS + Vite，`/api` 代理到后端）
- 后端 Express **`:8091`**（tsx 直接起，**端口与线上一致**）
- 数据库本地文件 `server/data/hanyu-dazi.db`（Knex 迁移）

上线是第二阶段：Day 1 晚上拿空壳走通一遍链路（DNS → nginx vhost → certbot → PM2），
Day 5 收尾重传构建产物。链路细节全在方案书第五节和第十二节。

### 本地开发五条纪律

1. **Windows 上 `tsx watch` 不可靠**——改完后端必须手动重启：
   `netstat -ano | findstr :8091` 找 PID → `taskkill //PID <pid> //F` → 重新起
2. 本地端口也用 `8091`，上线时配置一个数字都不用改
3. 数据库是本地文件 `server/data/hanyu-dazi.db`
4. 本地登录限流同样是每分钟 5 次，健康检查用 `/api/health`，别拿登录测
5. 手机看效果用 Vite `--host` + `http://192.168.x.x:5173`，但局域网 IP **不是**安全上下文
   ——麦克风和 PWA 要等 Day 1 上线之后才能在手机上测

`localhost` / `127.0.0.1` 本身**是**安全上下文，所以电脑上开发时麦克风权限正常。

## 红线

目标服务器 `114.132.232.60`（zj17z.cn）上跑着**在用的学校平台**（SmartCampus）。
我们的东西一律以「独立租户」方式挂上去，**只做加法**：独立目录、独立端口（8091）、
独立 PM2 名（`hanyu-dazi`）、独立 nginx vhost、独立数据库文件。

绝对不碰：现有 `smartcampus` / `smartcampus-demo` 进程与 vhost、`~/smartcampus` 目录、
`~/webroot-bak-*`。绝不 `pm2 stop all` / `delete all` / `kill` / `flush`。

SSH 只能用 `-i ~/.ssh/id_ed25519 -o IdentitiesOnly=yes` 单次连接（有 fail2ban，
连试多个密钥会被封 IP）。

**凭据不进仓库、不进方案书、不进任何会展示或分享的文件。**

## 目录

```
plan.html              方案书（唯一交付文档）
tools/verify-plan.py   方案书校验（标签配对 + 残留词扫描）
tools/check-ports.py   从本机探测服务器端口（预期 22/80/443 OPEN，其余 TIMEOUT）
tools/probe-zj17z.py   只读盘点服务器现状
tools/read-refs.py     只读读取服务器上的 nginx 参考配置
tools/instance-facts.py 旧服务器的只读识别脚本（已废弃，勿运行其 clean 部分）
```
