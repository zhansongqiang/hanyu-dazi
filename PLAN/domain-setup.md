# 服务器配置 · 完成记录（hanyu.zj17z.cn）

> 目标：让 `https://hanyu.zj17z.cn/` 能打开，带小锁。
> ## ✅ 2026-11-25 11:22 已完成 —— 证书已签发、已部署、外网独立复核通过
>
> 下面保留完整的手把手步骤（含每步判据与排错表）备查，并记下本次踩到的**两个坑**（§坑）。
>
> ⚠️ **2026-11-25 脱敏改写**：服务器裸 IP 在本文件里统一记为 `[服务器IP]`（共 9 处）。
> 步骤本身不受影响 —— 凡是要填 IP 的地方，填**你手上那台机器的 IP**即可；
> 本文件里所有「IP 应该是多少」的判据，现在读作「和你在 DNSPod 里填的那串一致」。
> 页面上的域名 `hanyu.zj17z.cn` 未脱敏，它本来就是公开的产品地址。

---

## 结果（2026-11-25，全部为外网实测，非自述）

| 判据 | 结果 |
|---|---|
| 443 证书 | ✅ `subject=CN=hanyu.zj17z.cn`，签发者 `Let's Encrypt (YE1)` |
| 有效期 | ✅ `Nov 25 2026` → **`Feb 23 2027`** |
| SAN | ✅ `DNS:hanyu.zj17z.cn` |
| 首页标题 | ✅ `<title>汉语搭子</title>` |
| `https://` 状态 | ✅ `200` |
| `http://` 状态 | ✅ **`301`** → `https://hanyu.zj17z.cn/` |
| 后端 API | ✅ `GET /api/health` → `{"code":0,"data":{"app":"hanyu-dazi","status":"up"}}` |
| SNI 隔离 | ✅ `hanyu` / `zj17z` / `demo` 三名各自出示自己的证书，不串味 |
| SmartCampus | ✅ `zj17z.cn`、`www.zj17z.cn`、`demo.zj17z.cn` 全部 `200`，标题正常 |
| `nginx -t` | ✅ `test is successful` |
| nginx 配置备份 | ✅ `/root/nginx-bak-20261125-112204` |

**证书路径**：`/etc/letsencrypt/live/hanyu.zj17z.cn/fullchain.pem`
**部署位置**：certbot 自动写入 `/etc/nginx/sites-enabled/zz-hanyu-dazi`（即 `sites-available/hanyu-dazi`）
**续期**：certbot 已自动加定时任务，到期前自动续，无需人工干预。

---

## 动手前的现状（留档：故障是怎么来的）

| 我测的 | 结果 | 说明 |
|---|---|---|
| `hanyu.zj17z.cn` 解析 | ✅ `[服务器IP]` | A 段 DNS 已完成 |
| 80 端口 + `Host: hanyu.zj17z.cn` | ✅ `200` `<title>汉语搭子</title>` | nginx 里**已有**该站点配置块，且只在 80 上 |
| 443 端口 + `Host: hanyu.zj17z.cn` | ❌ `200` 但 `<title>SmartCampus 管理系统</title>` | **443 上没有 hanyu 的 server 块**，落到默认站 |
| 443 端口证书 | Let's Encrypt，签给 `zj17z.cn` | 浏览器要 `hanyu.zj17z.cn`，服务器给 `zj17z.cn` → **域名不匹配** |

**为什么浏览器报 `NET::ERR_CERT_COMMON_NAME_INVALID`**（当时用户看到的）：

1. nginx 里 hanyu 的块**只监听了 80**，没监听 443；
2. 访问 `https://` 时 443 上匹配不到 hanyu，nginx 把请求交给了**默认站 SmartCampus**；
3. SmartCampus 出示 `zj17z.cn` 的证书，浏览器一看「这证书不是给 hanyu.zj17z.cn 的」→ 报错。

