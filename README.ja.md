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

**IO Intelligence (io.net) アカウントを自動生成された API キー付きで一括作成 — OpenAI 互換の推論 + 9Router コネクタ。**

[![Node](https://img.shields.io/badge/Node-%E2%89%A518-3DA639?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![Dependencies](https://img.shields.io/badge/dependencies-0-blue?style=for-the-badge)](#)
[![License](https://img.shields.io/badge/license-MIT-6ea8fe?style=for-the-badge)](LICENSE)
[![Models](https://img.shields.io/badge/models-39%20served-412991?style=for-the-badge)](https://io.net)
[![9Router](https://img.shields.io/badge/9Router-connector-8B5CF6?style=for-the-badge)](#-connect-to-9router)
[![OmniRoute](https://img.shields.io/badge/OmniRoute-connector-8B5CF6?style=for-the-badge)](#-connect-to-omniroute)
[![X](https://img.shields.io/badge/X-%40bigbullapp-000000?style=for-the-badge&logo=x&logoColor=white)](https://x.com/bigbullapp)

[🛠 クイックスタート](#-quick-start) · [🎁 無料枠](#-free-tier--how-much-you-get) · [🤖 モデル](#-models--all-39-of-them) · [🧪 API の使い方](#-how-to-use-the-api) · [✅ 検証済み](#-verified-working--every-key-is-tested) · [🧭 仕組み](#-how-it-works) · [🔌 9Router](#-connect-to-9router) · [🔌 OmniRoute](#-connect-to-omniroute) · [⚙️ オプション](#️-cli-options) · [🛰️ プロキシ](#️-behind-a-proxy) · [🐞 問題報告](#-issues)

</div>

<div align="center">

**English** · [Türkçe](README.tr.md) · [中文](README.cn.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Русский](README.ru.md) · [Português](README.pt.md)

</div>

---

## ✨ なぜこれが存在するのか

io.net (IO Intelligence) はすべてのアカウントに API アクセスを提供しており、有用な単位は *1 アカウントにつき 1 キー* です。サインアップは単一のホストされたページです：メールアドレス、メールによるワンタイムコード、そして API キーのエンドポイント。このツールはその全経路をたどります — ページがブラウザを必要とする箇所では実際のブラウザを、それ以外はプレーン HTTP を使い — そして実際の補完が成功した後にのみキーを記録します：

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

> **ステータス注記 (2026-10-18):** 同日の早い時間にレールが死んだと思われたためリポジトリはアーカイブされましたが、夜の再監査で再検証されました — ディスク上のプールのライブスイープが実際のチャット補完に応答し（`google/gemma-4-26b-a4b-it` → 200 `"pong"`）、レール `id.io.net/login` が `200` を返しました。リポジトリは再び **アクティブ** です。登録はプロバイダーによってレート制限され、チャレンジは人間によるゲートがあります。規模はそれらのゲートによって制限されます。

## 🎁 無料枠 — どれだけ得られるか

**無料アカウントが実際に呼び出せるもの:** カタログはすべてのキーに *リスト表示* されますが、生成はアカウントのティアによってモデルごとにゲートされます。無料枠のキーでそれら 24 の id にわたって測定したところ、補完に応答したのはちょうど 1 つだけでした — **`google/gemma-4-26b-a4b-it`**（`200`、実際のアシスタントメッセージ。これは推論モデルなので、テキストは `reasoning_content` で届く場合があります）。他のすべての id は `402 {"note":"Model '<id>' requires a higher IO Intelligence tier"}` を返しました。

| 項目 | 値 |
| --- | --- |
| キーごとのカタログ | `GET /v1/models` で **39 個の id**（[`models.json`](models.json) にキャプチャ） |
| 無料枠の検証用 | `google/gemma-4-26b-a4b-it` — 実際のコンテンツ付きで **200** |
| 無料枠での他の id | アップグレードするまで `402 requires a higher IO Intelligence tier` |
| モデルごとのメタデータ | 各モデルは `min_access_tier`（1〜3）と `higher_tier_required` を持つ |
| サインアップ | `id.io.net/login`（メール → コード → `magic-auth/verify` → `accessToken` → `POST /v1/api-keys`） |
| スケールする単位 | **1 アカウント = 1 キー** → `--target N` は N 個のアカウント/キー |

> 💡 無料枠は IO Intelligence によって設定され、変更される可能性があります。最新の数値は [io.net](https://io.net) で確認してください — そしてツール自身のゲートに判断させてください：

```bash
node src/cli.js verify --proxy socks5://127.0.0.1:1080     # every key is re-tested (models + chat) through one exit
```

## 🤖 モデル — その 39 個すべて

`GET https://api.intelligence.io.solutions/api/v1/models` は任意の有効なキーに対して **39 個のモデル id** を返します。含まれるもの：

`deepseek-ai/DeepSeek-V4.1-Flash` · `deepseek-ai/DeepSeek-V4-Pro` · `zai-org/GLM-5.3` · `zai-org/GLM-5.3-Flash` · `XiaomiMiMo/MiMo-V2.6-Flash` · `moonshotai/Kimi-K3` · `MiniMaxAI/MiniMax-M2.7` · `Qwen/Qwen3.8-27B` · `openai/gpt-oss-120b` · `deepseek-ai/DeepSeek-R1-0528` · `google/gemma-4-26b-a4b-it`

測定された無料枠のカバレッジ：

|モデル|✓|
|---|---|
|`google/gemma-4-26b-a4b-it`|✓|
|`nvidia/nemotron-3.5-lightning`|✓|

2026-10-19 のライブ再チェック（5 キー × 4 出口）：`nvidia/nemotron-3.5-lightning` は 20/20 のプローブで `200` を返しました。39 個の id のカタログの残りは `402 requires a higher IO Intelligence tier` を返します。

39 個の id の完全なリストは [`models.json`](models.json) にあります。1 つのキーのライブプローブ（検証ツールが行うこととまったく同じ）：

```bash
curl https://api.intelligence.io.solutions/api/v1/chat/completions \
  -H "Authorization: Bearer io-v2-…" -H "Content-Type: application/json" \
  -d '{"model":"google/gemma-4-26b-a4b-it","messages":[{"role":"user","content":"hi"}]}'
```

## 🧪 API の使い方

ベース URL は **`https://api.intelligence.io.solutions/api/v1`** — OpenAI 互換です。

**任意の SDK / curl**

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

## ⚡ コマンド 1 つ

```bash
node src/cli.js --count N      # mint N keys — exit screen, browser, HTTP finish, one account at a time
node src/cli.js --dry          # print the resolved plan: writes nothing, sends nothing
```

`--auto` がデフォルトです：ミント経路はトークン、キャプチャの解答、プロキシの質問をあなたに求めません。CLI の隣にある `proxies.txt` は自動的に使用され（なければツールは直接接続します）、インタラクティブメニュー（`node src/launcher.js`）は同じタスクをラップします。

> ⚠️ **利用規約とアカウントのリスク。** プロバイダーの自動化はその利用規約に違反し、アカウントや IP が禁止される可能性があります。あなたは自分が所有するアカウントに対して、自分のマシンから、自己責任でこれを実行します。ツールはサイト自身のサインアップページを操作するだけで、有料ゲートを回避することは決してありません。大規模なキャンペーンの前にプロバイダーの利用規約をお読みください。

## 🛠 クイックスタート

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

**チャレンジはあなたの側で解答されます：** 各ラウンドは `solve-<tag>/round-N.png` + `state.json` としてダンプされ、あなたはクリックするタイルを列挙した `solve-<tag>/clicks.json` を書きます — ツールはそれらをクリックし、ウィジェットを再読み込みして次に進みます。

### 🖱️ ランチャー

`src/launcher.js` は mint / verify / screen と 9Router の上にあるインタラクティブメニューです。他のリポジトリと同じバナー/メニューの形で、`src/cli.js` のタスクに委譲します。`node src/launcher.js --connect-9router` はローカルの 9Router にキーを登録します。

## ✅ 動作検証済み — すべてのキーがテストされています

> **品質ゲート。** ここにあるすべてのキーは `keys.txt` に書き込まれる前にライブの `chat-200` を通過しています
> （死んだキーは決して出荷されません）。ルーターのコンボもモデルレベルで同じルールに従います：エントリは
> **モデルが `chat-200` に応答し、ツールを呼び出せる場合にのみ** 追加されます — ツールサポートのないモデル、
> 死んだキー、死んだプロバイダーは追加される代わりに除外されます。**9Router と OmniRoute** で動作します。

キーは、ライブ API がそれで応答した後にのみ `keys.txt` に書き込まれます：

| チェック | 呼び出し | 期待値 |
| --- | --- | --- |
| 認証 + モデルリスト | `GET https://api.intelligence.io.solutions/api/v1/models` | `200` + アカウントのモデル id（39） |
| 実際の補完 | `POST …/chat/completions`（`google/gemma-4-26b-a4b-it`） | `200` + 空でないアシスタントメッセージ |

```bash
node src/cli.js verify --proxy socks5://127.0.0.1:1080    # re-runs both checks over every key and reports a per-key verdict
```

ドライバーは追加するすべてのキーに対して同じチェックを行います。`google/gemma-4-26b-a4b-it` は推論モデルです — テキストは `reasoning_content` で届く場合があります。

> ionet はブロックされたプロバイダーのリストにあります — 検証の形は測定されたとおりです。プロバイダー側のティアリングが適用されます。

## 🧭 仕組み

```
inbox (one address per account)                                  a fresh address per account
   │
   ├─▶ sign-up: IO Intelligence page → e-mail address → code / link from the inbox
   ├─▶ session: the account's cookies or access token in hand
   ├─▶ key mint: the account's key endpoint → plaintext key returned once (written to disk immediately)
   └─▶ live proof: POST https://api.intelligence.io.solutions/api/v1/chat/completions → real content = the key is live
```

アカウントごとに、1 つの Chrome（ブラウザフェーズ）+ 1 つの HTTP レッグ：

1. **ブラウザフェーズ**（`run-account.js --until start`）：ナビゲートし、新しいメールボックスアドレスを入力し、あなたの `clicks.json` からチャレンジラウンドに解答し、送信します。`POST /api/workos/magic-auth/start` が応答した瞬間に、アカウントの受信箱 + トークンが `handoff.json` に書き込まれ、**Chrome は即座に閉じます** — ブラウザの仕事は終わりです。
2. **HTTP レッグ**（`http-finish.js`）：メールボックスからワンタイムコードを読み取り、`magic-auth/verify` → `accessToken` を呼び出し、キーを作成し（`POST /v1/api-keys/`）、ライブで検証し、`keys.txt` + `accounts.json` に追加します。
3. **ドライバー**（`lane.js`）：試行に対する直列ループ — 新しいプール出口を選び、使用の瞬間にプリフライトし、ブラウザフェーズを実行し、送信前に中断された試行を自動回復し、トークンの有効期間内に HTTP レッグを実行し、失敗した出口をブラックリストに登録し、再選択します。`lane-<TAG>.jsonl` はすべての試行を記録します。

知っておく価値のある 2 つのノブ：API キーは `project: "io-intelligence"` で作成する必要があり（ツールがこれをあなたのために行います）、ブラウザが引き渡すアクセストークンは **5 分間** 有効です — これがまさに、ブラウザフェーズがページ内で完了するのではなく HTTP に引き渡す理由です。

## ⚙️ CLI オプション

| ツール | フラグ |
| --- | --- |
| `cli.js` | `mint` · `finish` · `verify` · `screen` — 各タスクは独自のフラグを表示します（`node src/lane.js --help`） |
| `lane.js` | `--tag`（L） · `--port`（9411） · `--target N`（5） · `--preset turbo\|balanced\|safe`（ペーシング間隔） · `--gap S` · `--pick`（試行ごとに新しいプール出口）または `--proxy <line>`（固定出口） · `--direct`（プロキシをまったく使わない） · `--max-attempts N` · `--union-file` / `--new-file` |
| `run-account.js` | `--tag` · `--port` · `--until start\|email\|otp\|key` · `--proxy <line>` · `--broker <url>` · `--solve-dir` · `--solve-budget-ms` · `--round-wait-ms` · `--otp-timeout-ms` · `--email` / `--email-token`（受信箱を再開） |
| `http-finish.js` | `--email` + `--box-token`、または `--token <accessToken>` / `--token-file`、または `--from-log <net.jsonl>` · `--name` · `--model` · `--otp-timeout-ms` |
| 9Router | 任意のタスクで `--connect-9router` — 完了後、`keys.txt` のすべてのキーを実行中の 9Router に登録します（`node src/connect-9router.js --help`） |

Turbo önerilir (5); daha fazlası zayıf bilgisayarda yük/ban riski.

## 🛰️ プロキシの背後で

**オプション — 大規模では推奨（IP ごとの制限、禁止）。** ツールはプロキシなしでも動作します。

- **プールあり：** 出口はテキストプールから来ます（1 行につき 1 出口、`scheme://host:port`）。各試行は新しい出口と使用時プリフライトを取得し、失敗した試行を生んだ出口はレーンごとにブラックリストに登録されます。
- **プールなし：** 選ぶものが何もない — レーンは自動的に DIRECT モードに切り替わります（または `--direct` で強制します）。Chrome コンテキストはトンネルなしで開き、すべてのリクエスト — ブラウザ、コード読み取り、キー作成、検証 — がこのマシンから直接出ていきます。
- reCAPTCHA 実装スクリプトはローカルキャッシュからページに提供されるため、出口はブラウザフェーズのために `id.io.net` と `www.google.com` に到達するだけで済みます。
- メールボックスブローカーはループバック（`127.0.0.1`）で動作します — それはプロバイダーのものではなくあなたのものであり、あなたのメール認証情報を保持し、リポジトリは決して保持しません。

## 📄 ファイル

| パス | 内容 |
| --- | --- |
| `keys.txt` | キー、**1 行に 1 つ**、キーがライブチェックを通過した瞬間に追加 — git 無視 |
| `accounts.json` | アカウントごとに 1 レコード：メールボックス、キー、それをミントした出口 — git 無視 |
| [`models.json`](models.json) | ミントされたキーが返す `GET /v1/models`（39 個の id） |
| `out/` | 試行ごとのダンプ（スクリーンショット + DOM/ネットワークログ）、バッチログ、出口の記帳 — git 無視 |
| `proxies.txt` | あなたの出口プール、1 行に 1 プロキシ（オプション） — git 無視 |

## 🔌 9Router に接続する

[9Router](https://9router.com) はセルフホスト型の OpenAI 互換ルーターです。io.net は OpenAI 互換エンドポイント（`https://api.intelligence.io.solutions/api/v1`）を提供するので、一度登録すれば、あなたがミントしたすべてのキーが 1 つのプロバイダーノードの下の接続になります — 9Router はそれらをロードバランスします：

```bash
node src/connect-9router.js \
  --base http://localhost:20128 --password 123456 \
  --api-key io-v2-xxxxxxxx
```

`--api-key` なしで実行すると、`keys.txt` の **すべての** キーを登録します。再実行は冪等です：ノードは `--prefix ionet` で照合され、各接続は名前（`ionet-001`、`ionet-002`、…）で照合され、すでに登録されているキーはそのままにされます。デフォルト：`--base http://localhost:20128`、`--password 123456`、`--name "IO Intelligence"`、`--prefix ionet`、`--base-url https://api.intelligence.io.solutions/api/v1`、`--model google/gemma-4-26b-a4b-it`。

9Router ではカタログは次のように提供されます：

```
ionet/google/gemma-4-26b-a4b-it
ionet/deepseek-ai/DeepSeek-V4.1-Flash
ionet/zai-org/GLM-5.3-Flash
```

`node src/cli.js mint --target 5 --pick --connect-9router` は 1 回のパスでミントと登録を行い、`node src/launcher.js` はそのメニューから同じフローを駆動します。

## 🔌 OmniRoute に接続する

[OmniRoute](https://omniroute.online) はセルフホスト型の OpenAI 互換ルーターです。io.net は OpenAI 互換エンドポイント（`https://api.intelligence.io.solutions/api/v1`）を提供するので、一度登録すれば、あなたがミントしたすべてのキーが 1 つのプロバイダーノードの下の接続になります — OmniRoute はそれらをロードバランスします：

```bash
node src/connect-omniroute.js \
  --base http://localhost:20128 --password 123456 \
  --api-key io-v2-xxxxxxxx
```

`--api-key` なしで実行すると、`keys.txt` の **すべての** キーを登録します。再実行は冪等です：ノードは `--prefix ionet` で照合され、各接続は名前（`ionet-001`、`ionet-002`、…）で照合され、すでに登録されているキーはそのままにされます。デフォルト：`--base http://localhost:20128`、`--password 123456`、`--name "IO Intelligence"`、`--prefix ionet`、`--base-url https://api.intelligence.io.solutions/api/v1`、`--model google/gemma-4-26b-a4b-it`。

OmniRoute ではカタログは次のように提供されます：

```
ionet/google/gemma-4-26b-a4b-it
ionet/deepseek-ai/DeepSeek-V4.1-Flash
ionet/zai-org/GLM-5.3-Flash
```

`node src/cli.js mint --target 5 --pick --connect-omniroute` は 1 回のパスでミントと登録を行い、`node src/launcher.js` はそのメニューから同じフローを駆動します。
## 🔑 1 つのキーで得られるもの

| | |
| --- | --- |
| 🏢 プロバイダー | **IO Intelligence** — [io.net](https://io.net) |
| 🎁 プロバイダーが提供するもの | 39 個のモデルがリスト表示 — 無料枠はほとんどの id を 402 にゲートします。google/gemma-4-26b-a4b-it が無料枠の検証用です |
| 🔑 1 つのキーで得られるもの | 自身のアカウントにスコープされた 1 つの API キー：下のエンドポイントで 39 個のモデル id を、あなたのプランの制限で。クォータは **アカウント** に存在し、これがまさにこのツールがキーごとに 1 アカウントを作成する理由です |
| 🌐 API の形 | OpenAI 互換：`POST https://api.intelligence.io.solutions/api/v1/chat/completions` |
| 🔒 あなたのデータ | 接触するのは io.net とあなたが設定した受信箱バックエンドのみです。キーはあなたのマシンに留まります |

## 🐞 問題報告

失敗したステップ、タグ/試行、使用した出口、トレースの末尾（`lane-<TAG>-trace.log`）を添えて issue を開いてください — `out/` の下のスクリーンショットと状態ダンプは、キーを漏らすことなく失敗を再現可能にします。実行したコマンドと正確な出力を添えて **[issue を開いてください](../../issues)**。PR は歓迎します。プロバイダーのティアゲートが依然として `402 requires a higher IO Intelligence tier` にルーティングする場合、ツールはそのモデルで停止し、そう告げます — ゲートされたカタログは測定されたとおりです。

## 📄 ライセンス

MIT © 2026 — [LICENSE](LICENSE) を参照。

<div align="center">

**[MIT](LICENSE)** © 2026 ionet-bulk-apikey contributors

</div>