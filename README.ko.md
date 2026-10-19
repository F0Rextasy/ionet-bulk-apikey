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

**자동 생성된 API 키로 IO Intelligence(io.net) 계정을 대량 생성 — OpenAI 호환 추론 + 9Router 커넥터.**

[![Node](https://img.shields.io/badge/Node-%E2%89%A518-3DA639?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![Dependencies](https://img.shields.io/badge/dependencies-0-blue?style=for-the-badge)](#)
[![License](https://img.shields.io/badge/license-MIT-6ea8fe?style=for-the-badge)](LICENSE)
[![Models](https://img.shields.io/badge/models-39%20served-412991?style=for-the-badge)](https://io.net)
[![9Router](https://img.shields.io/badge/9Router-connector-8B5CF6?style=for-the-badge)](#-connect-to-9router)
[![X](https://img.shields.io/badge/X-%40bigbullapp-000000?style=for-the-badge&logo=x&logoColor=white)](https://x.com/bigbullapp)

[🛠 빠른 시작](#-quick-start) · [🎁 무료 티어](#-free-tier--how-much-you-get) · [🤖 모델](#-models--all-39-of-them) · [🧪 API 사용](#-how-to-use-the-api) · [✅ 검증됨](#-verified-working--every-key-is-tested) · [🧭 작동 방식](#-how-it-works) · [🔌 9Router](#-connect-to-9router) · [⚙️ 옵션](#️-cli-options) · [🛰️ 프록시](#️-behind-a-proxy) · [🐞 이슈](#-issues)

</div>

<div align="center">

**English** · [Türkçe](README.tr.md) · [中文](README.cn.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Русский](README.ru.md) · [Português](README.pt.md)

</div>

---

## ✨ 왜 만들었나

io.net(IO Intelligence)은 모든 계정에 API 액세스를 제공하며, 유용한 단위는 *키당 계정 하나*입니다. 가입은 하나의 호스팅 페이지에서 이루어집니다: 이메일 주소, 메일로 받는 일회용 코드, API 키 엔드포인트. 이 도구는 전체 경로를 따라갑니다 — 페이지가 요구하는 곳에서는 실제 브라우저를, 나머지는 일반 HTTP를 사용 — 그리고 실제 완성이 확인된 뒤에만 키를 기록합니다:

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

> **상태 참고(2026-10-18):** 같은 날 일찍 레일이 죽었다고 판단되어 저장소가 보관 처리되었지만, 저녁 재감사에서 다시 검증되었습니다 — 디스크에 있는 풀을 실시간으로 훑어 실제 채팅 완성이 응답됨을 확인했고(`google/gemma-4-26b-a4b-it` → 200 `"pong"`), 레일 `id.io.net/login`도 `200`을 응답했습니다. 저장소는 다시 **활성** 상태입니다. 등록은 제공자에 의해 속도 제한되며 챌린지는 사람이 직접 통과해야 합니다. 규모는 이러한 게이트에 의해 제한됩니다.

## 🎁 무료 티어 — 얼마나 받을 수 있나

**무료 계정이 실제로 호출할 수 있는 것:** 카탈로그는 모든 키에 *목록으로 제공*되지만, 생성은 계정 티어에 따라 모델별로 제한됩니다. 무료 티어 키로 해당 id 중 24개를 측정한 결과, 정확히 하나만 완성 요청에 응답했습니다 — **`google/gemma-4-26b-a4b-it`** (`200`, 실제 어시스턴트 메시지. 추론 모델이므로 텍스트가 `reasoning_content`로 도착할 수 있습니다). 다른 모든 id는 `402 {"note":"Model '<id>' requires a higher IO Intelligence tier"}`라고 응답했습니다.

| 항목 | 값 |
| --- | --- |
| 키당 카탈로그 | `GET /v1/models`에서 **39개 id** ([`models.json`](models.json)에 캡처됨) |
| 무료 티어 검증 모델 | `google/gemma-4-26b-a4b-it` — 실제 콘텐츠와 함께 **200** |
| 무료 티어의 다른 id | 업그레이드 전까지 `402 requires a higher IO Intelligence tier` |
| 모델별 메타데이터 | 각 모델에는 `min_access_tier`(1–3)와 `higher_tier_required`가 있음 |
| 가입 | `id.io.net/login` (e-mail → code → `magic-auth/verify` → `accessToken` → `POST /v1/api-keys`) |
| 확장 단위 | **계정 하나 = 키 하나** → `--target N`은 N개 계정/키 |

> 💡 무료 티어는 IO Intelligence가 설정하며 변경될 수 있습니다. 실시간 수치는 [io.net](https://io.net)에서 확인하세요 — 그리고 도구 자체의 게이트가 판단하게 하세요:

```bash
node src/cli.js verify --proxy socks5://127.0.0.1:1080     # every key is re-tested (models + chat) through one exit
```

## 🤖 모델 — 39개 전부

`GET https://api.intelligence.io.solutions/api/v1/models`는 유효한 키라면 **39개 모델 id**를 응답하며, 다음을 포함합니다:

`deepseek-ai/DeepSeek-V4.1-Flash` · `deepseek-ai/DeepSeek-V4-Pro` · `zai-org/GLM-5.3` · `zai-org/GLM-5.3-Flash` · `XiaomiMiMo/MiMo-V2.6-Flash` · `moonshotai/Kimi-K3` · `MiniMaxAI/MiniMax-M2.7` · `Qwen/Qwen3.8-27B` · `openai/gpt-oss-120b` · `deepseek-ai/DeepSeek-R1-0528` · `google/gemma-4-26b-a4b-it`

측정된 무료 티어 범위:

|모델|✓|
|---|---|
|`google/gemma-4-26b-a4b-it`|✓|
|`nvidia/nemotron-3.5-lightning`|✓|

2026-10-19 실시간 재확인(키 5개 × 출구 4개): `nvidia/nemotron-3.5-lightning`은 20/20 프로브에서 `200`을 응답했고, 나머지 39개 id 카탈로그는 `402 requires a higher IO Intelligence tier`를 응답합니다.

전체 39개 id는 [`models.json`](models.json)에 있습니다. 키 하나의 실시간 프로브(검증기가 수행하는 것과 정확히 같음):

```bash
curl https://api.intelligence.io.solutions/api/v1/chat/completions \
  -H "Authorization: Bearer io-v2-…" -H "Content-Type: application/json" \
  -d '{"model":"google/gemma-4-26b-a4b-it","messages":[{"role":"user","content":"hi"}]}'
```

## 🧪 API 사용 방법

기본 URL은 **`https://api.intelligence.io.solutions/api/v1`** 입니다 — OpenAI 호환.

**모든 SDK / curl**

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

## 🛠 빠른 시작

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

**챌린지는 사용자 쪽에서 해결합니다:** 각 라운드는 `solve-<tag>/round-N.png` + `state.json`으로 덤프되며, 클릭할 타일을 나열한 `solve-<tag>/clicks.json`을 작성합니다 — 도구가 해당 타일을 클릭하고, 위젯을 다시 읽은 뒤 계속 진행합니다.

### 🖱️ 런처

`src/launcher.js`는 mint / verify / screen 및 9Router를 위한 대화형 메뉴입니다. 다른 저장소와 같은 배너/메뉴 형태이며 `src/cli.js` 작업으로 위임합니다. `node src/launcher.js --connect-9router`는 로컬 9Router에 키를 등록합니다.

## ✅ 작동 검증됨 — 모든 키가 테스트됩니다

키는 실시간 API가 해당 키로 응답한 뒤에만 `keys.txt`에 기록됩니다:

| 검사 | 호출 | 기대 결과 |
| --- | --- | --- |
| 인증 + 모델 목록 | `GET https://api.intelligence.io.solutions/api/v1/models` | `200` + 계정의 모델 id (39개) |
| 실제 완성 | `POST …/chat/completions` (`google/gemma-4-26b-a4b-it`) | `200` + 비어 있지 않은 어시스턴트 메시지 |

```bash
node src/cli.js verify --proxy socks5://127.0.0.1:1080    # re-runs both checks over every key and reports a per-key verdict
```

드라이버는 추가하는 모든 키에 대해 같은 검사를 수행합니다. `google/gemma-4-26b-a4b-it`는 추론 모델입니다 — 텍스트가 `reasoning_content`로 도착할 수 있습니다.

> ionet은 차단된 제공자 목록에 있습니다 — 검증 형태는 측정된 그대로이며, 제공자 측 티어링이 적용됩니다.

## 🧭 작동 방식

```
inbox (one address per account)                                  a fresh address per account
   │
   ├─▶ sign-up: IO Intelligence page → e-mail address → code / link from the inbox
   ├─▶ session: the account's cookies or access token in hand
   ├─▶ key mint: the account's key endpoint → plaintext key returned once (written to disk immediately)
   └─▶ live proof: POST https://api.intelligence.io.solutions/api/v1/chat/completions → real content = the key is live
```

계정마다 Chrome 하나(브라우저 단계) + HTTP 레그 하나:

1. **브라우저 단계** (`run-account.js --until start`): 탐색하고, 새 메일박스 주소를 입력하고, `clicks.json`에서 챌린지 라운드에 답하고, 제출합니다. `POST /api/workos/magic-auth/start`가 응답하는 순간, 계정의 받은편지함 + 토큰이 `handoff.json`에 기록되고 **Chrome이 즉시 닫힙니다** — 브라우저의 역할은 끝입니다.
2. **HTTP 레그** (`http-finish.js`): 메일박스에서 일회용 코드를 읽고, `magic-auth/verify` → `accessToken`을 호출하고, 키를 생성하고(`POST /v1/api-keys/`), 실시간으로 검증한 뒤, `keys.txt` + `accounts.json`에 추가합니다.
3. **드라이버** (`lane.js`): 시도에 대한 직렬 루프 — 새 풀 출구를 고르고, 사용 시점에 사전 점검하고, 브라우저 단계를 실행하고, 제출 전에 중단된 시도를 자동 복구하고, 토큰 수명 안에서 HTTP 레그를 실행하고, 실패한 출구를 블랙리스트에 올리고, 다시 고릅니다. `lane-<TAG>.jsonl`이 모든 시도를 기록합니다.

알아 둘 두 가지 설정: API 키는 `project: "io-intelligence"`로 생성해야 하며(도구가 대신 해 줍니다), 브라우저가 넘겨주는 액세스 토큰의 수명은 **5분**입니다 — 그래서 브라우저 단계가 페이지 안에서 끝내지 않고 HTTP로 넘깁니다.

## ⚙️ CLI 옵션

| 도구 | 플래그 |
| --- | --- |
| `cli.js` | `mint` · `finish` · `verify` · `screen` — 각 작업은 자체 플래그를 출력합니다 (`node src/lane.js --help`) |
| `lane.js` | `--tag` (L) · `--port` (9411) · `--target N` (5) · `--preset turbo\|balanced\|safe` (페이싱 간격) · `--gap S` · `--pick` (시도마다 새 풀 출구) 또는 `--proxy <line>` (고정 출구) · `--max-attempts N` · `--union-file` / `--new-file` |
| `run-account.js` | `--tag` · `--port` · `--until start\|email\|otp\|key` · `--proxy <line>` · `--broker <url>` · `--solve-dir` · `--solve-budget-ms` · `--round-wait-ms` · `--otp-timeout-ms` · `--email` / `--email-token` (받은편지함 재개) |
| `http-finish.js` | `--email` + `--box-token`, 또는 `--token <accessToken>` / `--token-file`, 또는 `--from-log <net.jsonl>` · `--name` · `--model` · `--otp-timeout-ms` |
| 9Router | `--connect-9router`(모든 작업에서) — 작업이 끝난 뒤 `keys.txt`의 모든 키를 실행 중인 9Router에 등록합니다 (`node src/connect-9router.js --help`) |

Turbo를 권장합니다(5). 더 많이 설정하면 성능이 약한 컴퓨터에서 부하/차단 위험이 있습니다.

## 🛰️ 프록시 뒤에서

* 출구는 텍스트 풀에서 가져옵니다(출구당 한 줄, `scheme://host:port`). 각 시도는 새 출구와 사용 시점 사전 점검을 받으며, 실패한 시도를 만든 출구는 레인별로 블랙리스트에 올라갑니다.
* 모든 제공자 호출 — 브라우저, 코드 읽기, 키 생성, 검증 — 은 풀을 통해 나갑니다. 사용자의 실제 주소에서 전송되는 것은 없습니다.
* reCAPTCHA 구현 스크립트는 로컬 캐시에서 페이지로 제공되므로, 브라우저 단계에서 출구는 `id.io.net`과 `www.google.com`에만 도달하면 됩니다.
* 메일박스 브로커는 루프백(`127.0.0.1`)에서 실행됩니다 — 제공자의 것이 아니라 사용자의 것이며, 메일 자격 증명을 보관하고 저장소에는 절대 보관하지 않습니다.

## 📄 파일

| 경로 | 내용 |
| --- | --- |
| `keys.txt` | 키, **한 줄에 하나**, 키가 실시간 검사를 통과하는 즉시 추가됨 — git에서 무시됨 |
| `accounts.json` | 계정당 하나의 레코드: 메일박스, 키, 키를 발급한 출구 — git에서 무시됨 |
| [`models.json`](models.json) | `GET /v1/models`가 발급된 키로 응답한 내용 (39개 id) |
| `out/` | 시도별 덤프(스크린샷 + DOM/네트워크 로그), 배치 로그, 출구 장부 — git에서 무시됨 |
| `proxies.txt` | 출구 풀, 한 줄에 프록시 하나 — git에서 무시됨 |

## 🔌 9Router에 연결

[9Router](https://9router.com)는 자체 호스팅되는 OpenAI 호환 라우터입니다. io.net은 OpenAI 호환 엔드포인트(`https://api.intelligence.io.solutions/api/v1`)를 제공하므로, 한 번 등록하면 발급한 모든 키가 하나의 제공자 노드 아래 연결이 됩니다 — 9Router가 이들 사이에서 로드 밸런싱합니다:

```bash
node src/connect-9router.js \
  --base http://localhost:20128 --password 123456 \
  --api-key io-v2-xxxxxxxx
```

`--api-key` 없이 실행하면 `keys.txt`의 **모든** 키를 등록합니다. 다시 실행해도 멱등적입니다: 노드는 `--prefix ionet`으로 매칭되고, 각 연결은 이름(`ionet-001`, `ionet-002`, …)으로 매칭되며, 이미 등록된 키는 그대로 둡니다. 기본값: `--base http://localhost:20128`, `--password 123456`, `--name "IO Intelligence"`, `--prefix ionet`, `--base-url https://api.intelligence.io.solutions/api/v1`, `--model google/gemma-4-26b-a4b-it`.

9Router에서 카탈로그는 다음과 같이 제공됩니다:

```
ionet/google/gemma-4-26b-a4b-it
ionet/deepseek-ai/DeepSeek-V4.1-Flash
ionet/zai-org/GLM-5.3-Flash
```

`node src/cli.js mint --target 5 --pick --connect-9router`는 한 번에 발급과 등록을 수행하며, `node src/launcher.js`는 메뉴에서 같은 흐름을 실행합니다.

## 🔑 키 하나로 얻는 것

| | |
| --- | --- |
| 🏢 제공자 | **IO Intelligence** — [io.net](https://io.net) |
| 🎁 제공자가 주는 것 | 39개 모델이 목록에 있음 — 무료 티어는 대부분의 id를 402로 제한; google/gemma-4-26b-a4b-it가 무료 티어 검증 모델 |
| 🔑 키 하나로 얻는 것 | 자체 계정에 범위가 지정된 API 키 하나: 아래 엔드포인트의 39개 모델 id를, 사용자의 플랜 한도 내에서. 할당량은 **계정**에 있으므로, 이 도구가 키당 계정 하나를 생성하는 것입니다 |
| 🌐 API 형태 | OpenAI 호환: `POST https://api.intelligence.io.solutions/api/v1/chat/completions` |
| 🔒 데이터 | io.net과 사용자가 구성한 받은편지함 백엔드에만 접속하며, 키는 사용자의 컴퓨터에 남습니다 |

## 🐞 이슈

실패한 단계, 태그/시도, 사용한 출구, 추적 로그 끝부분(`lane-<TAG>-trace.log`)을 포함해 이슈를 열어 주세요 — `out/` 아래의 스크린샷과 상태 덤프가 키를 노출하지 않고도 실패를 재현 가능하게 합니다. 실행한 명령과 정확한 출력을 포함해 **[이슈 열기](../../issues)**; PR을 환영합니다. 제공자의 티어 게이트가 여전히 `402 requires a higher IO Intelligence tier`로 라우팅한다면, 도구는 해당 모델에서 멈추고 그렇게 알립니다 — 게이트된 카탈로그는 측정된 그대로입니다.

## 📄 라이선스

MIT © 2026 — [LICENSE](LICENSE) 참조.

<div align="center">

**[MIT](LICENSE)** © 2026 ionet-bulk-apikey 기여자

</div>