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

**Bulk-create IO Intelligence (io.net) accounts with auto-generated API keys — OpenAI-compatible inference + 9Router connector.**

[![Node](https://img.shields.io/badge/Node-%E2%89%A518-3DA639?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![Dependencies](https://img.shields.io/badge/dependencies-0-blue?style=for-the-badge)](#)
[![License](https://img.shields.io/badge/license-MIT-6ea8fe?style=for-the-badge)](LICENSE)
[![Models](https://img.shields.io/badge/models-39%20served-412991?style=for-the-badge)](https://io.net)
[![9Router](https://img.shields.io/badge/9Router-connector-8B5CF6?style=for-the-badge)](#-connect-to-9router)
[![OmniRoute](https://img.shields.io/badge/OmniRoute-connector-8B5CF6?style=for-the-badge)](#-connect-to-omniroute)
[![X](https://img.shields.io/badge/X-%40bigbullapp-000000?style=for-the-badge&logo=x&logoColor=white)](https://x.com/bigbullapp)

[🛠 Quick start](#-quick-start) · [🎁 Free tier](#-free-tier--how-much-you-get) · [🤖 Models](#-models--all-39-of-them) · [🧪 Use the API](#-how-to-use-the-api) · [✅ Verified](#-verified-working--every-key-is-tested) · [🧭 How it works](#-how-it-works) · [🔌 9Router](#-connect-to-9router) · [🔌 OmniRoute](#-connect-to-omniroute) · [⚙️ Options](#️-cli-options) · [🛰️ Proxies](#️-behind-a-proxy) · [🐞 Issues](#-issues)

</div>

<div align="center">

**English** · [Türkçe](README.tr.md) · [中文](README.cn.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Русский](README.ru.md) · [Português](README.pt.md)

</div>

---

## ✨ Why this exists

io.net (IO Intelligence) gives every account API access, and the useful unit is *one account per key*. The sign-up is a single hosted page: e-mail address, a one-time code by mail, and an API-key endpoint. This tool walks the whole path — a real browser where the page requires one, plain HTTP for everything else — and only records a key after a real completion:

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

> **Status note (2026-10-18):** repo was archived earlier the same day while the rail was believed dead; an evening re-audit re-verified it — a live sweep of the on-disk pool answered real chat completions (`google/gemma-4-26b-a4b-it` → 200 `"pong"`) and the rail `id.io.net/login` answered `200`. Repo is **active** again. Registrations are rate-limited by the provider and challenges are human-gated; scale is capped by those gates.

## 🎁 Free tier — how much you get

**What a free account can actually call:** the catalog is *listed* to every key, but generation is gated per model by the account tier. Measured with a free-tier key across 24 of those ids, exactly one answered a completion — **`google/gemma-4-26b-a4b-it`** (`200`, a real assistant message; it is a reasoning model, so the text may arrive in `reasoning_content`). Every other id answered `402 {"note":"Model '<id>' requires a higher IO Intelligence tier"}`.

| What | Value |
| --- | --- |
| Catalogue per key | **39 ids** on `GET /v1/models` (captured in [`models.json`](models.json)) |
| Free-tier verifier | `google/gemma-4-26b-a4b-it` — **200** with real content |
| Other ids on free tier | `402 requires a higher IO Intelligence tier` until upgraded |
| Per-model metadata | each model carries `min_access_tier` (1–3) and `higher_tier_required` |
| Sign-up | `id.io.net/login` (e-mail → code → `magic-auth/verify` → `accessToken` → `POST /v1/api-keys`) |
| The unit that scales | **one account = one key** → `--target N` is N accounts/keys |

> 💡 The free tier is set by IO Intelligence and can change. Check the live numbers at [io.net](https://io.net) — and let the tool's own gate decide:

```bash
node src/cli.js verify --proxy socks5://127.0.0.1:1080     # every key is re-tested (models + chat) through one exit
```

## 🤖 Models — all 39 of them

`GET https://api.intelligence.io.solutions/api/v1/models` answers **39 model ids** for any valid key, including:

`deepseek-ai/DeepSeek-V4.1-Flash` · `deepseek-ai/DeepSeek-V4-Pro` · `zai-org/GLM-5.3` · `zai-org/GLM-5.3-Flash` · `XiaomiMiMo/MiMo-V2.6-Flash` · `moonshotai/Kimi-K3` · `MiniMaxAI/MiniMax-M2.7` · `Qwen/Qwen3.8-27B` · `openai/gpt-oss-120b` · `deepseek-ai/DeepSeek-R1-0528` · `google/gemma-4-26b-a4b-it`

Measured free-tier coverage:

|Model|✓|
|---|---|
|`google/gemma-4-26b-a4b-it`|✓|
|`nvidia/nemotron-3.5-lightning`|✓|

2026-10-19 live re-check (5 keys × 4 exits): `nvidia/nemotron-3.5-lightning` answered `200` on 20/20 probes; the rest of the 39-id catalogue answers `402 requires a higher IO Intelligence tier`.

The full 39 ids are in [`models.json`](models.json). Live probe of one key (exactly what the verifier does):

```bash
curl https://api.intelligence.io.solutions/api/v1/chat/completions \
  -H "Authorization: Bearer io-v2-…" -H "Content-Type: application/json" \
  -d '{"model":"google/gemma-4-26b-a4b-it","messages":[{"role":"user","content":"hi"}]}'
```

## 🧪 How to use the API

The base URL is **`https://api.intelligence.io.solutions/api/v1`** — OpenAI-compatible.

**Any SDK / curl**

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

## ⚡ One command

```bash
node src/cli.js --count N      # mint N keys — exit screen, browser, HTTP finish, one account at a time
node src/cli.js --dry          # print the resolved plan: writes nothing, sends nothing
```

`--auto` is the default: the mint path needs no token, captcha answer or proxy question from you. A `proxies.txt` next to the CLI is used automatically (otherwise the tool goes direct), and the interactive menu (`node src/launcher.js`) wraps the same tasks.

> ⚠️ **Terms & account risk.** Automating a provider can violate its Terms of Service and get accounts or IPs banned. You run this on accounts you own, from your own machine, at your own risk; the tool only drives the site's own sign-up page and never bypasses a paid gate. Read the provider's ToS before a large campaign.

## 🛠 Quick start

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

**The challenge is answered from your side:** each round is dumped as `solve-<tag>/round-N.png` + `state.json`, and you write `solve-<tag>/clicks.json` listing the tiles to click — the tool clicks them, re-reads the widget and moves on.

### 🖱️ The launcher

`src/launcher.js` is the interactive menu over mint / verify / screen and 9Router. It is the same banner/menu shape as the other repos and delegates to `src/cli.js` tasks. `node src/launcher.js --connect-9router` registers the keys in a local 9Router.

## ✅ Verified working — every key is tested

> **Quality gates.** Every key here passed a live `chat-200` before it was written to `keys.txt`
> (dead keys are never shipped). Router combos follow the same rule at the model level: an entry is
> added **only if the model answers `chat-200` and can call tools** — a model without tool support,
> a dead key or a dead provider is dropped instead of added. Works with **9Router and OmniRoute**.

A key is written to `keys.txt` only after the live API answers with it:

| check | call | expected |
| --- | --- |
| auth + model list | `GET https://api.intelligence.io.solutions/api/v1/models` | `200` + the account's model ids (39) |
| real completion | `POST …/chat/completions` (`google/gemma-4-26b-a4b-it`) | `200` + a non-empty assistant message |

```bash
node src/cli.js verify --proxy socks5://127.0.0.1:1080    # re-runs both checks over every key and reports a per-key verdict
```

The driver does the same check on every key it appends. `google/gemma-4-26b-a4b-it` is a reasoning model — the text may arrive in `reasoning_content`.

> ionet is on the blocked-provider list — verification shape is as measured; provider-side tiering applies.

## 🧭 How it works

```
inbox (one address per account)                                  a fresh address per account
   │
   ├─▶ sign-up: IO Intelligence page → e-mail address → code / link from the inbox
   ├─▶ session: the account's cookies or access token in hand
   ├─▶ key mint: the account's key endpoint → plaintext key returned once (written to disk immediately)
   └─▶ live proof: POST https://api.intelligence.io.solutions/api/v1/chat/completions → real content = the key is live
```

Per account, one Chrome (browser phase) + one HTTP leg:

1. **Browser phase** (`run-account.js --until start`): navigate, enter a fresh mailbox address, answer the challenge rounds from your `clicks.json`, submit. The moment `POST /api/workos/magic-auth/start` answers, the account's inbox + token are written to `handoff.json` and **Chrome closes immediately** — the browser's job is over.
2. **HTTP leg** (`http-finish.js`): read the one-time code from the mailbox, call `magic-auth/verify` → `accessToken`, create the key (`POST /v1/api-keys/`), verify it live, append to `keys.txt` + `accounts.json`.
3. **Driver** (`lane.js`): a serial loop over attempts — picks a fresh pool exit, preflights it at the moment of use, runs the browser phase, auto-recovers attempts interrupted before the submit, runs the HTTP leg inside the token's lifetime, blacklists exits that failed, and re-picks. `lane-<TAG>.jsonl` records every attempt.

Two knobs worth knowing: the API key must be created with `project: "io-intelligence"` (the tool does this for you), and the access token the browser hands off lives **5 minutes** — which is exactly why the browser phase hands off to HTTP instead of finishing in-page.

## ⚙️ CLI options

| tool | flags |
| --- | --- |
| `cli.js` | `mint` · `finish` · `verify` · `screen` — each task prints its own flags (`node src/lane.js --help`) |
| `lane.js` | `--tag` (L) · `--port` (9411) · `--target N` (5) · `--preset turbo\|balanced\|safe` (pacing gap) · `--gap S` · `--pick` (fresh pool exit per attempt) or `--proxy <line>` (fixed exit) · `--direct` (no proxy at all) · `--max-attempts N` · `--union-file` / `--new-file` |
| `run-account.js` | `--tag` · `--port` · `--until start\|email\|otp\|key` · `--proxy <line>` · `--broker <url>` · `--solve-dir` · `--solve-budget-ms` · `--round-wait-ms` · `--otp-timeout-ms` · `--email` / `--email-token` (resume an inbox) |
| `http-finish.js` | `--email` + `--box-token`, or `--token <accessToken>` / `--token-file`, or `--from-log <net.jsonl>` · `--name` · `--model` · `--otp-timeout-ms` |
| 9Router | `--connect-9router` on any task — after it finishes, registers every key in `keys.txt` into a running 9Router (`node src/connect-9router.js --help`) |

Turbo önerilir (5); daha fazlası zayıf bilgisayarda yük/ban riski.

## 🛰️ Behind a proxy

**Optional — recommended at scale (per-IP limits, bans).** The tool works without a proxy too.

- **With a pool:** exits come from a text pool (one line per exit, `scheme://host:port`); each attempt gets a fresh exit and a use-time preflight, and exits that produced a failed attempt are blacklisted per lane.
- **Without a pool:** nothing to pick — the lane switches to DIRECT mode by itself (or force it with `--direct`); the Chrome context opens untunnelled and every request — browser, code read, key create, verify — leaves this machine directly.
- The reCAPTCHA implementation script is served to the page from a local cache, so an exit only needs to reach `id.io.net` and `www.google.com` for the browser phase.
- The mailbox broker runs on loopback (`127.0.0.1`) — it is yours, not the provider's, and it holds your mail credentials, never the repo.

## 📄 Files

| Path | Contents |
| --- | --- |
| `keys.txt` | the keys, **one per line**, appended the moment a key passes the live check — git-ignored |
| `accounts.json` | one record per account: mailbox, key, the exit that minted it — git-ignored |
| [`models.json`](models.json) | `GET /v1/models` as answered by a minted key (39 ids) |
| `out/` | per-attempt dumps (screenshots + DOM/network logs), batch log, exit bookkeeping — git-ignored |
| `proxies.txt` | your exit pool, one proxy per line (optional) — git-ignored |

## 🔌 Connect to 9Router

[9Router](https://9router.com) is a self-hosted, OpenAI-compatible router. io.net serves an OpenAI-compatible endpoint (`https://api.intelligence.io.solutions/api/v1`), so register it once and every key you minted becomes a connection under one provider-node — 9Router load-balances across them:

```bash
node src/connect-9router.js \
  --base http://localhost:20128 --password 123456 \
  --api-key io-v2-xxxxxxxx
```

Run it without `--api-key` to register **every** key in `keys.txt`. Re-running is idempotent: the node is matched by `--prefix ionet`, each connection is matched by name (`ionet-001`, `ionet-002`, …), and an already-registered key is left alone. Defaults: `--base http://localhost:20128`, `--password 123456`, `--name "IO Intelligence"`, `--prefix ionet`, `--base-url https://api.intelligence.io.solutions/api/v1`, `--model google/gemma-4-26b-a4b-it`.

In 9Router the catalogue is served as:

```
ionet/google/gemma-4-26b-a4b-it
ionet/deepseek-ai/DeepSeek-V4.1-Flash
ionet/zai-org/GLM-5.3-Flash
```

`node src/cli.js mint --target 5 --pick --connect-9router` mints and registers in one pass, and `node src/launcher.js` drives the same flow from its menu.

## 🔌 Connect to OmniRoute

[OmniRoute](https://omniroute.online) is a self-hosted, OpenAI-compatible router. io.net serves an OpenAI-compatible endpoint (`https://api.intelligence.io.solutions/api/v1`), so register it once and every key you minted becomes a connection under one provider-node — OmniRoute load-balances across them:

```bash
node src/connect-omniroute.js \
  --base http://localhost:20128 --password 123456 \
  --api-key io-v2-xxxxxxxx
```

Run it without `--api-key` to register **every** key in `keys.txt`. Re-running is idempotent: the node is matched by `--prefix ionet`, each connection is matched by name (`ionet-001`, `ionet-002`, …), and an already-registered key is left alone. Defaults: `--base http://localhost:20128`, `--password 123456`, `--name "IO Intelligence"`, `--prefix ionet`, `--base-url https://api.intelligence.io.solutions/api/v1`, `--model google/gemma-4-26b-a4b-it`.

In OmniRoute the catalogue is served as:

```
ionet/google/gemma-4-26b-a4b-it
ionet/deepseek-ai/DeepSeek-V4.1-Flash
ionet/zai-org/GLM-5.3-Flash
```

`node src/cli.js mint --target 5 --pick --connect-omniroute` mints and registers in one pass, and `node src/launcher.js` drives the same flow from its menu.
## 🔑 What one key gets you

| | |
| --- | --- |
| 🏢 Provider | **IO Intelligence** — [io.net](https://io.net) |
| 🎁 What the provider gives | 39 models listed — free tier gates most ids to 402; google/gemma-4-26b-a4b-it is the free-tier verifier |
| 🔑 What one key gets you | one API key scoped to its own account: the 39 model ids on the endpoint below, at your plan's limits. The quota lives on the **account**, which is exactly why this tool creates one account per key |
| 🌐 API shape | OpenAI-compatible: `POST https://api.intelligence.io.solutions/api/v1/chat/completions` |
| 🔒 Your data | only io.net and the inbox backend you configure are contacted; keys stay on your machine |

## 🐞 Issues

Open an issue with the failing step, the tag/attempt, the exit used and the trace tail (`lane-<TAG>-trace.log`) — screenshots and state dumps under `out/` make failures reproducible without leaking a key. **[Open an issue](../../issues)** with the command you ran and the exact output; PRs are welcome. If the provider's tier gate still routes to `402 requires a higher IO Intelligence tier`, the tool stops at that model and says so — the gated catalogue is as measured.

## 📄 License

MIT © 2026 — see [LICENSE](LICENSE).

<div align="center">

**[MIT](LICENSE)** © 2026 ionet-bulk-apikey contributors

</div>