报错页那句「因为网站使用的是 HSTS」只是说明浏览器**不给你「继续前往」的按钮**，不是配置错误。
`certbot --nginx` 一次解决两件事：① 签出证书；② 给 hanyu 的块补上 `listen 443 ssl`。
**现在这个报错已经消失。**

```
A 段  DNS     →  ① 加记录  ② 验证解析        ← ✅ 已完成
B 段  登入    →  ③ 登服务器  ④ 备份  ⑤ 看一眼  ← ✅ 已完成
C 段  签证书  →  ⑥ 确认certbot ⑦ 试运行 ⑧ 正式签 ⑨ 验nginx ⑩ 自验  ← ✅ 已完成
```

---

## 坑（本次实战新增，下次直接照这个走）

### 坑 ① `certbot --nginx --dry-run` 跑不通

```
--dry-run currently only works with the 'certonly' or 'renew' subcommands ('run')
```

certbot 2.x 起，**试运行不能和 `--nginx` 一起用**（`--nginx` 含"部署"动作，试运行不模拟部署）。
正确写法是把插件和动作分开：

```bash
sudo certbot certonly --nginx -d hanyu.zj17z.cn --dry-run    # ✅ 只验 ACME 挑战
```

这次的输出是 `The dry run was successful.`（其中 `Account registered.` 是 ACME **测试环境**注册的临时账号，与正式证书无关，别慌）。
`certonly --dry-run` **不改 nginx**，所以它验不到"部署"那一步 —— 部署的正确性靠第 ⑨ 步 `nginx -t` + 第 ⑩ 步 curl 来验。

### 坑 ② `sudo ls -d /root/nginx-bak-*` 会假报"不存在"

通配符 `/root/nginx-bak-*` 是**由你当前这个非 root 的 shell 展开**的，
而 `ubuntu` 用户读不了 `/root`，展开失败 → 原样把字面量 `*` 交给 `ls` → 误报 `No such file or directory`。
**这不是备份失败**，是检查方法错了。要查就得让 root 自己去展开：

```bash
sudo bash -c 'ls -d /root/nginx-bak-*'      # ✅ 让 root 的 shell 展开
```

本次实测：备份文件确实在（`/root/nginx-bak-20261125-112204/nginx.conf`）。

---

# A 段 · 加 DNS 解析 ✅ 已完成（2026-11-25，无需重做）

> 记录 `hanyu → A → [服务器IP]` 已生效，我已从外部独立验证过。
> 下面两步保留备查，**你直接从 B 段第 ③ 步开始**。

## ① 加 A 记录

**【在哪】** 浏览器

**【做什么】**

1. 打开 <https://console.dnspod.cn/dns/list> 并登录
   - 如果这个页面看不到 `zj17z.cn`，改开 <https://console.cloud.tencent.com/cns>（同一套后台）
   - 两个都没有 `zj17z.cn` → **停下告诉我**，说明域名解析在别家，步骤要换
2. 在域名列表里找到 **`zj17z.cn`**，点它右边的 **「记录管理」**
3. 进入记录列表页，找到 **「添加记录」** 按钮（通常在右上角），点它
4. 弹出的表单里，**只填/只改这三格，其他一律不动**：

| 表单字段 | 填什么 |
|---|---|
| 主机记录 | `hanyu` |
| 记录类型 | `A` |
| 记录值 | `[服务器IP]` |

   其余（线路类型=默认、TTL=600、权重=空）保持原样。

5. 点 **「确定」/「保存」**

**【看到什么算过】** 记录列表里多出一行：

```
主机记录 hanyu    类型 A    记录值 [服务器IP]    线路 默认
```

**【⚠️ 最容易错的一格】** 「主机记录」**只填 `hanyu`** 五个字母。
如果填成 `hanyu.zj17z.cn`，系统会拼成 `hanyu.zj17z.cn.zj17z.cn`。
→ 检查方法：看列表里「记录值」那列是不是纯 `[服务器IP]`。如果显示成一个域名，就是填错了，**删掉这行重加**。

