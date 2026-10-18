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

**IO Intelligence (io.net) のアカウントを一括作成し、APIキーを自動生成 — OpenAI 互換の推論 + 9Router コネクタ対応。**

[![Node](https://img.shields.io/badge/Node-%E2%89%A518-3DA639?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![Dependencies](https://img.shields.io/badge/dependencies-0-blue?style=for-the-badge)](#)
[![License](https://img.shields.io/badge/license-MIT-6ea8fe?style=for-the-badge)](LICENSE)
[![Models](https://img.shields.io/badge/models-39%20served-412991?style=for-the-badge)](https://io.net)
[![9Router](https://img.shields.io/badge/9Router-connector-8B5CF6?style=for-the-badge)](#-connect-to-9router)
[![X](https://img.shields.io/badge/X-%40bigbullapp-000000?style=for-the-badge&logo=x&logoColor=white)](https://x.com/bigbullapp)

[🛠 クイックスタート](#-quick-start) · [🎁 無料枠](#-free-tier--how-much-you-get) · [🤖 モデル](#-models--all-39-of-them) · [🧪 APIの利用方法](#-how-to-use-the-api) · [✅ 動作確認済み](#-verified-working--every-key-is-tested) · [🧭 動作の仕組み](#-how-it-works) · [🔌 9Router接続](#-connect-to-9router) · [⚙️ オプション](#️-cli-options) · [🛰️ プロキシ経由](#️-behind-a-proxy) · [🐞 問題報告](#-issues)

</div>

<div align="center">

**English** · [Türkçe](README.tr.md) · [中文](README.cn.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Русский](README.ru.md) · [Português](README.pt.md)

</div>



---

## ✨ このツールの存在理由

io.net (IO Intelligence) はすべてのアカウントにAPIアクセスを提供しており、実用的な単位は「1アカウント＝1キー」です。登録はホストされた単一ページで行われ、メールアドレス、メールで送信されるワンタイムコード、そしてAPIキーのエンドポイントが必要です。このツールはその全プロセスを自動化します。ページが必要な場合は実際のブラウザを使用し、それ以外は通常のHTTPリクエストで処理し、実際の登録が完了した後のみキーを記録します。

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

> **ステータス通知 (2026-10-18):** 同日の早朝、サービスが停止していると判断されリポジトリは一度アーカイブされました。しかし夕方の再調査で、ディスク上のキー群が実際にチャット完了応答（`google/gemma-4-26b-a4b-it` → 200 `"pong"`）を返し、`id.io.net/login` が `200` を返すことが確認されました。リポジトリは再び **アクティブ** です。登録はプロバイダーによるレート制限があり、チャレンジは人間による操作が必要です。スケールはこれらの制限によって制御されます。

## 🎁 無料枠 — 何が利用可能か

**無料アカウントで実際に呼び出せるもの：** カタログはすべてのキーに「表示」されますが、生成はアカウントのティアごとに制限されています。24のIDで無料ティアのキーを測定した結果、1つのみが応答しました — **`google/gemma-4-26b-a4b-it`**（`200`、実際のアシスタントメッセージ；これは推論モデルのため、テキストは `reasoning_content` に含まれる可能性があります）。他のすべてのIDは `402 {"note":"Model '<id>' requires a higher IO Intelligence tier"}` を返しました。

| 項目 | 値 |
| --- | --- |
| キーごとのカタログ | `GET /v1/models` で **39のID**（[`models.json`](models.json) に記録） |
| 無料ティアの検証モデル | `google/gemma-4-26b-a4b-it` — **200** で実際のコンテンツを返す |
| 無料ティアでの他のID | アップグレードするまで `402 requires a higher IO Intelligence tier` |
| モデルごとのメタデータ | 各モデルは `min_access_tier` (1–3) と `higher_tier_required` を持つ |
| 登録方法 | `id.io.net/login`（メール → コード → `magic-auth/verify` → `accessToken` → `POST /v1/api-keys`） |
| スケールの単位 | **1アカウント = 1キー** → `--target N` はN個のアカウント/キー |

> 💡 無料ティアはIO Intelligenceが設定しており、変更される可能性があります。[io.net](https://io.net) で最新情報を確認してください。また、ツール自体の検証機能を利用することもできます。

```bash
node src/cli.js verify --proxy socks5://127.0.0.1:1080     # すべてのキーを1つの出口経由で再検証（モデル + チャット）
```

## 🤖 モデル — 全39種

`GET https://api.intelligence.io.solutions/api/v1/models` は有効なキーで **39のモデルID** を返します。例：

`deepseek-ai/DeepSeek-V4.1-Flash` · `deepseek-ai/DeepSeek-V4-Pro` · `zai-org/GLM-5.3` · `zai-org/GLM-5.3-Flash` · `XiaomiMiMo/MiMo-V2.6-Flash` · `moonshotai/Kimi-K3` · `MiniMaxAI/MiniMax-M2.7` · `Qwen/Qwen3.8-27B` · `openai/gpt-oss-120b` · `deepseek-ai/DeepSeek-R1-0528` · `google/gemma-4-26b-a4b-it`

無料ティアでの利用可能モデルの測定結果：

| モデル | ✓ |
| --- | --- |
| `google/gemma-4-26b-a4b-it` | ✓ |

全39のIDは [`models.json`](models.json) に記載されています。1つのキーで実施したライブテスト（検証ツールが行うのと同じ）：

```bash
curl https://api.intelligence.io.solutions/api/v1/chat/completions \
  -H "Authorization: Bearer io-v2-…" -H "Content-Type: application/json" \
  -d '{"model":"google/gemma-4-26b-a4b-it","messages":[{"role":"user","content":"hi"}]}'
```

## 🧪 APIの利用方法

ベースURLは **`https://api.intelligence.io.solutions/api/v1`** — OpenAI 互換です。

**任意のSDK / curl**

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

## 🛠 クイックスタート

```bash
git clone https://github.com/F0Rextasy/ionet-bulk-apikey.git
cd ionet-bulk-apikey

# 1) プロキシリスト（1行に1つの出口、http://, socks5://, socks4:// または host:port）
printf 'socks5://127.0.0.1:1080\n' > proxies.txt

# 2) 実行 — 1回の実行 = 1アカウント作成の試行（エンドツーエンド）
node src/cli.js mint --target 5 --pick    # ドライバー：出口 → ブラウザ → HTTP 完了、アカウントごと
node src/cli.js verify --proxy socks5://127.0.0.1:1080   # ディスク上のキーを再確認
node src/cli.js screen --limit 400        # 現在プロバイダーに到達可能な出口のみを保持
node src/launcher.js                      # または対話型メニュー

# 個別に実行したい場合のコマンド群:
node src/lane.js --tag L1 --port 9421 --target 8 --pick
node src/run-account.js --tag L1-1 --port 9421 --proxy socks5://127.0.0.1:1080 --until start
node src/http-finish.js --tag L1-1 --email <box@…> --box-token <id> --proxy socks5://127.0.0.1:1080
```

**チャレンジはユーザー側で解決：** 各ラウンドは `solve-<tag>/round-N.png` + `state.json` として保存され、`solve-<tag>/clicks.json` にクリックするタイルをリストとして記述します。ツールはそれを読み取り、クリックし、ウィジェットを再読み込みして処理を進めます。

### 🖱️ ランチャーツール

`src/launcher.js` は mint / verify / screen および 9Router を対話的に操作するメニューです。他のリポジトリと同じバナー/メニュー形式で、`src/cli.js` のタスクを委任します。`node src/launcher.js --connect-9router` でキーをローカルの9Routerに登録できます。

## ✅ 動作確認済み — すべてのキーは検証済み

キーは、ライブAPIが応答した後のみ `keys.txt` に書き込まれます。

| 検証項目 | 呼び出し | 期待される結果 |
| --- | --- | --- |
| 認証 + モデル一覧 | `GET https://api.intelligence.io.solutions/api/v1/models` | `200` + アカウントのモデルID（39） |
| 実際の生成 | `POST …/chat/completions` (`google/gemma-4-26b-a4b-it`) | `200` + 空でないアシスタントメッセージ |

```bash
node src/cli.js verify --proxy socks5://127.0.0.1:1080    # すべてのキーに対して両方のチェックを再実行し、キーごとの結果を報告
```

ドライバーは、追加するすべてのキーに対して同じチェックを行います。`google/gemma-4-26b-a4b-it` は推論モデルです — テキストは `reasoning_content` に含まれる場合があります。

> ionet はブロックされたプロバイダーのリストにあります — 検証の形状は測定値に基づきます。ティア制限はプロバイダー側で適用されます。

## 🧭 動作の仕組み

```
inbox (one address per account)                                  a fresh address per account
   │
   ├─▶ sign-up: IO Intelligence page → e-mail address → code / link from the inbox
   ├─▶ session: the account's cookies or access token in hand
   ├─▶ key mint: the account's key endpoint → plaintext key returned once (written to disk immediately)
   └─▶ live proof: POST https://api.intelligence.io.solutions/api/v1/chat/completions → real content = the key is live
```

アカウントごとに、1つのChrome（ブラウザフェーズ） + 1つのHTTPフェーズ：

1. **ブラウザフェーズ** (`run-account.js --until start`)：ナビゲート、新しいメールボックスアドレス入力、`clicks.json` でチャレンジを解決、送信。`POST /api/workos/magic-auth/start` が応答した瞬間、メールボックスとトークンが `handoff.json` に書き込まれ、**Chromeは直ちに終了** — ブラウザの役割はここで終了です。
2. **HTTPフェーズ** (`http-finish.js`)：メールボックスからワンタイムコードを読み取り、`magic-auth/verify` → `accessToken` を呼び出し、キーを作成 (`POST /v1/api-keys/`)、ライブ検証を行い、`keys.txt` + `accounts.json` に追加。
3. **ドライバー** (`lane.js`)：試行の直列ループ — 新しいプール出口を選択、使用時にプリフライト、ブラウザフェーズ実行、送信前に中断された試行を自動回復、アクセストークンの有効期間内にHTTPフェーズを実行、失敗した出口をブラックリスト化、再選択。`lane-<TAG>.jsonl` はすべての試行を記録します。

知っておくべき2つの設定：APIキーは `project: "io-intelligence"` で作成する必要があります（ツールが自動で処理します）。ブラウザが渡すアクセストークンの有効期限は **5分** — そのため、ブラウザ内での完了ではなく、HTTPフェーズに引き継がれるのです。

## ⚙️ CLIオプション

| ツール | フラグ |
| --- | --- |
| `cli.js` | `mint` · `finish` · `verify` · `screen` — 各タスクは独自のフラグを表示（`node src/lane.js --help`） |
| `lane.js` | `--tag` (L) · `--port` (9411) · `--target N` (5) · `--preset turbo\|balanced\|safe` (間隔) · `--gap S` · `--pick` (試行ごとに新しい出口) または `--proxy <line>` (固定出口) · `--max-attempts N` · `--union-file` / `--new-file` |
| `run-account.js` | `--tag` · `--port` · `--until start\|email\|otp\|key` · `--proxy <line>` · `--broker <url>` · `--solve-dir` · `--solve-budget-ms` · `--round-wait-ms` · `--otp-timeout-ms` · `--email` / `--email-token` (メールボックスの再開) |
| `http-finish.js` | `--email` + `--box-token`、または `--token <accessToken>` / `--token-file`、または `--from-log <net.jsonl>` · `--name` · `--model` · `--otp-timeout-ms` |
| 9Router | 任意のタスクに `--connect-9router` — 完了後、`keys.txt` のすべてのキーを実行中の9Routerに登録（`node src/connect-9router.js --help`） |

Turboが推奨（5）；それ以上は弱いPCで負荷/バンのリスクあり。

## 🛰️ プロキシ経由での利用

* 出口はテキストプールから取得（1行に1出口、`scheme://host:port`）；各試行で新しい出口が選ばれ、使用時にプリフライトが行われ、失敗した出口はレーンごとにブラックリスト化されます。
* ブラウザ、コード読み取り、キー作成、検証など、すべてのプロバイダー呼び出しはプールを経由します。自アドレスから送信されることはありません。
* reCAPTCHAの実装スクリプトはローカルキャッシュからページに提供されるため、ブラウザフェーズでは出口が `id.io.net` と `www.google.com` に到達できれば十分です。
* メールボックスブローカーはループバック (`127.0.0.1`) で動作 — これはプロバイダーのものではなく、ユーザー自身のものであり、メールの認証情報を保持します。リポジトリには保存されません。

## 📄 ファイル

| パス | 内容 |
| --- | --- |
| `keys.txt` | キー、**1行に1つ**、ライブチェック通過時に即座に追加 — git無視 |
| `accounts.json` | アカウントごとの記録：メールボックス、キー、作成に使用した出口 — git無視 |
| [`models.json`](models.json) | 作成されたキーで `GET /v1/models` を呼び出した結果（39のID） |
| `out/` | 試行ごとのダンプ（スクリーンショット + DOM/ネットワークログ）、バッチログ、出口の管理 — git無視 |
| `proxies.txt` | 出口プール、1行に1プロキシ — git無視 |

## 🔌 9Routerに接続

[9Router](https://9router.com) は自己ホスト型のOpenAI互換ルーターです。io.netはOpenAI互換エンドポイント（`https://api.intelligence.io.solutions/api/v1`）を提供しているため、一度登録すれば作成したすべてのキーが1つのプロバイダーノードとして登録され、9Routerがそれらの間でロードバランスします。

```bash
node src/connect-9router.js \
  --base http://localhost:20128 --password 123456 \
  --api-key io-v2-xxxxxxxx
```

`--api-key` を省略して実行すると、`keys.txt` の **すべてのキー** を登録します。再実行は冪等です：ノードは `--prefix ionet` で一致、各接続は名前（`ionet-001`, `ionet-002`, …）で一致、既に登録済みのキーは無視されます。デフォルト：`--base http://localhost:20128`, `--password 123456`, `--name "IO Intelligence"`, `--prefix ionet`, `--base-url https://api.intelligence.io.solutions/api/v1`, `--model google/gemma-4-26b-a4b-it`。

9Routerではカタログは以下のように提供されます：

```
ionet/google/gemma-4-26b-a4b-it
ionet/deepseek-ai/DeepSeek-V4.1-Flash
ionet/zai-org/GLM-5.3-Flash
```

`node src/cli.js mint --target 5 --pick --connect-9router` で作成と登録を1回で実行でき、`node src/launcher.js` でも同じフローをメニューから実行できます。

## 🔑 1つのキーで得られるもの

| | |
| --- | --- |
| 🏢 プロバイダー | **IO Intelligence** — [io.net](https://io.net) |
| 🎁 プロバイダーが提供するもの | 39のモデルがリスト — 無料ティアではほとんどのIDが402で制限；`google/gemma-4-26b-a4b-it` が無料ティアの検証モデル |
| 🔑 1つのキーで得られるもの | 自身のアカウントにスコープされた1つのAPIキー：以下のエンドポイントで39のモデルIDを利用可能、プランの制限内。クォータは **アカウント** に紐づくため、このツールは1キーごとに1アカウントを作成します。 |
| 🌐 APIの形式 | OpenAI互換：`POST https://api.intelligence.io.solutions/api/v1/chat/completions` |
| 🔒 データの取り扱い | io.net と設定したメールバックエンドのみが通信；キーはユーザーのマシン上に留まります |

## 🐞 問題報告

失敗したステップ、タグ/試行、使用した出口、トレースの末尾（`lane-<TAG>-trace.log`）を含めて問題を報告してください。`out/` 内のスクリーンショットと状態ダンプにより、キーを漏らさずに再現可能になります。**[問題を報告](../../issues)** する際は実行したコマンドと正確な出力を添えてください。PRも歓迎します。プロバイダーのティア制限が `402 requires a higher IO Intelligence tier` を返す場合、ツールはそのモデルで停止し、その旨を表示します — 制限付きカタログは測定値の通りです。

## 📄 ライセンス

MIT © 2026 — [LICENSE](LICENSE) を参照。

<div align="center">

**[MIT](LICENSE)** © 2026 ionet-bulk-apikey 貢献者

</div>