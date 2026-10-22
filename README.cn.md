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

**批量创建 IO Intelligence（io.net）账户并自动生成 API 密钥——兼容 OpenAI 的推理 + 9Router 连接器。**

[![Node](https://img.shields.io/badge/Node-%E2%89%A518-3DA639?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![Dependencies](https://img.shields.io/badge/dependencies-0-blue?style=for-the-badge)](#)
[![License](https://img.shields.io/badge/license-MIT-6ea8fe?style=for-the-badge)](LICENSE)
[![Models](https://img.shields.io/badge/models-39%20served-412991?style=for-the-badge)](https://io.net)
[![9Router](https://img.shields.io/badge/9Router-connector-8B5CF6?style=for-the-badge)](#-connect-to-9router)
[![X](https://img.shields.io/badge/X-%40bigbullapp-000000?style=for-the-badge&logo=x&logoColor=white)](https://x.com/bigbullapp)

[🛠 快速开始](#-quick-start) · [🎁 免费额度](#-free-tier--how-much-you-get) · [🤖 模型](#-models--all-39-of-them) · [🧪 使用 API](#-how-to-use-the-api) · [✅ 已验证](#-verified-working--every-key-is-tested) · [🧭 工作原理](#-how-it-works) · [🔌 9Router](#-connect-to-9router) · [⚙️ 选项](#️-cli-options) · [🛰️ 代理](#️-behind-a-proxy) · [🐞 问题](#-issues)

</div>

<div align="center">

**English** · [Türkçe](README.tr.md) · [中文](README.cn.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Русский](README.ru.md) · [Português](README.pt.md)

</div>

---

## ✨ 为什么会有这个项目

io.net（IO Intelligence）为每个账户提供 API 访问权限，而真正有用的单位是*每个密钥对应一个账户*。注册流程是一个托管页面：电子邮件地址、通过邮件发送的一次性验证码，以及一个 API 密钥端点。此工具走完整条路径——页面需要时使用真实浏览器，其余全部使用纯 HTTP——并且只有在真实补全成功后才会记录密钥：

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

> **状态说明（2026-10-18）：** 仓库曾于当天早些时候被归档，因为当时认为该链路已失效；晚间重新审计再次验证了它——对磁盘上密钥池的实时扫描返回了真实的聊天补全（`google/gemma-4-26b-a4b-it` → 200 `"pong"`），并且链路 `id.io.net/login` 返回 `200`。仓库现已重新**活跃**。注册受到提供商限流，挑战由人工把关；规模受这些关卡限制。

## 🎁 免费额度——你能获得多少

**免费账户实际能调用什么：** 目录会向每个密钥*列出*，但生成会按账户层级对每个模型进行限制。使用免费层密钥对其中的 24 个 id 进行实测，恰好只有一个能返回补全——**`google/gemma-4-26b-a4b-it`**（`200`，真实的助手消息；它是推理模型，因此文本可能出现在 `reasoning_content` 中）。其他每个 id 都返回 `402 {"note":"Model '<id>' requires a higher IO Intelligence tier"}`。

| 项目 | 值 |
| --- | --- |
| 每个密钥的目录 | `GET /v1/models` 上的 **39 个 id**（记录于 [`models.json`](models.json)） |
| 免费层验证器 | `google/gemma-4-26b-a4b-it` — **200** 且返回真实内容 |
| 免费层上的其他 id | 升级前返回 `402 requires a higher IO Intelligence tier` |
| 每个模型的元数据 | 每个模型都带有 `min_access_tier`（1–3）和 `higher_tier_required` |
| 注册 | `id.io.net/login`（电子邮件 → 验证码 → `magic-auth/verify` → `accessToken` → `POST /v1/api-keys`） |
| 可扩展的单位 | **一个账户 = 一个密钥** → `--target N` 即 N 个账户/密钥 |

> 💡 免费额度由 IO Intelligence 设定，并且可能变化。请在 [io.net](https://io.net) 查看实时数字——并让工具自身的关卡来判断：

```bash
node src/cli.js verify --proxy socks5://127.0.0.1:1080     # every key is re-tested (models + chat) through one exit
```

## 🤖 模型——全部 39 个

`GET https://api.intelligence.io.solutions/api/v1/models` 对任何有效密钥都会返回 **39 个模型 id**，包括：

`deepseek-ai/DeepSeek-V4.1-Flash` · `deepseek-ai/DeepSeek-V4-Pro` · `zai-org/GLM-5.3` · `zai-org/GLM-5.3-Flash` · `XiaomiMiMo/MiMo-V2.6-Flash` · `moonshotai/Kimi-K3` · `MiniMaxAI/MiniMax-M2.7` · `Qwen/Qwen3.8-27B` · `openai/gpt-oss-120b` · `deepseek-ai/DeepSeek-R1-0528` · `google/gemma-4-26b-a4b-it`

实测免费层覆盖：

|模型|✓|
|---|---|
|`google/gemma-4-26b-a4b-it`|✓|
|`nvidia/nemotron-3.5-lightning`|✓|

2026-10-19 实时复查（5 个密钥 × 4 个出口）：`nvidia/nemotron-3.5-lightning` 在 20/20 次探测中返回 `200`；39-id 目录中的其余模型返回 `402 requires a higher IO Intelligence tier`。

完整的 39 个 id 位于 [`models.json`](models.json)。对一个密钥进行实时探测（正是验证器所做的事）：

```bash
curl https://api.intelligence.io.solutions/api/v1/chat/completions \
  -H "Authorization: Bearer io-v2-…" -H "Content-Type: application/json" \
  -d '{"model":"google/gemma-4-26b-a4b-it","messages":[{"role":"user","content":"hi"}]}'
```

## 🧪 如何使用 API

基础 URL 是 **`https://api.intelligence.io.solutions/api/v1`**——兼容 OpenAI。

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

## 🛠 快速开始

```bash
git clone https://github.com/F0Rextasy/ionet-bulk-apikey.git
cd ionet-bulk-apikey

# 1) your proxy list, one exit per line (http://, socks5://, socks4:// or bare host:port)
printf 'socks5://127.0.0.1:1080\n' > proxies.txt

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

**挑战由你这边来作答：** 每一轮都会导出为 `solve-<tag>/round-N.png` + `state.json`，然后你编写 `solve-<tag>/clicks.json`，列出要点击的图块——工具会点击它们，重新读取组件并继续。

### 🖱️ 启动器

`src/launcher.js` 是覆盖 mint / verify / screen 和 9Router 的交互式菜单。它与其他仓库具有相同的横幅/菜单形态，并将任务委托给 `src/cli.js`。`node src/launcher.js --connect-9router` 会将密钥注册到本地 9Router。

## ✅ 已验证可用——每个密钥都会测试

只有在实时 API 使用某个密钥成功响应后，该密钥才会写入 `keys.txt`：

| 检查 | 调用 | 预期 |
| --- | --- | --- |
| 认证 + 模型列表 | `GET https://api.intelligence.io.solutions/api/v1/models` | `200` + 账户的模型 id（39） |
| 真实补全 | `POST …/chat/completions` (`google/gemma-4-26b-a4b-it`) | `200` + 非空助手消息 |

```bash
node src/cli.js verify --proxy socks5://127.0.0.1:1080    # re-runs both checks over every key and reports a per-key verdict
```

驱动器会对其追加的每个密钥执行相同的检查。`google/gemma-4-26b-a4b-it` 是推理模型——文本可能出现在 `reasoning_content` 中。

> ionet 位于被阻止的提供商列表中——验证形态与实测一致；适用提供商侧的分层限制。

## 🧭 工作原理

```
inbox (one address per account)                                  a fresh address per account
   │
   ├─▶ sign-up: IO Intelligence page → e-mail address → code / link from the inbox
   ├─▶ session: the account's cookies or access token in hand
   ├─▶ key mint: the account's key endpoint → plaintext key returned once (written to disk immediately)
   └─▶ live proof: POST https://api.intelligence.io.solutions/api/v1/chat/completions → real content = the key is live
```

每个账户使用一个 Chrome（浏览器阶段）+ 一个 HTTP 阶段：

1. **浏览器阶段**（`run-account.js --until start`）：导航、输入新的邮箱地址、根据你的 `clicks.json` 回答挑战轮次、提交。就在 `POST /api/workos/magic-auth/start` 响应的那一刻，该账户的收件箱 + 令牌会写入 `handoff.json`，并且 **Chrome 立即关闭**——浏览器的工作到此结束。
2. **HTTP 阶段**（`http-finish.js`）：从邮箱读取一次性验证码，调用 `magic-auth/verify` → `accessToken`，创建密钥（`POST /v1/api-keys/`），实时验证，然后追加到 `keys.txt` + `accounts.json`。
3. **驱动器**（`lane.js`）：对尝试进行串行循环——选择一个全新的池出口，在使用时对其进行预检，运行浏览器阶段，自动恢复在提交前中断的尝试，在令牌生命周期内运行 HTTP 阶段，将失败的出口列入黑名单，并重新选择。`lane-<TAG>.jsonl` 记录每次尝试。

有两个值得了解的要点：API 密钥必须使用 `project: "io-intelligence"` 创建（工具会为你完成此操作），并且浏览器交接的访问令牌有效期为 **5 分钟**——这正是浏览器阶段交接给 HTTP 而不是在页面内完成的原因。

## ⚙️ CLI 选项

| 工具 | 参数 |
| --- | --- |
| `cli.js` | `mint` · `finish` · `verify` · `screen`——每个任务会打印自己的参数（`node src/lane.js --help`） |
| `lane.js` | `--tag` (L) · `--port` (9411) · `--target N` (5) · `--preset turbo\|balanced\|safe`（节奏间隔） · `--gap S` · `--pick`（每次尝试使用新的池出口）或 `--proxy <line>`（固定出口） · `--max-attempts N` · `--union-file` / `--new-file` |
| `run-account.js` | `--tag` · `--port` · `--until start\|email\|otp\|key` · `--proxy <line>` · `--broker <url>` · `--solve-dir` · `--solve-budget-ms` · `--round-wait-ms` · `--otp-timeout-ms` · `--email` / `--email-token`（恢复收件箱） |
| `http-finish.js` | `--email` + `--box-token`，或 `--token <accessToken>` / `--token-file`，或 `--from-log <net.jsonl>` · `--name` · `--model` · `--otp-timeout-ms` |
| 9Router | `--connect-9router` 可用于任何任务——任务完成后，将 `keys.txt` 中的每个密钥注册到正在运行的 9Router（`node src/connect-9router.js --help`） |

建议使用 Turbo（5）；更多可能在性能较弱的机器上带来负载/封禁风险。

## 🛰️ 通过代理运行

* 出口来自文本池（每个出口一行，`scheme://host:port`）；每次尝试都会获得新的出口，并在使用时进行预检，产生失败尝试的出口会按通道加入黑名单。
* 每次提供商调用——浏览器、验证码读取、密钥创建、验证——都会经过代理池；不会从你自己的地址发送任何内容。
* reCAPTCHA 实现脚本从本地缓存提供给页面，因此浏览器阶段的出口只需能够访问 `id.io.net` 和 `www.google.com`。
* 邮箱代理运行在回环地址（`127.0.0.1`）上——它属于你，而不是提供商；它保存你的邮件凭据，而绝不会保存在仓库中。

## 📄 文件

| 路径 | 内容 |
| --- | --- |
| `keys.txt` | 密钥，**每行一个**，在密钥通过实时检查的那一刻追加——已被 git 忽略 |
| `accounts.json` | 每个账户一条记录：邮箱、密钥、创建它的出口——已被 git 忽略 |
| [`models.json`](models.json) | 由已创建密钥返回的 `GET /v1/models`（39 个 id） |
| `out/` | 每次尝试的转储（截图 + DOM/网络日志）、批处理日志、出口记录——已被 git 忽略 |
| `proxies.txt` | 你的出口池，每行一个代理——已被 git 忽略 |

## 🔌 连接到 9Router

[9Router](https://9router.com) 是一个自托管、兼容 OpenAI 的路由器。io.net 提供兼容 OpenAI 的端点（`https://api.intelligence.io.solutions/api/v1`），因此注册一次后，你创建的每个密钥都会成为同一个提供商节点下的连接——9Router 会在它们之间进行负载均衡：

```bash
node src/connect-9router.js \
  --base http://localhost:20128 --password 123456 \
  --api-key io-v2-xxxxxxxx
```

不带 `--api-key` 运行它会注册 `keys.txt` 中的**每个**密钥。重复运行是幂等的：节点通过 `--prefix ionet` 匹配，每个连接按名称匹配（`ionet-001`、`ionet-002`、……），已注册的密钥会被保持不变。默认值：`--base http://localhost:20128`、`--password 123456`、`--name "IO Intelligence"`、`--prefix ionet`、`--base-url https://api.intelligence.io.solutions/api/v1`、`--model google/gemma-4-26b-a4b-it`。

在 9Router 中，目录以如下形式提供：

```
ionet/google/gemma-4-26b-a4b-it
ionet/deepseek-ai/DeepSeek-V4.1-Flash
ionet/zai-org/GLM-5.3-Flash
```

`node src/cli.js mint --target 5 --pick --connect-9router` 可一次性创建并注册，`node src/launcher.js` 则从其菜单驱动相同流程。

## 🔑 一个密钥能带来什么

| | |
| --- | --- |
| 🏢 提供商 | **IO Intelligence** — [io.net](https://io.net) |
| 🎁 提供商提供什么 | 列出 39 个模型——免费层将大多数 id 限制为 402；google/gemma-4-26b-a4b-it 是免费层验证器 |
| 🔑 一个密钥能带来什么 | 一个 API 密钥，作用域为其自身账户：下方端点上的 39 个模型 id，受你的计划限制。配额存在于**账户**上，这正是此工具为每个密钥创建一个账户的原因 |
| 🌐 API 形态 | 兼容 OpenAI：`POST https://api.intelligence.io.solutions/api/v1/chat/completions` |
| 🔒 你的数据 | 只会联系 io.net 和你配置的收件箱后端；密钥保留在你的机器上 |

## 🐞 问题

请提交 issue，并附上失败步骤、标签/尝试、使用的出口和跟踪日志尾部（`lane-<TAG>-trace.log`）——`out/` 下的截图和状态转储可以让故障可复现，而不会泄露密钥。请附上你运行的命令和确切输出，**[提交 issue](../../issues)**；欢迎 PR。如果提供商的层级关卡仍然返回 `402 requires a higher IO Intelligence tier`，工具会停在该模型并说明这一点——受限目录与实测一致。

## 📄 许可证

MIT © 2026——见 [LICENSE](LICENSE)。

<div align="center">

**[MIT](LICENSE)** © 2026 ionet-bulk-apikey 贡献者

</div>