---

## ② 验证解析生效

**【在哪】** 你本地 Windows，开 PowerShell
（按 `Win` 键 → 输入 `powershell` → 回车）

**【做什么】** 复制这一行，粘进黑窗口，回车：

```powershell
Resolve-DnsName hanyu.zj17z.cn -Type A
```

**【看到什么算过】**

```
Name              Type   IPAddress
----              ----   ---------
hanyu.zj17z.cn    A      [服务器IP]      ← 看到这个就过了
```

**【卡住了】**

| 你看到 | 含义 | 怎么办 |
|---|---|---|
| `DNS name does not exist` | 还没生效 | **等 5 分钟再敲一次**，最多等 10 分钟。DNSPod 的 TTL 是 600 秒 |
| 出来了但 IP 不是 `[服务器IP]` | 记录值填错 | 回第 ① 步改记录值 |
| 等 15 分钟还是不存在 | 记录没保存 / 域名不在 DNSPod | 回第 ① 步看那行记录到底在不在 |

> ⛔ **这一步没过，绝对不要往下走。** certbot 要访问这个域名来验签，解析不通必然失败；失败次数多了会被 Let's Encrypt 限流，那是要等好几小时的。

---

# B 段 · 登上服务器

## ③ 登录服务器（用腾讯云网页终端，别用本地 SSH）

**【在哪】** 浏览器

**【做什么】**

1. 打开 <https://console.cloud.tencent.com/lighthouse>（轻量应用服务器）
   - **如果列表是空的** → 说明是云服务器，改开 <https://console.cloud.tencent.com/cvm>
2. 找到 **IP 是 `[服务器IP]`** 的那一台
3. 点它的 **「登录」** 按钮
   - 轻量：列表右侧直接有「登录」
   - CVM：最右边「更多」→「登录」，或详情页右上角「登录」
4. 浏览器会弹出一个**黑底终端窗口**（新标签页或小窗）
5. 如果它要求输入**密码**：输入你的服务器密码后回车。
   **屏幕上不会显示任何字符**（连 `*` 都没有），这是正常的，盲打就行。
6. 如果它要求输入**用户名**：一般是 `ubuntu`（或 `root`）

**【看到什么算过】** 最后一行是这样的提示符：

```
ubuntu@VM-0-4-ubuntu:~$      ← 或
root@VM-0-4-ubuntu:~#
```

光标在 `$` 或 `#` 后面闪 —— **成功登入**。

**【⚠️ 网页终端和普通终端不一样，第一次用最容易卡这】**

| 操作 | 怎么按 |
|---|---|
| **粘贴** | **鼠标右键**（在终端窗口里），或 `Shift+Insert`。**`Ctrl+V` 在网页终端里常常无效** |
| 复制 | 选中文字通常自动复制 |

**【⚠️ 为什么不用自己电脑 SSH】** 这台服务器装了 **fail2ban**。你用本地终端 SSH，密码连错几次，你的 IP 会被封，之后连不上还得等解封。网页终端走腾讯云自己的通道，不吃这个限制。

---

## ④ 备份 nginx 配置（1 条命令，别省）

**【在哪】** 刚才那个黑窗口里

**【做什么】** 粘贴这一行，回车：

```bash
sudo cp -r /etc/nginx /root/nginx-bak-nginx && ls /root/nginx-bak-nginx
```

**【看到什么算过】** 列出一堆文件名：

```
conf.d  fastcgi.conf  mime.types  nginx.conf  sites-available  sites-enabled  ...
```

**【卡住了】**

| 你看到 | 怎么办 |
|---|---|
| 要求输密码 | 输服务器密码（不显示字符），回车 |
| `No such file or directory` | nginx 配置不在这个路径（可能装了宝塔面板）→ **停下告诉我** |
| `Permission denied` | 命令开头漏了 `sudo` |

