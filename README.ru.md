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

**Массовое создание аккаунтов IO Intelligence (io.net) с автоматически сгенерированными API-ключами — OpenAI-совместимый инференс + коннектор 9Router.**

[![Node](https://img.shields.io/badge/Node-%E2%89%A518-3DA639?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![Dependencies](https://img.shields.io/badge/dependencies-0-blue?style=for-the-badge)](#)
[![License](https://img.shields.io/badge/license-MIT-6ea8fe?style=for-the-badge)](LICENSE)
[![Models](https://img.shields.io/badge/models-39%20served-412991?style=for-the-badge)](https://io.net)
[![9Router](https://img.shields.io/badge/9Router-connector-8B5CF6?style=for-the-badge)](#-connect-to-9router)
[![X](https://img.shields.io/badge/X-%40bigbullapp-000000?style=for-the-badge&logo=x&logoColor=white)](https://x.com/bigbullapp)

[🛠 Быстрый старт](#-quick-start) · [🎁 Бесплатный тариф](#-free-tier--how-much-you-get) · [🤖 Модели](#-models--all-39-of-them) · [🧪 Использование API](#-how-to-use-the-api) · [✅ Проверено](#-verified-working--every-key-is-tested) · [🧭 Как это работает](#-how-it-works) · [🔌 9Router](#-connect-to-9router) · [⚙️ Опции](#️-cli-options) · [🛰️ Прокси](#️-behind-a-proxy) · [🐞 Проблемы](#-issues)

</div>

<div align="center">

**English** · [Türkçe](README.tr.md) · [中文](README.cn.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Русский](README.ru.md) · [Português](README.pt.md)

</div>


---

## ✨ Зачем это нужно

io.net (IO Intelligence) даёт каждому аккаунту доступ к API, и полезная единица — *один аккаунт на ключ*. Регистрация — это одна размещённая страница: адрес электронной почты, одноразовый код по почте и эндпоинт для API-ключа. Этот инструмент проходит весь путь — настоящий браузер там, где страница его требует, обычный HTTP для всего остального — и записывает ключ только после реального завершения:

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

> **Примечание о статусе (2026-10-18):** репозиторий был заархивирован ранее в тот же день, когда считалось, что путь мёртв; вечерний повторный аудит подтвердил его работоспособность — живой прогон пула на диске получил реальные ответы чат-комплишенов (`google/gemma-4-26b-a4b-it` → 200 `"pong"`), а путь `id.io.net/login` ответил `200`. Репозиторий снова **активен**. Регистрации ограничены по частоте провайдером, а челленджи требуют участия человека; масштаб ограничен этими барьерами.

## 🎁 Бесплатный тариф — сколько вы получаете

**Что бесплатный аккаунт реально может вызвать:** каталог *показывается* каждому ключу, но генерация ограничена для каждой модели уровнем аккаунта. При измерении ключом бесплатного тарифа по 24 из этих id ответил на комплишен ровно один — **`google/gemma-4-26b-a4b-it`** (`200`, реальное сообщение ассистента; это reasoning-модель, поэтому текст может прийти в `reasoning_content`). Все остальные id ответили `402 {"note":"Model '<id>' requires a higher IO Intelligence tier"}`.

| Что | Значение |
| --- | --- |
| Каталог на ключ | **39 id** в `GET /v1/models` (зафиксировано в [`models.json`](models.json)) |
| Верификатор бесплатного тарифа | `google/gemma-4-26b-a4b-it` — **200** с реальным содержимым |
| Другие id на бесплатном тарифе | `402 requires a higher IO Intelligence tier` до апгрейда |
| Метаданные по модели | каждая модель несёт `min_access_tier` (1–3) и `higher_tier_required` |
| Регистрация | `id.io.net/login` (e-mail → код → `magic-auth/verify` → `accessToken` → `POST /v1/api-keys`) |
| Единица масштабирования | **один аккаунт = один ключ** → `--target N` это N аккаунтов/ключей |

> 💡 Бесплатный тариф устанавливается IO Intelligence и может меняться. Проверяйте актуальные цифры на [io.net](https://io.net) — и пусть решает собственный гейт инструмента:

```bash
node src/cli.js verify --proxy socks5://127.0.0.1:1080     # every key is re-tested (models + chat) through one exit
```

## 🤖 Модели — все 39

`GET https://api.intelligence.io.solutions/api/v1/models` отвечает **39 id моделей** для любого валидного ключа, включая:

`deepseek-ai/DeepSeek-V4.1-Flash` · `deepseek-ai/DeepSeek-V4-Pro` · `zai-org/GLM-5.3` · `zai-org/GLM-5.3-Flash` · `XiaomiMiMo/MiMo-V2.6-Flash` · `moonshotai/Kimi-K3` · `MiniMaxAI/MiniMax-M2.7` · `Qwen/Qwen3.8-27B` · `openai/gpt-oss-120b` · `deepseek-ai/DeepSeek-R1-0528` · `google/gemma-4-26b-a4b-it`

Измеренное покрытие бесплатного тарифа:

|Модель|✓|
|---|---|
|`google/gemma-4-26b-a4b-it`|✓|

Полные 39 id находятся в [`models.json`](models.json). Живая проверка одного ключа (именно это делает верификатор):

```bash
curl https://api.intelligence.io.solutions/api/v1/chat/completions \
  -H "Authorization: Bearer io-v2-…" -H "Content-Type: application/json" \
  -d '{"model":"google/gemma-4-26b-a4b-it","messages":[{"role":"user","content":"hi"}]}'
```

## 🧪 Как использовать API

Базовый URL — **`https://api.intelligence.io.solutions/api/v1`** — OpenAI-совместимый.

**Любой SDK / curl**

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

## 🛠 Быстрый старт

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

**Челлендж решается с вашей стороны:** каждый раунд сохраняется как `solve-<tag>/round-N.png` + `state.json`, а вы пишете `solve-<tag>/clicks.json` со списком плиток для клика — инструмент кликает по ним, перечитывает виджет и продолжает.

### 🖱️ Лаунчер

`src/launcher.js` — это интерактивное меню поверх mint / verify / screen и 9Router. Оно имеет ту же форму баннера/меню, что и другие репозитории, и делегирует задачи в `src/cli.js`. `node src/launcher.js --connect-9router` регистрирует ключи в локальном 9Router.

## ✅ Проверено в работе — каждый ключ тестируется

Ключ записывается в `keys.txt` только после того, как живой API ответит с ним:

| проверка | вызов | ожидается |
| --- | --- | --- |
| auth + список моделей | `GET https://api.intelligence.io.solutions/api/v1/models` | `200` + id моделей аккаунта (39) |
| реальный комплишен | `POST …/chat/completions` (`google/gemma-4-26b-a4b-it`) | `200` + непустое сообщение ассистента |

```bash
node src/cli.js verify --proxy socks5://127.0.0.1:1080    # re-runs both checks over every key and reports a per-key verdict
```

Драйвер выполняет ту же проверку для каждого ключа, который добавляет. `google/gemma-4-26b-a4b-it` — это reasoning-модель — текст может прийти в `reasoning_content`.

> ionet находится в списке заблокированных провайдеров — форма верификации соответствует измеренной; на стороне провайдера применяется тарификация.

## 🧭 Как это работает

```
inbox (one address per account)                                  a fresh address per account
   │
   ├─▶ sign-up: IO Intelligence page → e-mail address → code / link from the inbox
   ├─▶ session: the account's cookies or access token in hand
   ├─▶ key mint: the account's key endpoint → plaintext key returned once (written to disk immediately)
   └─▶ live proof: POST https://api.intelligence.io.solutions/api/v1/chat/completions → real content = the key is live
```

На каждый аккаунт — один Chrome (браузерная фаза) + один HTTP-этап:

1. **Браузерная фаза** (`run-account.js --until start`): переход, ввод свежего адреса почтового ящика, ответы на раунды челленджа из вашего `clicks.json`, отправка. В момент, когда `POST /api/workos/magic-auth/start` отвечает, почтовый ящик аккаунта + токен записываются в `handoff.json`, и **Chrome немедленно закрывается** — работа браузера завершена.
2. **HTTP-этап** (`http-finish.js`): чтение одноразового кода из почтового ящика, вызов `magic-auth/verify` → `accessToken`, создание ключа (`POST /v1/api-keys/`), живая проверка, добавление в `keys.txt` + `accounts.json`.
3. **Драйвер** (`lane.js`): последовательный цикл по попыткам — выбирает свежий выход из пула, выполняет предварительную проверку в момент использования, запускает браузерную фазу, автоматически восстанавливает попытки, прерванные до отправки, выполняет HTTP-этап в пределах времени жизни токена, заносит в чёрный список выходы, которые дали сбой, и выбирает заново. `lane-<TAG>.jsonl` фиксирует каждую попытку.

Два параметра, которые стоит знать: API-ключ должен быть создан с `project: "io-intelligence"` (инструмент делает это за вас), а access-токен, который передаёт браузер, живёт **5 минут** — именно поэтому браузерная фаза передаёт управление HTTP, а не завершает всё на странице.

## ⚙️ Опции CLI

| инструмент | флаги |
| --- | --- |
| `cli.js` | `mint` · `finish` · `verify` · `screen` — каждая задача выводит свои флаги (`node src/lane.js --help`) |
| `lane.js` | `--tag` (L) · `--port` (9411) · `--target N` (5) · `--preset turbo\|balanced\|safe` (интервал темпа) · `--gap S` · `--pick` (свежий выход из пула на попытку) или `--proxy <line>` (фиксированный выход) · `--max-attempts N` · `--union-file` / `--new-file` |
| `run-account.js` | `--tag` · `--port` · `--until start\|email\|otp\|key` · `--proxy <line>` · `--broker <url>` · `--solve-dir` · `--solve-budget-ms` · `--round-wait-ms` · `--otp-timeout-ms` · `--email` / `--email-token` (возобновить почтовый ящик) |
| `http-finish.js` | `--email` + `--box-token`, или `--token <accessToken>` / `--token-file`, или `--from-log <net.jsonl>` · `--name` · `--model` · `--otp-timeout-ms` |
| 9Router | `--connect-9router` для любой задачи — после её завершения регистрирует каждый ключ из `keys.txt` в работающем 9Router (`node src/connect-9router.js --help`) |

Рекомендуется turbo (5); больше — риск нагрузки/бана на слабом компьютере.

## 🛰️ За прокси

* Выходы берутся из текстового пула (одна строка на выход, `scheme://host:port`); каждая попытка получает свежий выход и предварительную проверку в момент использования, а выходы, приведшие к неудачной попытке, заносятся в чёрный список для каждой линии.
* Каждый вызов провайдера — браузер, чтение кода, создание ключа, проверка — идёт через пул; ничего не отправляется с вашего собственного адреса.
* Скрипт реализации reCAPTCHA отдаётся странице из локального кэша, поэтому выходу нужно лишь достичь `id.io.net` и `www.google.com` для браузерной фазы.
* Брокер почтовых ящиков работает на loopback (`127.0.0.1`) — он ваш, а не провайдера, и хранит ваши учётные данные почты, но никогда — репозиторий.

## 📄 Файлы

| Путь | Содержимое |
| --- | --- |
| `keys.txt` | ключи, **по одному в строке**, добавляются в момент прохождения ключом живой проверки — игнорируется git |
| `accounts.json` | одна запись на аккаунт: почтовый ящик, ключ, выход, который его создал — игнорируется git |
| [`models.json`](models.json) | `GET /v1/models` в том виде, как ответил созданный ключ (39 id) |
| `out/` | дампы по попыткам (скриншоты + логи DOM/сети), журнал пакета, учёт выходов — игнорируется git |
| `proxies.txt` | ваш пул выходов, по одному прокси в строке — игнорируется git |

## 🔌 Подключение к 9Router

[9Router](https://9router.com) — это самостоятельно размещаемый OpenAI-совместимый роутер. io.net предоставляет OpenAI-совместимый эндпоинт (`https://api.intelligence.io.solutions/api/v1`), поэтому зарегистрируйте его один раз, и каждый созданный вами ключ станет соединением под одним узлом-провайдером — 9Router балансирует нагрузку между ними:

```bash
node src/connect-9router.js \
  --base http://localhost:20128 --password 123456 \
  --api-key io-v2-xxxxxxxx
```

Запустите без `--api-key`, чтобы зарегистрировать **каждый** ключ из `keys.txt`. Повторный запуск идемпотентен: узел сопоставляется по `--prefix ionet`, каждое соединение сопоставляется по имени (`ionet-001`, `ionet-002`, …), а уже зарегистрированный ключ остаётся нетронутым. Значения по умолчанию: `--base http://localhost:20128`, `--password 123456`, `--name "IO Intelligence"`, `--prefix ionet`, `--base-url https://api.intelligence.io.solutions/api/v1`, `--model google/gemma-4-26b-a4b-it`.

В 9Router каталог отдаётся как:

```
ionet/google/gemma-4-26b-a4b-it
ionet/deepseek-ai/DeepSeek-V4.1-Flash
ionet/zai-org/GLM-5.3-Flash
```

`node src/cli.js mint --target 5 --pick --connect-9router` создаёт и регистрирует за один проход, а `node src/launcher.js` проводит тот же поток из своего меню.

## 🔑 Что даёт один ключ

| | |
| --- | --- |
| 🏢 Провайдер | **IO Intelligence** — [io.net](https://io.net) |
| 🎁 Что даёт провайдер | 39 моделей в списке — бесплатный тариф ограничивает большинство id до 402; google/gemma-4-26b-a4b-it — верификатор бесплатного тарифа |
| 🔑 Что даёт один ключ | один API-ключ, привязанный к своему аккаунту: 39 id моделей на эндпоинте ниже, в пределах лимитов вашего плана. Квота живёт на **аккаунте**, именно поэтому этот инструмент создаёт один аккаунт на ключ |
| 🌐 Форма API | OpenAI-совместимый: `POST https://api.intelligence.io.solutions/api/v1/chat/completions` |
| 🔒 Ваши данные | контакт только с io.net и настроенным вами бэкендом почтовых ящиков; ключи остаются на вашей машине |

## 🐞 Проблемы

Откройте issue с указанием сбойного шага, тега/попытки, использованного выхода и хвоста трассировки (`lane-<TAG>-trace.log`) — скриншоты и дампы состояния в `out/` делают сбои воспроизводимыми без утечки ключа. **[Открыть issue](../../issues)** с командой, которую вы запускали, и точным выводом; PR приветствуются. Если тарифный гейт провайдера всё ещё возвращает `402 requires a higher IO Intelligence tier`, инструмент останавливается на этой модели и сообщает об этом — ограниченный каталог соответствует измеренному.

## 📄 Лицензия

MIT © 2026 — см. [LICENSE](LICENSE).

<div align="center">

**[MIT](LICENSE)** © 2026 ionet-bulk-apikey contributors

</div>