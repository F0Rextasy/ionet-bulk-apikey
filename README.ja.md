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

**IO Intelligence (io.net) のアカウントを、API キー自動生成付きで一括作成 — OpenAI 互換の推論 + 9Router コネクタ。**

[![Node](https://img.shields.io/badge/Node-%E2%89%A518-3DA639?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![Dependencies](https://img.shields.io/badge/dependencies-0-blue?style=for-the-badge)](#)
[![License](https://img.shields.io/badge/license-MIT-6ea8fe?style=for-the-badge)](LICENSE)
[![Models](https://img.shields.io/badge/models-39%20served-412991?style=for-the-badge)](https://io.net)
[![9Router](https://img.shields.io/badge/9Router-connector-8B5CF6?style=for-the-badge)](#-connect-to-9router)
[![X](https://img.shields.io/badge/X-%40bigbullapp-000000?style=for-the-badge&logo=x&logoColor=white)](https://x.com/bigbullapp)

[🛠 クイックスタート](#-quick-start) · [🎁 無料枠](#-free-tier--how-much-you-get) · [🤖 モデル](#-models--all-39-of-them) · [🧪 API の使い方](#-how-to-use-the-api) · [✅ 動作確認済み](#-verified-working--every-key-is-tested) · [🧭 仕組み](#-how-it-works) · [🔌 9Router](#-connect-to-9router) · [⚙️ オプション](#️-cli-options) · [🛰️ プロキシ](#️-behind-a-proxy) · [🐞 問題報告](#-issues)

</div>

<div align="center">

**English** · [Türkçe](README.tr.md) · [中文](README.cn.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Русский](README.ru.md) · [Português](README.pt.md)

</div>

---

## ✨ なぜこれが存在するのか

io.net（IO Intelligence）はすべてのアカウントに API アクセスを付与しており、有用な単位は *キー 1 つにつきアカウント 1 つ* です。サインアップは単一のホストされたページで完結します。メールアドレス、メールで届くワンタイムコード、そして API キーのエンドポイントです。このツールはその道筋をすべて辿ります — ページが要求する場面では実際のブラウザを、それ以外は素の HTTP を使います — そして実際の補完が返ってきたときにだけキーを記録します:

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

> **状態に関する注記（2026-10-18）:** 同日の午前中、経路が死んだと判断されてリポジトリはアーカイブされましたが、夜の再監査で再検証されました — ディスク上のプールを使ったライブスイープが実際のチャット補完に応答し（`google/gemma-4-26b-a4b-it` → 200 `"pong"`）、経路 `id.io.net/login` も `200` を返しました。リポジトリは再び **アクティブ** です。登録はプロバイダ側でレート制限されており、チャレンジは人手によるゲートがあります。規模はそれらのゲートによって上限が決まります。

## 🎁 無料枠 — どこまで使えるか

**無料アカウントで実際に呼べるもの:** カタログはすべてのキーに *一覧として公開* されますが、生成はアカウントのティアによってモデルごとにゲートされます。無料枠のキーでそのうち 24 個の id を試したところ、補完に応答したのはちょうど 1 つでした — **`google/gemma-4-26b-a4b-it`**（`200`、実際のアシスタントメッセージ。推論モデルのため、テキストが `reasoning_content` で届く場合があります）。それ以外のすべての id は `402 {"note":"Model '<id>' requires a higher IO Intelligence tier"}` を返しました。

| 項目 | 値 |
| --- | --- |
| キーごとのカタログ | `GET /v1/models` で **39 個の id**（[`models.json`](models.json) に取得済み） |
| 無料枠の検証用モデル | `google/gemma-4-26b-a4b-it` — 実際の内容付きで **200** |
| 無料枠でのその他の id | アップグレードするまで `402 requires a higher IO Intelligence tier` |
| モデルごとのメタデータ | 各モデルは `min_access_tier`（1〜3）と `higher_tier_required` を持ちます |
| サインアップ | `id.io.net/login`（メール → コード → `magic-auth/verify` → `accessToken` → `POST /v1/api-keys`） |
| スケールする単位 | **1 アカウント = 1 キー** → `--target N` は N 個のアカウント/キー |

> 💡 無料枠は IO Intelligence 側が設定するもので、変更される可能性があります。最新の数値は [io.net](https://io.net) で確認してください — そして最終判断はツール自身のゲートに任せてください:

```bash
node src/cli.js verify --proxy socks5://127.0.0.1:1080     # every key is re-tested (models + chat) through one exit
```

## 🤖 モデル — 全 39 個

`GET https://api.intelligence.io.solutions/api/v1/models` は、有効なキーに対して **39 個のモデル id** を返します。以下を含みます:

`deepseek-ai/DeepSeek-V4.1-Flash` · `deepseek-ai/DeepSeek-V4-Pro` · `zai-org/GLM-5.3` · `zai-org/GLM-5.3-Flash` · `XiaomiMiMo/MiMo-V2.6-Flash` · `moonshotai/Kimi-K3` · `MiniMaxAI/MiniMax-M2.7` · `Qwen/Qwen3.8-27B` · `openai/gpt-oss-120b` · `deepseek-ai/DeepSeek-R1-0528` · `google/gemma-4-26b-a4b-it`

実測した無料枠のカバレッジ:

|モデル|✓|
|---|---|
|`google/gemma-4-26b-a4b-it`|✓|
|`nvidia/nemotron-3.5-lightning`|✓|

2026-10-19 のライブ再チェック（5 キー × 4 出口）: `nvidia/nemotron-3.5-lightning` は 20/20 のプローブで `200` を返しました。39 個の id からなるカタログの残りは `402 requires a higher IO Intelligence tier` を返します。

39 個の id の全体は [`models.json`](models.json) にあります。1 つのキーでのライブプローブ（検証ツールが実行している内容そのもの）:

```bash
curl https://api.intelligence.io.solutions/api/v1/chat/completions \
  -H "Authorization: Bearer io-v2-…" -H "Content-Type: application/json" \
  -d '{"model":"google/gemma-4-26b-a4b-it","messages":[{"role":"user","content":"hi"}]}'
```

## 🧪 API の使い方

ベース URL は **`https://api.intelligence.io.solutions/api/v1`** です — OpenAI 互換です。

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

## 🛠 クイックスタート

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

**チャレンジはあなたの側で回答します:** 各ラウンドは `solve-<tag>/round-N.png` + `state.json` としてダンプされるので、クリックするタイルを列挙した `solve-<tag>/clicks.json` を書きます — ツールがそれらをクリックし、ウィジェットを再読み取りして先へ進みます。

### 🖱️ ランチャー

`src/launcher.js` は mint / verify / screen と 9Router を操作する対話式メニューです。他のリポジトリと同じバナー/メニューの形で、`src/cli.js` のタスクに処理を委譲します。`node src/launcher.js --connect-9router` はローカルの 9Router にキーを登録します。

## ✅ 動作確認済み — すべてのキーをテスト

キーが `keys.txt` に書き込まれるのは、そのキーでライブ API が応答した後だけです:

| チェック | 呼び出し | 期待結果 |
| --- | --- | --- |
| 認証 + モデル一覧 | `GET https://api.intelligence.io.solutions/api/v1/models` | `200` + そのアカウントのモデル id（39 個） |
| 実際の補完 | `POST …/chat/completions`（`google/gemma-4-26b-a4b-it`） | `200` + 空でないアシスタントメッセージ |

```bash
node src/cli.js verify --proxy socks5://127.0.0.1:1080    # re-runs both checks over every key and reports a per-key verdict
```

ドライバは追記するすべてのキーに対して同じチェックを行います。`google/gemma-4-26b-a4b-it` は推論モデルです — テキストが `reasoning_content` で届く場合があります。

> ionet はブロック対象プロバイダのリストに含まれています — 検証の形は実測どおりで、プロバイダ側のティアリングが適用されます。

## 🧭 仕組み

```
inbox (one address per account)                                  a fresh address per account
   │
   ├─▶ sign-up: IO Intelligence page → e-mail address → code / link from the inbox
   ├─▶ session: the account's cookies or access token in hand
   ├─▶ key mint: the account's key endpoint → plaintext key returned once (written to disk immediately)
   └─▶ live proof: POST https://api.intelligence.io.solutions/api/v1/chat/completions → real content = the key is live
```

アカウントごとに、1 つの Chrome（ブラウザフェーズ）+ 1 つの HTTP レッグ:

1. **ブラウザフェーズ**（`run-account.js --until start`）: ナビゲートし、新しいメールボックスアドレスを入力し、あなたの `clicks.json` に従ってチャレンジのラウンドに回答し、送信します。`POST /api/workos/magic-auth/start` が応答した瞬間に、そのアカウントの受信箱とトークンが `handoff.json` に書き込まれ、**Chrome は即座に閉じられます** — ブラウザの役目はそこで終わりです。
2. **HTTP レッグ**（`http-finish.js`）: メールボックスからワンタイムコードを読み取り、`magic-auth/verify` → `accessToken` を呼び、キーを作成し（`POST /v1/api-keys/`）、ライブで検証し、`keys.txt` + `accounts.json` に追記します。
3. **ドライバ**（`lane.js`）: 試行を直列にループします — プールから新しい出口を選び、使用の瞬間にプリフライトし、ブラウザフェーズを実行し、送信前に中断された試行を自動復旧し、トークンの有効期間内に HTTP レッグを実行し、失敗した出口をブラックリストに入れて再選択します。`lane-<TAG>.jsonl` がすべての試行を記録します。

知っておくべき調整点が 2 つあります。API キーは `project: "io-intelligence"` を指定して作成する必要があり（ツールが代行します）、ブラウザが引き渡すアクセストークンの寿命は **5 分** です — だからこそブラウザフェーズはページ内で完了せず、HTTP に引き渡すのです。

## ⚙️ CLI オプション

| ツール | フラグ |
| --- | --- |
| `cli.js` | `mint` · `finish` · `verify` · `screen` — 各タスクが自身のフラグを表示します（`node src/lane.js --help`） |
| `lane.js` | `--tag`（L） · `--port`（9411） · `--target N`（5） · `--preset turbo\|balanced\|safe`（ペーシング間隔） · `--gap S` · `--pick`（試行ごとにプールから新しい出口）または `--proxy <line>`（固定出口） · `--max-attempts N` · `--union-file` / `--new-file` |
| `run-account.js` | `--tag` · `--port` · `--until start\|email\|otp\|key` · `--proxy <line>` · `--broker <url>` · `--solve-dir` · `--solve-budget-ms` · `--round-wait-ms` · `--otp-timeout-ms` · `--email` / `--email-token`（受信箱を再開） |
| `http-finish.js` | `--email` + `--box-token`、または `--token <accessToken>` / `--token-file`、または `--from-log <net.jsonl>` · `--name` · `--model` · `--otp-timeout-ms` |
| 9Router | 任意のタスクで `--connect-9router` — タスク完了後、`keys.txt` のすべてのキーを稼働中の 9Router に登録します（`node src/connect-9router.js --help`） |

Turbo を推奨します（5）。それ以上は非力なマシンでは負荷や BAN のリスクがあります。

## 🛰️ プロキシ経由の場合

* 出口はテキストのプールから取得します（1 行につき 1 出口、`scheme://host:port`）。試行ごとに新しい出口を選び、使用時にプリフライトし、失敗した試行を生んだ出口はレーンごとにブラックリストに入れます。
* プロバイダへのすべての呼び出し — ブラウザ、コードの読み取り、キーの作成、検証 — はプールを経由します。あなた自身のアドレスから送信されるものはありません。
* reCAPTCHA の実装スクリプトはローカルキャッシュからページに配信されるため、ブラウザフェーズでは出口が `id.io.net` と `www.google.com` に到達できれば十分です。
* メールボックスブローカーはループバック（`127.0.0.1`）で動作します — これはプロバイダのものではなくあなたのもので、あなたのメール認証情報を保持します。リポジトリが保持することはありません。

## 📄 ファイル

| パス | 内容 |
| --- | --- |
| `keys.txt` | キーを **1 行に 1 つ**。キーがライブチェックを通過した瞬間に追記されます — git 管理外 |
| `accounts.json` | アカウントごとに 1 レコード: メールボックス、キー、それを発行した出口 — git 管理外 |
| [`models.json`](models.json) | 発行済みキーが返した `GET /v1/models` の応答（39 個の id） |
| `out/` | 試行ごとのダンプ（スクリーンショット + DOM/ネットワークログ）、バッチログ、出口の管理情報 — git 管理外 |
| `proxies.txt` | 出口プール。1 行に 1 プロキシ — git 管理外 |

## 🔌 9Router への接続

[9Router](https://9router.com) はセルフホスト型の OpenAI 互換ルーターです。io.net は OpenAI 互換エンドポイント（`https://api.intelligence.io.solutions/api/v1`）を提供しているので、一度登録すれば、発行したすべてのキーが 1 つのプロバイダノード配下の接続となり、9Router がそれらをロードバランスします:

```bash
node src/connect-9router.js \
  --base http://localhost:20128 --password 123456 \
  --api-key io-v2-xxxxxxxx
```

`--api-key` を付けずに実行すると、`keys.txt` の **すべて** のキーを登録します。再実行しても冪等です。ノードは `--prefix ionet` で照合され、各接続は名前（`ionet-001`、`ionet-002`、…）で照合され、登録済みのキーはそのまま残されます。デフォルト: `--base http://localhost:20128`、`--password 123456`、`--name "IO Intelligence"`、`--prefix ionet`、`--base-url https://api.intelligence.io.solutions/api/v1`、`--model google/gemma-4-26b-a4b-it`。

9Router ではカタログは次のように提供されます:

```
ionet/google/gemma-4-26b-a4b-it
ionet/deepseek-ai/DeepSeek-V4.1-Flash
ionet/zai-org/GLM-5.3-Flash
```

`node src/cli.js mint --target 5 --pick --connect-9router` は 1 回の実行で発行と登録を行い、`node src/launcher.js` はそのメニューから同じ流れを操作します。

## 🔑 1 つのキーで得られるもの

| | |
| --- | --- |
| 🏢 プロバイダ | **IO Intelligence** — [io.net](https://io.net) |
| 🎁 プロバイダが提供するもの | 39 モデルが一覧表示される — 無料枠ではほとんどの id が 402 でゲートされる。google/gemma-4-26b-a4b-it が無料枠の検証用モデル |
| 🔑 1 つのキーで得られるもの | 自身のアカウントに紐づく API キー 1 つ: 下記エンドポイントで 39 個のモデル id を、あなたのプランの上限まで。クォータは **アカウント** に紐づくため、このツールがキーごとに 1 アカウントを作成するのはまさにそのためです |
| 🌐 API の形 | OpenAI 互換: `POST https://api.intelligence.io.solutions/api/v1/chat/completions` |
| 🔒 あなたのデータ | 通信先は io.net と、あなたが設定した受信箱バックエンドのみ。キーはあなたのマシン上に留まります |

## 🐞 問題報告

失敗したステップ、タグ/試行、使用した出口、トレースの末尾（`lane-<TAG>-trace.log`）を添えて issue を作成してください — `out/` 配下のスクリーンショットと状態ダンプがあれば、キーを漏らさずに失敗を再現できます。実行したコマンドと正確な出力を添えて **[issue を作成](../../issues)** してください。PR も歓迎します。プロバイダのティアゲートが依然として `402 requires a higher IO Intelligence tier` を返す場合、ツールはそのモデルで停止し、その旨を報告します — ゲートされたカタログは実測どおりです。

## 📄 ライセンス

MIT © 2026 — [LICENSE](LICENSE) を参照してください。

<div align="center">

**[MIT](LICENSE)** © 2026 ionet-bulk-apikey contributors

</div>