---

## ⑤ 看一眼 hanyu 现在是怎么配的（取证，不改动）

**【做什么】** 粘贴：

```bash
sudo grep -rn "hanyu.zj17z.cn" /etc/nginx/ | head -20
```

**【看到什么算过】** 至少出现一行，形如：

```
/etc/nginx/sites-enabled/hanyu:12:    server_name hanyu.zj17z.cn;
```

**请把这一行（含文件名）发我。** 我从外网测到配置块存在，但看不到它长什么样；知道文件名之后，万一出问题回滚能精准到单个文件。

**【卡住了】** 一条都没输出 → 配置块可能不在 `/etc/nginx/` 下 → 把这条命令的输出也发我：

```bash
sudo nginx -T 2>/dev/null | grep -n "server_name" | head -30
```

---

# C 段 · 签 HTTPS 证书

## ⑥ 确认 certbot 在

```bash
certbot --version
```

**【期望】** `certbot 2.x.x`

> 你服务器上 `zj17z.cn` 的证书就是它签的（我查了证书签发方是 Let's Encrypt），所以**基本一定有**。
> **万一提示 command not found**，跑这两条装一下：
> ```bash
> sudo apt update && sudo apt install -y certbot python3-certbot-nginx
> ```

---

## ⑦ 试运行（不写入任何东西，纯演练）

> ⚠️ **本次实战修正**：certbot 2.x 下 `--dry-run` **不能和 `--nginx` 同用**，
> 会报 `--dry-run currently only works with the 'certonly' or 'renew' subcommands`。
> 必须换成 `certonly`（详见上文「坑 ①」）。

```bash
sudo certbot certonly --nginx -d hanyu.zj17z.cn --dry-run
```

**【期望】** 最后几行里有：

```
The dry run was successful.
```

**【⛔ 只有看到成功，才做第 ⑧ 步。】** 试运行失败也会计入 Let's Encrypt 的失败限流，**不要反复重试**。

**【失败了对照】** 把完整报错发我，同时先看这两条：

| 报错关键字 | 含义 | 怎么办 |
|---|---|---|
| `DNS problem: NXDOMAIN` | 解析还没生效 | 回第 ② 步，等 10 分钟 |
| `Could not find a virtual host` | nginx 里没匹配到 hanyu 的块 | 把第 ⑤ 步输出发我 |
| `Connection refused` / `timeout` | 80 端口不通 | 告诉我 |

---

## ⑧ 正式签发

```bash
sudo certbot --nginx -d hanyu.zj17z.cn --redirect --non-interactive
```

> **本次实测这条一次跑通**（账号已存在，加 `--non-interactive` 就不会卡在任何询问上）。
> 输出关键行：`Successfully deployed certificate for hanyu.zj17z.cn to /etc/nginx/sites-enabled/zz-hanyu-dazi`。

> `--redirect` 是让 certbot 顺手把 `http://` 自动跳到 `https://`，**这正是我们要的**（小红书/微信里打开 http 会弹「不安全」，用户直接流失）。
> 加了 `--redirect` 它就不会再问你「1: No redirect / 2: Redirect」。**万一还是问了，选 `2`。**

**【期望】** 最后几行：

```
Successfully received certificate.
Certificate is saved at: /etc/letsencrypt/live/hanyu.zj17z.cn/fullchain.pem
Deploying certificate
Successfully deployed certificate for hanyu.zj17z.cn
Congratulations! You have successfully enabled HTTPS on https://hanyu.zj17z.cn
```

---

## ⑨ 检查 nginx 没被改坏

```bash
sudo nginx -t
```

**【期望】**

