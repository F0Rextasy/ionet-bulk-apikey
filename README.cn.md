<div align="center">

```
██╗ ██████╗ ███╗   ██╗███████╗████████╗
██║██╔═══██╗████╗  ██║██╔════╝╚══██╔══╝
██║██║   ██║██╔██╗ ██║█████╗     ██║
██║██║   ██║██║╚██╗██║██╔══╝     ██║
██║╚██████╔╝██║ ╚████║███████╗   ██║
╚═╝ ╚═════╝ ╚═╝  ╚═══╝╚══════╝   ╚═╝
```

# ionet-bulk-apikey

**批量创建 IO Intelligence (io.net) 账户并自动生成 API 密钥 — 兼容 OpenAI 的推理 + 9Router 连接器。**

[![Node](https://img.shields.io/badge/Node-%E2%89%A518-3DA639?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![Dependencies](https://img.shields.io/badge/dependencies-0-blue?style=for-the-badge)](#)
[![License](https://img.shields.io/badge/license-MIT-6ea8fe?style=for-the-badge)](LICENSE)
[![Models](https://img.shields.io/badge/models-39%20served-412991?style=for-the-badge)](https://io.net)
[![9Router](https://img.shields.io/badge/9Router-connector-8B5CF6?style=for-the-badge)](#-connect-to-9router)
[![OmniRoute](https://img.shields.io/badge/OmniRoute-connector-8B5CF6?style=for-the-badge)](#-connect-to-omniroute)
[![X](https://img.shields.io/badge/X-%40bigbullapp-000000?style=for-the-badge&logo=x&logoColor=white)](https://x.com/bigbullapp)

[🛠 快速开始](#-quick-start) · [🎁 免费额度](#-free-tier--how-much-you-get) · [🤖 模型](#-models--all-39-of-them) · [🧪 使用 API](#-how-to-use-the-api) · [✅ 已验证](#-verified-working--every-key-is-tested) · [🧭 工作原理](#-how-it-works) · [🔌 9Router](#-connect-to-9router) · [🔌 OmniRoute](#-connect-to-omniroute) · [⚙️ 选项](#️-cli-options) · [🛰️ 代理](#️-behind-a-proxy) · [🐞 问题反馈](#-issues)

</div>

<div align="center">

**English** · [Türkçe](README.tr.md) · [中文](README.cn.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Русский](README.ru.md) · [Português](README.pt.md)

</div>

---

## ✨ 为什么需要这个工具

io.net (IO Intelligence) 为每个账户提供 API 访问权限，而实用的单位是*每个密钥对应一个账户*。注册流程是一个托管页面：电子邮件地址、通过邮件发送的一次性验证码，以及一个 API 密钥端点。本工具走完整个流程 — 在页面需要时使用真实浏览器，其余部分使用纯 HTTP — 并且只有在真实完成一次推理后才记录密钥：

```
broker mailbox ──▶ exit pick + point-of-use preflight (id.io.net + recaptcha api.js)
                        │
                        ▼
   one Chrome per attempt ──▶ id.io.net/login ─▶ e-mail ─▶ solved challenge ─▶ magic-auth/start
                                   │                                        │ handoff.json
                                   ▼                                        ▼
   keys.txt ◀── live verify ◀── POST /v1/api-keys ◀── accessToken ◀── OTP ─▶ magic-auth/verify
  (GET /v1/models 200 + real completion)
```

> **状态说明（2026-10-18）：** 仓库当天早些时候因认为该通道已失效而被归档；当晚重新审计后再次验证通过 — 对磁盘上密钥池的实时扫描成功返回了真实的聊天补全（`google/gemma-4-26b-a4b-it` → 200 `"pong"`），且通道 `id.io.net/login` 返回 `200`。仓库已**重新激活**。注册受提供商速率限制，且挑战需人工完成；规模受这些关卡限制。

## 🎁 免费额度 — 你能获得多少

**免费账户实际能调用什么：** 目录对每个密钥都*列出*，但生成按账户等级对每个模型进行限制。使用免费额度密钥对其中 24 个 id 进行实测，只有一个能返回补全 — **`google/gemma-4-26b-a4b-it`**（`200`，真实的助手消息；它是推理模型，因此文本可能出现在 `reasoning_content` 中）。其他所有 id 都返回 `402 {"note":"Model '<id>' requires a higher IO Intelligence tier"}`。

| 项目 | 值 |
| --- | --- |
| 每个密钥的目录 | `GET /v1/models` 上的 **39 个 id**（记录于 [`models.json`](models.json)） |
| 免费额度验证器 | `google/gemma-4-26b-a4b-it` — **200** 且返回真实内容 |
| 免费额度下的其他 id | 升级前返回 `402 requires a higher IO Intelligence tier` |
| 每个模型的元数据 | 每个模型带有 `min_access_tier`（1–3）和 `higher_tier_required` |
| 注册 | `id.io.net/login`（电子邮件 → 验证码 → `magic-auth/verify` → `accessToken` → `POST /v1/api-keys`） |
| 可扩展的单位 | **一个账户 = 一个密钥** → `--target N` 即 N 个账户/密钥 |

> 💡 免费额度由 IO Intelligence 设定，可能会变化。请在 [io.net](https://io.net) 查看实时数据 — 并让工具自身的关卡来决定：

```bash
node src/cli.js verify --proxy socks5://127.0.0.1:1080     # every key is re-tested (models + chat) through one exit
```

## 🤖 模型 — 全部 39 个

`GET https://api.intelligence.io.solutions/api/v1/models` 对任何有效密钥都返回 **39 个模型 id**，包括：

`deepseek-ai/DeepSeek-V4.1-Flash` · `deepseek-ai/DeepSeek-V4-Pro` · `zai-org/GLM-5.3` · `zai-org/GLM-5.3-Flash` · `XiaomiMiMo/MiMo-V2.6-Flash` · `moonshotai/Kimi-K3` · `MiniMaxAI/MiniMax-M2.7` · `Qwen/Qwen3.8-27B` · `openai/gpt-oss-120b` · `deepseek-ai/DeepSeek-R1-0528` · `google/gemma-4-26b-a4b-it`

实测免费额度覆盖情况：

|模型|✓|
|---|---|
|`google/gemma-4-26b-a4b-it`|✓|
|`nvidia/nemotron-3.5-lightning`|✓|

2026-10-19 实时复查（5 个密钥 × 4 个出口）：`nvidia/nemotron-3.5-lightning` 在 20/20 次探测中返回 `200`；39 个 id 目录中的其余模型返回 `402 requires a higher IO Intelligence tier`。

完整的 39 个 id 在 [`models.json`](models.json) 中。对单个密钥的实时探测（正是验证器所做的事）：

```bash
curl https://api.intelligence.io.solutions/api/v1/chat/completions \
  -H "Authorization: Bearer io-v2-…" -H "Content-Type: application/json" \
  -d '{"model":"google/gemma-4-26b-a4b-it","messages":[{"role":"user","content":"hi"}]}'
```

## 🧪 如何使用 API

基础 URL 是 **`https://api.intelligence.io.solutions/api/v1`** — 兼容 OpenAI。

**任意 SDK / curl**

```python
from openai import OpenAI
client = OpenAI(base_url="https://api.intelligence.io.solutions/api/v1", api_key="io-v2-…")
print(client.chat.completions.create(model="google/gemma-4-26b-a4b-it",
      messages=[{"role":"user","content":"hi"}]).choices[0].message.content)
```

```bash
curl https://api.intelligence.io.solutions/api/v1/chat/completions \
  -H "Authorization: Bearer io-v2-…" -H "Content-Type: application/json" \
  -d '{"model":"google/gemma-4-26b-a4b-it","messages":[{"role":"user","content":"hi"}]}'
```

## ⚡ 一条命令

```bash
node src/cli.js --count N      # mint N keys — exit screen, browser, HTTP finish, one account at a time
node src/cli.js --dry          # print the resolved plan: writes nothing, sends nothing
```

`--auto` 是默认模式：铸造路径不需要你提供令牌、验证码答案或代理问题。CLI 旁边的 `proxies.txt` 会被自动使用（否则工具直连），交互式菜单（`node src/launcher.js`）封装了相同的任务。

> ⚠️ **条款与账户风险。** 自动化操作提供商可能违反其服务条款，导致账户或 IP 被封禁。你在自己的机器上、对自己拥有的账户运行此工具，风险自负；该工具仅驱动网站自身的注册页面，绝不绕过付费关卡。在大规模操作前请阅读提供商的服务条款。

## 🛠 快速开始

```bash
git clone https://github.com/F0Rextasy/ionet-bulk-apikey.git
cd ionet-bulk-apikey

# 1) your proxy list, one exit per line (http://, socks5://, socks4:// or bare host:port) — optional, see below
printf 'socks5://127.0.0.1:1080\n' > proxies.txt   # optional — without it the tool runs direct

# 2) go — one run == one account attempt, end to end
node src/cli.js mint --target 5 --pick    # driver: exit → browser → HTTP finish, per account
node src/cli.js verify --proxy socks5://127.0.0.1:1080   # re-check the keys already on disk
node src/cli.js screen --limit 400        # keep only exits that reach the provider right now
node src/launcher.js                      # or the interactive menu

# pieces, if you want them separately:
node src/lane.js --tag L1 --port 9421 --target 8 --pick
node src/run-account.js --tag L1-1 --port 9421 --proxy socks5://127.0.0.1:1080 --until start
node src/http-finish.js --tag L1-1 --email <box@…> --box-token <id> --proxy socks5://127.0.0.1:1080
```

**挑战由你这边解答：** 每一轮都会导出为 `solve-<tag>/round-N.png` + `state.json`，你编写 `solve-<tag>/clicks.json` 列出要点击的图块 — 工具会点击它们、重新读取组件并继续。

### 🖱️ 启动器

`src/launcher.js` 是覆盖 mint / verify / screen 和 9Router 的交互式菜单。它与其他仓库具有相同的横幅/菜单形式，并委托给 `src/cli.js` 任务。`node src/launcher.js --connect-9router` 会将密钥注册到本地 9Router。

## ✅ 已验证可用 — 每个密钥都经过测试

> **质量关卡。** 这里的每个密钥在写入 `keys.txt` 之前都通过了实时 `chat-200`
>（失效密钥绝不会被写入）。路由器组合在模型层面遵循相同规则：仅当模型返回 `chat-200` 且能调用工具时才会添加条目 — 不支持工具的模型、失效的密钥或失效的提供商会直接被丢弃而非添加。兼容 **9Router 和 OmniRoute**。

只有当实时 API 使用该密钥成功应答后，密钥才会被写入 `keys.txt`：

| 检查 | 调用 | 预期 |
| --- | --- | --- |
| 认证 + 模型列表 | `GET https://api.intelligence.io.solutions/api/v1/models` | `200` + 账户的模型 id（39 个） |
| 真实补全 | `POST …/chat/completions`（`google/gemma-4-26b-a4b-it`） | `200` + 非空助手消息 |

```bash
node src/cli.js verify --proxy socks5://127.0.0.1:1080    # re-runs both checks over every key and reports a per-key verdict
```

驱动器对它追加的每个密钥都执行相同的检查。`google/gemma-4-26b-a4b-it` 是推理模型 — 文本可能出现在 `reasoning_content` 中。

> ionet 在受限提供商列表中 — 验证形态与实测一致；适用提供商侧的分级限制。

## 🧭 工作原理

```
inbox (one address per account)                                  a fresh address per account
   │
   ├─▶ sign-up: IO Intelligence page → e-mail address → code / link from the inbox
   ├─▶ session: the account's cookies or access token in hand
   ├─▶ key mint: the account's key endpoint → plaintext key returned once (written to disk immediately)
   └─▶ live proof: POST https://api.intelligence.io.solutions/api/v1/chat/completions → real content = the key is live
```

每个账户使用一个 Chrome（浏览器阶段）+ 一个 HTTP 环节：

1. **浏览器阶段**（`run-account.js --until start`）：导航、输入新的邮箱地址、根据你的 `clicks.json` 解答挑战轮次、提交。当 `POST /api/workos/magic-auth/start` 应答的那一刻，账户的收件箱 + 令牌被写入 `handoff.json`，并且 **Chrome 立即关闭** — 浏览器的任务结束。
2. **HTTP 环节**（`http-finish.js`）：从邮箱读取一次性验证码，调用 `magic-auth/verify` → `accessToken`，创建密钥（`POST /v1/api-keys/`），实时验证，追加到 `keys.txt` + `accounts.json`。
3. **驱动器**（`lane.js`）：对尝试进行串行循环 — 选择新的池出口，在使用时进行预检，运行浏览器阶段，自动恢复在提交前被中断的尝试，在令牌有效期内运行 HTTP 环节，将失败的出口加入黑名单，然后重新选择。`lane-<TAG>.jsonl` 记录每次尝试。

两个值得了解的要点：API 密钥必须使用 `project: "io-intelligence"` 创建（工具会为你完成），并且浏览器交接的访问令牌有效期只有 **5 分钟** — 这正是浏览器阶段交接给 HTTP 而非在页面内完成的原因。

## ⚙️ CLI 选项

| 工具 | 标志 |
| --- | --- |
| `cli.js` | `mint` · `finish` · `verify` · `screen` — 每个任务打印自己的标志（`node src/lane.js --help`） |
| `lane.js` | `--tag` (L) · `--port` (9411) · `--target N` (5) · `--preset turbo\|balanced\|safe`（节奏间隔） · `--gap S` · `--pick`（每次尝试使用新的池出口）或 `--proxy <line>`（固定出口） · `--direct`（完全不使用代理） · `--max-attempts N` · `--union-file` / `--new-file` |
| `run-account.js` | `--tag` · `--port` · `--until start\|email\|otp\|key` · `--proxy <line>` · `--broker <url>` · `--solve-dir` · `--solve-budget-ms` · `--round-wait-ms` · `--otp-timeout-ms` · `--email` / `--email-token`（恢复收件箱） |
| `http-finish.js` | `--email` + `--box-token`，或 `--token <accessToken>` / `--token-file`，或 `--from-log <net.jsonl>` · `--name` · `--model` · `--otp-timeout-ms` |
| 9Router | 任何任务上的 `--connect-9router` — 完成后，将 `keys.txt` 中的每个密钥注册到正在运行的 9Router（`node src/connect-9router.js --help`） |

推荐 Turbo（5）；更多则在性能较弱的机器上有负载/封禁风险。

## 🛰️ 在代理后面

**可选 — 大规模使用时推荐（每 IP 限制、封禁）。** 该工具不使用代理也能工作。

- **有代理池时：** 出口来自文本池（每行一个出口，`scheme://host:port`）；每次尝试获得新的出口和使用时预检，产生失败尝试的出口会按通道加入黑名单。
- **无代理池时：** 无需选择 — 通道会自动切换到 DIRECT 模式（或用 `--direct` 强制）；Chrome 上下文以非隧道方式打开，每个请求 — 浏览器、验证码读取、密钥创建、验证 — 都直接从本机发出。
- reCAPTCHA 实现脚本从本地缓存提供给页面，因此出口只需在浏览器阶段能访问 `id.io.net` 和 `www.google.com`。
- 邮箱代理运行在回环地址（`127.0.0.1`）上 — 它是你的，而非提供商的，它保存你的邮件凭据，绝不保存在仓库中。

## 📄 文件

| 路径 | 内容 |
| --- | --- |
| `keys.txt` | 密钥，**每行一个**，在密钥通过实时检查的那一刻追加 — 已被 git 忽略 |
| `accounts.json` | 每个账户一条记录：邮箱、密钥、铸造它的出口 — 已被 git 忽略 |
| [`models.json`](models.json) | 由铸造的密钥应答的 `GET /v1/models`（39 个 id） |
| `out/` | 每次尝试的转储（截图 + DOM/网络日志）、批处理日志、出口记录 — 已被 git 忽略 |
| `proxies.txt` | 你的出口池，每行一个代理（可选） — 已被 git 忽略 |

## 🔌 连接到 9Router

[9Router](https://9router.com) 是一个自托管、兼容 OpenAI 的路由器。io.net 提供兼容 OpenAI 的端点（`https://api.intelligence.io.solutions/api/v1`），因此注册一次，你铸造的每个密钥都会成为一个提供商节点下的连接 — 9Router 会在它们之间进行负载均衡：

```bash
node src/connect-9router.js \
  --base http://localhost:20128 --password 123456 \
  --api-key io-v2-xxxxxxxx
```

不带 `--api-key` 运行它会注册 `keys.txt` 中的**每个**密钥。重复运行是幂等的：节点通过 `--prefix ionet` 匹配，每个连接通过名称匹配（`ionet-001`、`ionet-002`、……），已注册的密钥会被保留不动。默认值：`--base http://localhost:20128`、`--password 123456`、`--name "IO Intelligence"`、`--prefix ionet`、`--base-url https://api.intelligence.io.solutions/api/v1`、`--model google/gemma-4-26b-a4b-it`。

在 9Router 中，目录以如下形式提供：

```
ionet/google/gemma-4-26b-a4b-it
ionet/deepseek-ai/DeepSeek-V4.1-Flash
ionet/zai-org/GLM-5.3-Flash
```

`node src/cli.js mint --target 5 --pick --connect-9router` 一次完成铸造和注册，`node src/launcher.js` 从其菜单驱动相同的流程。

## 🔌 连接到 OmniRoute

[OmniRoute](https://omniroute.online) 是一个自托管、兼容 OpenAI 的路由器。io.net 提供兼容 OpenAI 的端点（`https://api.intelligence.io.solutions/api/v1`），因此注册一次，你铸造的每个密钥都会成为一个提供商节点下的连接 — OmniRoute 会在它们之间进行负载均衡：

```bash
node src/connect-omniroute.js \
  --base http://localhost:20128 --password 123456 \
  --api-key io-v2-xxxxxxxx
```

不带 `--api-key` 运行它会注册 `keys.txt` 中的**每个**密钥。重复运行是幂等的：节点通过 `--prefix ionet` 匹配，每个连接通过名称匹配（`ionet-001`、`ionet-002`、……），已注册的密钥会被保留不动。默认值：`--base http://localhost:20128`、`--password 123456`、`--name "IO Intelligence"`、`--prefix ionet`、`--base-url https://api.intelligence.io.solutions/api/v1`、`--model google/gemma-4-26b-a4b-it`。

在 OmniRoute 中，目录以如下形式提供：

```
ionet/google/gemma-4-26b-a4b-it
ionet/deepseek-ai/DeepSeek-V4.1-Flash
ionet/zai-org/GLM-5.3-Flash
```

`node src/cli.js mint --target 5 --pick --connect-omniroute` 一次完成铸造和注册，`node src/launcher.js` 从其菜单驱动相同的流程。
## 🔑 一个密钥能给你什么

| | |
| --- | --- |
| 🏢 提供商 | **IO Intelligence** — [io.net](https://io.net) |
| 🎁 提供商提供什么 | 列出 39 个模型 — 免费额度将大多数 id 限制为 402；google/gemma-4-26b-a4b-it 是免费额度验证器 |
| 🔑 一个密钥能给你什么 | 一个作用域为其自身账户的 API 密钥：下方端点上的 39 个模型 id，受你套餐限制。配额存在于**账户**上，这正是本工具为每个密钥创建一个账户的原因 |
| 🌐 API 形态 | 兼容 OpenAI：`POST https://api.intelligence.io.solutions/api/v1/chat/completions` |
| 🔒 你的数据 | 仅联系 io.net 和你配置的收件箱后端；密钥保留在你的机器上 |

## 🐞 问题反馈

提交 issue 时请附上失败的步骤、标签/尝试、使用的出口和跟踪日志尾部（`lane-<TAG>-trace.log`）— `out/` 下的截图和状态转储能让失败可复现且不泄露密钥。**[提交 issue](../../issues)** 时附上你运行的命令和确切输出；欢迎 PR。如果提供商的等级关卡仍然路由到 `402 requires a higher IO Intelligence tier`，工具会在该模型处停止并说明 — 受限目录与实测一致。

## 📄 许可证

MIT © 2026 — 见 [LICENSE](LICENSE)。

<div align="center">

**[MIT](LICENSE)** © 2026 ionet-bulk-apikey 贡献者

</div>