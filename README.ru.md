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

**Массовое создание аккаунтов IO Intelligence (io.net) с автоматически генерируемыми API‑ключами — совместимый с OpenAI вывод + коннектор 9Router.**

[![Node](https://img.shields.io/badge/Node-%E2%89%A518-3DA639?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![Dependencies](https://img.shields.io/badge/dependencies-0-blue?style=for-the-badge)](#)
[![License](https://img.shields.io/badge/license-MIT-6ea8fe?style=for-the-badge)](LICENSE)
[![Models](https://img.shields.io/badge/models-39%20served-412991?style=for-the-badge)](https://io.net)
[![9Router](https://img.shields.io/badge/9Router-connector-8B5CF6?style=for-the-badge)](#-connect-to-9router)
[![X](https://img.shields.io/badge/X-%40bigbullapp-000000?style=for-the-badge&logo=x&logoColor=white)](https://x.com/bigbullapp)

[🛠 Быстрый старт](#-quick-start) · [🎁 Бесплатный уровень](#-free-tier--how-much-you-get) · [🤖 Модели](#-models--all-39-of-them) · [🧪 Как использовать API](#-how-to-use-the-api) · [✅ Проверено — каждый ключ протестирован](#-verified-working--every-key-is-tested) · [🧭 Как это работает](#-how-it-works) · [🔌 Подключить к 9router](#-connect-to-9router) · [⚙️ Опции CLI](#️-cli-options) · [🛰️ Через прокси](#️-behind-a-proxy) · [🐞 Проблемы](#-issues)

</div>

<div align="center">

**English** · [Türkçe](README.tr.md) · [中文](README.cn.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Русский](README.ru.md) · [Português](README.pt.md)

</div>

---

## ✨ Зачем это нужно

io.net (IO Intelligence) предоставляет каждому аккаунту доступ к API, а полезной единицей является *один аккаунт — один ключ*. Регистрация происходит на единственной хост‑странице: адрес электронной почты, одноразовый код по почте и конечная точка API‑ключа. Этот инструмент проходит весь путь — реальный браузер, где страница требует его, обычный HTTP для всего остального — и записывает ключ только после реального завершения:

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

> **Примечание о статусе (2026-10-18):** репозиторий был архивирован ранее в тот же день, пока считалось, что проект мёртв; вечерний повторный аудит подтвердил его — живой обход пула на диске дал реальные чат‑завершения (`google/gemma-4-26b-a4b-it` → 200 `"pong"`) и запрос `id.io.net/login` вернул `200`. Репозиторий **активен** снова. Регистрации ограничены провайдером, а вызовы защищены человеческим капчей; масштаб ограничен этими шлюзами.

## 🎁 Бесплатный уровень — что вы получаете

**Что бесплатный аккаунт может действительно вызвать:** каталог *перечислен* для каждого ключа, но генерация ограничена моделью в зависимости от уровня аккаунта. При измерении бесплатным ключом по 24 из этих id ровно один вернул завершение — **`google/gemma-4-26b-a4b-it`** (`200`, реальное сообщение помощника; это модель рассуждения, поэтому текст может появиться в `reasoning_content`). Все остальные id вернули `402 {"note":"Model '<id>' requires a higher IO Intelligence tier"}`.

| Что | Значение |
| --- | --- |
| Каталог на ключ | **39 идентификаторов** на `GET /v1/models` (записано в [`models.json`](models.json)) |
| Проверка бесплатного уровня | `google/gemma-4-26b-a4b-it` — **200** с реальным содержимым |
| Другие идентификаторы в бесплатном уровне | `402 requires a higher IO Intelligence tier` пока не обновлено |
| Метаданные модели | каждая модель содержит `min_access_tier` (1–3) и `higher_tier_required` |
| Регистрация | `id.io.net/login` (e‑mail → код → `magic-auth/verify` → `accessToken` → `POST /v1/api-keys`) |
| Единица масштабирования | **один аккаунт = один ключ** → `--target N` — N аккаунтов/ключей |

> 💡 Бесплатный уровень задаётся IO Intelligence и может измениться. Проверяйте актуальные цифры на [io.net](https://io.net) — и позвольте собственному шлюзу инструмента решить:

```bash
node src/cli.js verify --proxy socks5://127.0.0.1:1080     # каждый ключ повторно проверяется (модели + чат) через один выход
```

## 🤖 Модели — все 39 из них

`GET https://api.intelligence.io.solutions/api/v1/models` возвращает **39 идентификаторов моделей** для любого действующего ключа, включая:

`deepseek-ai/DeepSeek-V4.1-Flash` · `deepseek-ai/DeepSeek-V4-Pro` · `zai-org/GLM-5.3` · `zai-org/GLM-5.3-Flash` · `XiaomiMiMo/MiMo-V2.6-Flash` · `moonshotai/Kimi-K3` · `MiniMaxAI/MiniMax-M2.7` · `Qwen/Qwen3.8-27B` · `openai/gpt-oss-120b` · `deepseek-ai/DeepSeek-R1-0528` · `google/gemma-4-26b-a4b-it`

Измеренное покрытие бесплатного уровня:

|Модель|✓|
|---|---|
|`google/gemma-4-26b-a4b-it`|✓|
|`nvidia/nemotron-3.5-lightning`|✓|

Проверка 2026-10-19 (5 ключей × 4 выхода): `nvidia/nemotron-3.5-lightning` ответил `200` во всех 20 запросах; остальные 39‑идентификаторов возвращают `402 requires a higher IO Intelligence tier`.

Полный список из 39 id находится в [`models.json`](models.json). Живой запрос одного ключа (именно то, что делает проверяющий):

```bash
curl https://api.intelligence.io.solutions/api/v1/chat/completions \
  -H "Authorization: Bearer io-v2-…" -H "Content-Type: application/json" \
  -d '{"model":"google/gemma-4-26b-a4b-it","messages":[{"role":"user","content":"hi"}]}'
```

## 🧪 Как использовать API

Базовый URL — **`https://api.intelligence.io.solutions/api/v1`** — совместим с OpenAI.

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

# 1) ваш список прокси, один выход на строку (http://, socks5://, socks4:// или просто host:port)
printf 'socks5://127.0.0.1:1080\n' > proxies.txt

# 2) запуск — один запуск = одна попытка аккаунта, от начала до конца
node src/cli.js mint --target 5 --pick    # драйвер: выход → браузер → HTTP‑завершение, на каждый аккаунт
node src/cli.js verify --proxy socks5://127.0.0.1:1080   # повторно проверяет уже сохранённые ключи
node src/cli.js screen --limit 400        # оставляет только те выходы, которые сейчас работают с провайдером
node src/launcher.js                      # или интерактивное меню

# отдельные части, если нужны по отдельности:
node src/lane.js --tag L1 --port 9421 --target 8 --pick
node src/run-account.js --tag L1-1 --port 9421 --proxy socks5://127.0.0.1:1080 --until start
node src/http-finish.js --tag L1-1 --email <box@…> --box-token <id> --proxy socks5://127.0.0.1:1080
```

**Вызов капчи решается с вашей стороны:** каждый раунд сохраняется как `solve-<tag>/round-N.png` + `state.json`, а вы пишете `solve-<tag>/clicks.json` со списком плиток для клика — инструмент кликает их, перечитывает виджет и переходит дальше.

### 🖱️ Лаунчер

`src/launcher.js` — интерактивное меню над `mint` / `verify` / `screen` и 9Router. Оно имеет тот же баннер/меню, что и другие репозитории, и делегирует задачи `src/cli.js`. `node src/launcher.js --connect-9router` регистрирует ключи в локальном 9Router.

## ✅ Проверено — каждый ключ протестирован

Ключ записывается в `keys.txt` только после того, как живой API подтвердит его работоспособность:

| проверка | вызов | ожидается |
| --- | --- | --- |
| auth + список моделей | `GET https://api.intelligence.io.solutions/api/v1/models` | `200` + идентификаторы моделей аккаунта (39) |
| реальное завершение | `POST …/chat/completions` (`google/gemma-4-26b-a4b-it`) | `200` + непустое сообщение помощника |

```bash
node src/cli.js verify --proxy socks5://127.0.0.1:1080    # повторно запускает обе проверки для каждого ключа и выводит вердикт per‑key
```

Драйвер делает те же проверки для каждого добавляемого ключа. `google/gemma-4-26b-a4b-it` — модель рассуждения, поэтому текст может появиться в `reasoning_content`.

> ionet находится в списке заблокированных провайдеров — форма проверки измерена; уровневое ограничение применяется со стороны провайдера.

## 🧭 Как это работает

```
inbox (one address per account)                                  a fresh address per account
   │
   ├─▶ sign-up: IO Intelligence page → e-mail address → code / link from the inbox
   ├─▶ session: the account's cookies or access token in hand
   ├─▶ key mint: the account's key endpoint → plaintext key returned once (written to disk immediately)
   └─▶ live proof: POST https://api.intelligence.io.solutions/api/v1/chat/completions → real content = the key is live
```

Для каждого аккаунта — один Chrome (фаза браузера) + один HTTP‑этап:

1. **Фаза браузера** (`run-account.js --until start`): переход, ввод нового адреса почтового ящика, решение раундов капчи из вашего `clicks.json`, отправка. Как только `POST /api/workos/magic-auth/start` отвечает, в `handoff.json` записываются ящик и токен, и **Chrome сразу закрывается** — работа браузера завершена.
2. **HTTP‑этап** (`http-finish.js`): чтение одноразового кода из ящика, вызов `magic-auth/verify` → `accessToken`, создание ключа (`POST /v1/api-keys/`), живой верификатор, добавление в `keys.txt` + `accounts.json`.
3. **Драйвер** (`lane.js`): последовательный цикл попыток — выбирает свежий выход из пула, делает предзапрос в момент использования, запускает фазу браузера, автоматически восстанавливает прерванные попытки до отправки, выполняет HTTP‑этап в течение жизни токена, в чёрный список помещает неудачные выходы и перевыбирает. `lane-<TAG>.jsonl` фиксирует каждую попытку.

Две важные детали: API‑ключ должен создаваться с `project: "io-intelligence"` (инструмент делает это автоматически), а токен, переданный браузером, живёт **5 минут** — поэтому фаза браузера передаёт управление HTTP, а не завершается на странице.

## ⚙️ Опции CLI

| инструмент | флаги |
| --- | --- |
| `cli.js` | `mint` · `finish` · `verify` · `screen` — каждая задача выводит свои флаги (`node src/lane.js --help`) |
| `lane.js` | `--tag` (L) · `--port` (9411) · `--target N` (5) · `--preset turbo\|balanced\|safe` (интервал паузы) · `--gap S` · `--pick` (свежий выход из пула на каждую попытку) или `--proxy <line>` (фиксированный выход) · `--max-attempts N` · `--union-file` / `--new-file` |
| `run-account.js` | `--tag` · `--port` · `--until start\|email\|otp\|key` · `--proxy <line>` · `--broker <url>` · `--solve-dir` · `--solve-budget-ms` · `--round-wait-ms` · `--otp-timeout-ms` · `--email` / `--email-token` (возобновить работу с ящиком) |
| `http-finish.js` | `--email` + `--box-token`, или `--token <accessToken>` / `--token-file`, или `--from-log <net.jsonl>` · `--name` · `--model` · `--otp-timeout-ms` |
| 9Router | `--connect-9router` на любой задаче — после её завершения регистрирует каждый ключ из `keys.txt` в работающем 9Router (`node src/connect-9router.js --help`) |

Турбо рекомендуется (5); большее значение может привести к нагрузке/бану на слабом компьютере.

## 🛰️ Через прокси

* Выходы берутся из текстового пула (по одной строке на выход, `scheme://host:port`); каждая попытка получает свежий выход и предзапрос в момент использования, а неудачные выходы заносятся в чёрный список внутри lane.
* Каждый вызов провайдера — браузер, чтение кода, создание ключа, верификация — проходит через пул; ваш собственный IP не используется.
* Скрипт реализации reCAPTCHA отдается странице из локального кэша, поэтому выходу нужно достучаться лишь до `id.io.net` и `www.google.com` для фазы браузера.
* Брокер почтового ящика работает на loopback (`127.0.0.1`) — это ваш сервис, а не провайдера, и хранит только ваши учётные данные почты, никогда репозиторий.

## 📄 Файлы

| Путь | Содержимое |
| --- | --- |
| `keys.txt` | ключи, **по одному на строку**, добавляются в момент прохождения живой проверки — игнорируется Git |
| `accounts.json` | запись на каждый аккаунт: почтовый ящик, ключ, выход, который его создал — игнорируется Git |
| [`models.json`](models.json) | ответ `GET /v1/models` от созданного ключа (39 id) |
| `out/` | дампы каждой попытки (скриншоты + логи DOM/сети), пакетный лог, учёт выходов — игнорируется Git |
| `proxies.txt` | ваш пул выходов, один прокси на строку — игнорируется Git |

## 🔌 Подключить к 9Router

[9Router](https://9router.com) — самостоятельно хостируемый роутер, совместимый с OpenAI. io.net предоставляет совместимую точку (`https://api.intelligence.io.solutions/api/v1`), поэтому зарегистрируйте её один раз, и каждый созданный ключ станет соединением под одним провайдер‑узлом — 9Router будет балансировать нагрузку между ними:

```bash
node src/connect-9router.js \
  --base http://localhost:20128 --password 123456 \
  --api-key io-v2-xxxxxxxx
```

Запустите без `--api-key`, чтобы зарегистрировать **каждый** ключ из `keys.txt`. Повторный запуск идемпотентен: узел сопоставляется по `--prefix ionet`, каждое соединение — по имени (`ionet-001`, `ionet-002`, …), а уже зарегистрированный ключ оставляется без изменений. По умолчанию: `--base http://localhost:20128`, `--password 123456`, `--name "IO Intelligence"`, `--prefix ionet`, `--base-url https://api.intelligence.io.solutions/api/v1`, `--model google/gemma-4-26b-a4b-it`.

В 9Router каталог подаётся как:

```
ionet/google/gemma-4-26b-a4b-it
ionet/deepseek-ai/DeepSeek-V4.1-Flash
ionet/zai-org/GLM-5.3-Flash
```

`node src/cli.js mint --target 5 --pick --connect-9router` создаёт и регистрирует ключи за один проход, а `node src/launcher.js` управляет тем же процессом через меню.

## 🔑 Что дает один ключ

|  |  |
| --- | --- |
| 🏢 Провайдер | **IO Intelligence** — [io.net](https://io.net) |
| 🎁 Что предоставляет провайдер | 39 моделей в списке — большинство id в бесплатном уровне возвращают 402; проверка бесплатного уровня — `google/gemma-4-26b-a4b-it` |
| 🔑 Что дает один ключ | один API‑ключ, привязанный к собственному аккаунту: 39 моделей на конечной точке ниже, в рамках лимитов вашего плана. Квота живёт на **аккаунте**, поэтому инструмент создаёт один аккаунт на каждый ключ |
| 🌐 Форма API | Совместима с OpenAI: `POST https://api.intelligence.io.solutions/api/v1/chat/completions` |
| 🔒 Ваши данные | только io.net и ваш бекенд почтового ящика получают запросы; ключи остаются на вашей машине |

## 🐞 Проблемы

Откройте issue с описанием шага, где произошёл сбой, тегом/попыткой, использованным выходом и хвостом трассировки (`lane-<TAG>-trace.log`) — скриншоты и дампы состояния в `out/` делают воспроизведение ошибки возможным без утечки ключа. **[Откройте issue](../../issues)** с командой, которую вы запускали, и точным выводом; PR‑ы приветствуются. Если провайдер всё ещё отвечает `402 requires a higher IO Intelligence tier`, инструмент останавливается на этой модели и сообщает об этом — каталог ограничен, как измерено.

## 📄 Лицензия

MIT © 2026 — см. [LICENSE](LICENSE).

<div align="center">

**[MIT](LICENSE)** © 2026 ionet-bulk-apikey contributors

</div>