```
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

**【如果报错】** 立刻回滚（**只在报错时用**，跑之前先 `ls /root/nginx-bak-nginx` 确认备份还在）：

```bash
sudo rm -rf /etc/nginx && sudo cp -r /root/nginx-bak-nginx /etc/nginx && sudo nginx -t && sudo systemctl reload nginx
```

回滚完 nginx 会恢复成动手前的样子（SmartCampus 不受影响），然后告诉我报错内容。

---

## ⑩ 服务器内部自验

```bash
curl -sI https://hanyu.zj17z.cn/ | head -n 1
curl -s -o /dev/null -w "%{http_code}\n" http://hanyu.zj17z.cn/
curl -s https://hanyu.zj17z.cn/ | grep -o '<title>.*</title>'
```

**【期望】** 第一行 `HTTP/2 200`，第二行 `301`，第三行 **`<title>汉语搭子</title>`**

> ⚠️ 第三行如果还是 `<title>SmartCampus 管理系统</title>`，说明 443 没匹配到 hanyu 的块（动手前就是这个症状），把这条命令的输出发我。

---

# 做完之后：把这三条读数发我

回到**你本地 PowerShell**：

```powershell
Resolve-DnsName hanyu.zj17z.cn -Type A
curl.exe -sS -o NUL -w "https=%{http_code}`n" https://hanyu.zj17z.cn/
curl.exe -sS -o NUL -w "http=%{http_code}`n" http://hanyu.zj17z.cn/
```

**期望**：`[服务器IP]` ／ `https=200` ／ `http=301`

拿到这三条，我会从外部（不在你服务器上）独立复核一遍，确认不是自欺欺人。

---

# 常见问题速查

| 现象 | 原因 | 处理 |
|---|---|---|
| `Resolve-DnsName` 查不到 | 记录没保存 / TTL 未过 | 回 DNSPod 确认记录在，等 10 分钟 |
| **Edge/Chrome 报 `NET::ERR_CERT_COMMON_NAME_INVALID`** | **还没签证书**（443 上 hanyu 落到 SmartCampus，拿到的是 zj17z.cn 的证书） | **正常中间状态**，做 C 段第 ⑧ 步就会消失 |
| 浏览器打开是 SmartCampus | 443 上没有 hanyu 的 server 块 | 同上，`certbot --nginx` 会补上 `listen 443 ssl` |
| `certbot` 报 `--dry-run currently only works with the 'certonly' or 'renew' subcommands` | certbot 2.x 不让 `--dry-run` 和 `--nginx` 同用 | 改用 `certbot certonly --nginx -d hanyu.zj17z.cn --dry-run`（坑 ①） |
| `sudo ls /root/nginx-bak-*` 说"不存在"，但备份其实在 | 通配符由非 root shell 展开，读不了 `/root` | `sudo bash -c 'ls -d /root/nginx-bak-*'`（坑 ②） |
| `certbot` 报 `Could not find a virtual host` | 它没在 80 上匹配到 hanyu 块 | 检查 `sites-enabled/` 里软链是否在（本次为 `zz-hanyu-dazi`） |
| 证书签好了但浏览器仍提示不安全 | 浏览器缓存 | `Ctrl+Shift+R` 强刷 |
| 本地 `curl` 说 `Could not resolve host`，但浏览器能开 | Windows DNS 客户端**否定缓存**（之前的不解析被记了 10 分钟） | `ipconfig /flushdns`，或 `--resolve` 强制指定 IP |
| 忘了自己改了什么 | — | 备份在 `/root/nginx-bak-nginx` |
| 服务器配置在哪都找不到 | 可能装了宝塔面板 | 停下问我，路径完全不同 |

---

## 证书到期提醒

实测到期日：

| 域名 | 到期 |
|---|---|
| `zj17z.cn` / `www.zj17z.cn` | 2027-01-18 |
| `demo.zj17z.cn` | 2027-02-06 |
| **`hanyu.zj17z.cn`** | **2027-02-23**（本次签发） |

certbot 装完会自动加续期定时任务，不用你管。想确认可以跑：

```bash
sudo certbot renew --dry-run
```
