<div align="center">

```
██╗ ██████╗     ███╗   ██╗███████╗████████╗
██║██╔═══██╗    ████╗  ██║██╔════╝╚══██╔══╝
██║██║   ██║    ██╔██╗ ██║█████╗     ██║
██║██║   ██║    ██║╚██╗██║██╔══╝     ██║
██║╚██████╔╝    ██║ ╚████║███████╗   ██║
╚═╝ ╚═════╝     ╚═╝  ╚═══╝╚══════╝   ╚═╝
```

# ionet-bulk-apikey

**Bulk-create [io.net](https://io.net) (IO Intelligence) accounts with auto-generated API keys — OpenAI-compatible inference + [9Router](https://9router.com) connector.**

[![Node](https://img.shields.io/badge/Node-%E2%89%A518-3DA639?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![Dependencies](https://img.shields.io/badge/dependencies-0-blue?style=for-the-badge)](#)
[![License](https://img.shields.io/badge/license-MIT-6ea8fe?style=for-the-badge)](LICENSE)
[![Models](https://img.shields.io/badge/models-39%20listed-412991?style=for-the-badge)](https://io.net)
[![9Router](https://img.shields.io/badge/9Router-connector-8B5CF6?style=for-the-badge)](#-connect-to-9router)

[🛠 Quick start](#-quick-start) · [✅ Verified](#-verified-working--every-key-is-tested) · [🧭 How it works](#-how-it-works) · [🤖 Models & free tier](#-models--free-tier) · [⚙️ Options](#️-options) · [🛰️ Proxies](#️-behind-a-proxy) · [🔌 9Router](#-connect-to-9router) · [🐞 Issues](#-issues)

</div>

---

> **One account, one key.** N accounts → N keys from N e-mail-code sign-ups,
> every key verified live before it lands in `keys.txt`.

## ✨ Why this exists

io.net (IO Intelligence) gives every account API access, and the useful unit is *one account per
key*. The sign-up is a single hosted page: e-mail address, a one-time code by mail, and an API-key
endpoint. This tool walks the whole path — a real browser where the page requires one, plain HTTP
for everything else — and only records a key after a real completion:

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

## 🤖 Models & free tier

`GET https://api.intelligence.io.solutions/api/v1/models` answers **39 model ids** for any valid
key, including:

`deepseek-ai/DeepSeek-V4.1-Flash` · `deepseek-ai/DeepSeek-V4-Pro` · `zai-org/GLM-5.3` ·
`zai-org/GLM-5.3-Flash` · `XiaomiMiMo/MiMo-V2.6-Flash` · `moonshotai/Kimi-K3` ·
`MiniMaxAI/MiniMax-M2.7` · `Qwen/Qwen3.8-27B` · `openai/gpt-oss-120b` ·
`deepseek-ai/DeepSeek-R1-0528` · `google/gemma-4-26b-a4b-it`

**What a free account can actually call:** the catalog is *listed* to every key, but generation is
gated per model by the account tier. Measured with a free-tier key across 24 of those ids, exactly
one answered a completion — **`google/gemma-4-26b-a4b-it`** (`200`, a real assistant message; it is a
reasoning model, so the text may arrive in `reasoning_content`). Every other id answered
`402 {"note":"Model '<id>' requires a higher IO Intelligence tier"}`. The same metadata is in the
catalog itself: each model carries `min_access_tier` (1–3) and `higher_tier_required`, so you can see
which ids a plan serves before calling them. The verifier in this repo uses
`google/gemma-4-26b-a4b-it`.

**Scaling:** one account = one key, and the tier gate is per account — a new account (a new sign-up,
a new key) is how you get more. `--count N` takes any N.

```bash
curl https://api.intelligence.io.solutions/api/v1/chat/completions \
  -H "Authorization: Bearer io-v2-…" -H "Content-Type: application/json" \
  -d '{"model":"google/gemma-4-26b-a4b-it","messages":[{"role":"user","content":"hi"}]}'
```

## 🛠 Quick start

```bash
# clone or fork this repository, then:
cd ionet-bulk-apikey

# 1) your proxy list, one exit per line (http://, socks5://, socks4:// or bare host:port)
printf 'socks5://127.0.0.1:1080\n' > proxies.txt

# 2) go — one run == one account attempt, end to end
node src/cli.js mint --count 5            # driver: exit → browser → HTTP finish, per account
node src/cli.js verify                    # re-check the keys already on disk
node src/cli.js screen --limit 400        # keep only exits that reach the provider right now
node src/launcher.js                      # or the interactive menu

# pieces, if you want them separately:
node src/lane.js --tag L1 --port 9421 --target 8 --pick
node src/run-account.js --tag L1-1 --port 9421 --proxy socks5://127.0.0.1:1080 --until start
node src/http-finish.js --tag L1-1 --email <box@…> --box-token <id> --proxy socks5://127.0.0.1:1080
```

**The challenge is answered from your side:** each round is dumped as
`solve-<tag>/round-N.png` + `state.json`, and you (or your vision agent) write
`solve-<tag>/clicks.json` listing the tiles to click — the tool clicks them, re-reads the widget and
moves on. Click lists are applied as a delta against what is already selected, so a stray click can
be undone rather than restarting the round. `--solve-budget-ms` bounds how long a single account may
spend on rounds.

Sign-up needs a mailbox the tools can read: `lane.js` asks a broker you run on loopback for a fresh
inbox per attempt, and `run-account.js` / `http-finish.js` accept `--broker <url>` or an explicit
`--email <box@…> --box-token <id>` pair.

## ✅ Verified working — every key is tested

A key is written to `keys.txt` only after the live API answers with it:

| check | call | expected |
|---|---|---|
| auth + model list | `GET https://api.intelligence.io.solutions/api/v1/models` | `200` + the account's model ids (39) |
| real completion | `POST …/chat/completions` (`google/gemma-4-26b-a4b-it`) | `200` + a non-empty assistant message |

`node src/cli.js verify` re-runs both checks over every key on disk and reports a per-key verdict, and
the driver does the same check on every key it appends.

## 🧭 How it works

Per account, one Chrome (browser phase) + one HTTP leg:

1. **Browser phase** (`run-account.js --until start`): navigate, enter a fresh mailbox address, answer
   the challenge rounds from your `clicks.json`, submit. The moment
   `POST /api/workos/magic-auth/start` answers, the account's inbox + token are written to
   `handoff.json` and **Chrome closes immediately** — the browser's job is over.
2. **HTTP leg** (`http-finish.js`): read the one-time code from the mailbox, call
   `magic-auth/verify` → `accessToken`, create the key (`POST /v1/api-keys/`), verify it live,
   append to `keys.txt` + `accounts.json`.
3. **Driver** (`lane.js`): a serial loop over attempts — picks a fresh pool exit, preflights it at
   the moment of use, runs the browser phase, auto-recovers attempts interrupted before the submit,
   runs the HTTP leg inside the token's lifetime, blacklists exits that failed, and re-picks.
   `lane-<TAG>.jsonl` records every attempt.

Two knobs worth knowing: the API key must be created with `project: "io-intelligence"` (the tool does
this for you), and the access token the browser hands off lives **5 minutes** — which is exactly why
the browser phase hands off to HTTP instead of finishing in-page.

## ⚙️ Options

| tool | flags |
|---|---|
| `cli.js` | `mint` · `finish` · `verify` · `screen` — each task prints its own flags (`node src/lane.js --help`) |
| `lane.js` | `--tag` (RP) · `--port` (9411) · `--target N` · `--pick` (fresh pool exit per attempt) or `--proxy <line>` (fixed exit) · `--max-attempts N` |
| `run-account.js` | `--until start\|otp\|key` · `--solve-budget-ms` · `--round-wait-ms` · `--proxy <line>` · `--broker <url>` · `--email` / `--email-token` (resume an inbox) |
| `http-finish.js` | `--email` + `--box-token`, or `--token <accessToken>`, or `--from-log <net.jsonl>` · `--key-name` |
| 9Router | `--connect-9router` on any task — after it finishes, registers every key in `keys.txt` into a running 9Router (`node src/connect-9router.js --help`) |

## 🛰️ Behind a proxy

* Exits come from a text pool (one line per exit, `scheme://host:port`); each attempt gets a fresh
  exit and a use-time preflight, and exits that produced a failed attempt are blacklisted per lane.
* Every provider call — the browser, the code read, the key create, the verify — goes through the
  pool; nothing is sent from your own address.
* The reCAPTCHA implementation script is served to the page from a local cache, so an exit only needs
  to reach `id.io.net` and `www.google.com` for the browser phase.
* The mailbox broker runs on loopback (`127.0.0.1`) — it is yours, not the provider's, and it holds
  your mail credentials, never the repo.

## 🔌 Connect to 9Router

[9Router](https://9router.com) is a self-hosted, OpenAI-compatible router. io.net serves an
OpenAI-compatible endpoint (`https://api.intelligence.io.solutions/api/v1`), so register it once and
every key you minted becomes a connection under one provider-node — 9Router load-balances across
them:

```bash
node src/connect-9router.js \
  --base http://localhost:20128 --password 123456 \
  --api-key io-v2-xxxxxxxx
```

Run it without `--api-key` to register **every** key in `keys.txt`. Re-running is idempotent: the
node is matched by `--prefix ionet`, each connection is matched by name (`ionet-001`, `ionet-002`, …),
and an already-registered key is left alone. Defaults: `--base http://localhost:20128`,
`--password 123456`, `--name "IO Intelligence"`, `--prefix ionet`,
`--base-url https://api.intelligence.io.solutions/api/v1`, `--model google/gemma-4-26b-a4b-it`.

The default model is the one a **free-tier** key can actually call. The catalogue a key *lists* is
much larger — it includes `deepseek-ai/DeepSeek-V4.1-Flash`, `deepseek-ai/DeepSeek-V4-Pro`,
`zai-org/GLM-5.3`, `moonshotai/Kimi-K3` and 35 more — but every id above tier 1 answers
`402 … requires a higher IO Intelligence tier` until the account is upgraded. In 9Router the
catalogue is served as:

```
ionet/google/gemma-4-26b-a4b-it
ionet/deepseek-ai/DeepSeek-V4.1-Flash
ionet/zai-org/GLM-5.3-Flash
```

`node src/cli.js mint --count 5 --connect-9router` mints and registers in one pass, and
`node src/launcher.js` drives the same flow from its menu.

## 🐞 Issues

Open an issue with the failing step, the tag/attempt, the exit used and the trace tail
(`lane-<TAG>-trace.log`) — screenshots and state dumps under `outputs/` make failures reproducible
without leaking a key.

## 📄 License

MIT — see [LICENSE](LICENSE). Use it on accounts you are allowed to create.

---

<div align="center">

**[MIT](LICENSE) © 2026 ionet-bulk-apikey contributors**

</div>
