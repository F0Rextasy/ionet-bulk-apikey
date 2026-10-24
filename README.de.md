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

**Massenhaft IO Intelligence (io.net)-Konten mit automatisch generierten API-Schlüsseln erstellen — OpenAI-kompatible Inferenz + 9Router-Connector.**

[![Node](https://img.shields.io/badge/Node-%E2%89%A518-3DA639?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![Dependencies](https://img.shields.io/badge/dependencies-0-blue?style=for-the-badge)](#)
[![License](https://img.shields.io/badge/license-MIT-6ea8fe?style=for-the-badge)](LICENSE)
[![Models](https://img.shields.io/badge/models-39%20served-412991?style=for-the-badge)](https://io.net)
[![9Router](https://img.shields.io/badge/9Router-connector-8B5CF6?style=for-the-badge)](#-connect-to-9router)
[![OmniRoute](https://img.shields.io/badge/OmniRoute-connector-8B5CF6?style=for-the-badge)](#-connect-to-omniroute)
[![X](https://img.shields.io/badge/X-%40bigbullapp-000000?style=for-the-badge&logo=x&logoColor=white)](https://x.com/bigbullapp)

[🛠 Schnellstart](#-quick-start) · [🎁 Kostenloser Tarif](#-free-tier--how-much-you-get) · [🤖 Modelle](#-models--all-39-of-them) · [🧪 Die API nutzen](#-how-to-use-the-api) · [✅ Verifiziert](#-verified-working--every-key-is-tested) · [🧭 So funktioniert es](#-how-it-works) · [🔌 9Router](#-connect-to-9router) · [🔌 OmniRoute](#-connect-to-omniroute) · [⚙️ Optionen](#️-cli-options) · [🛰️ Proxys](#️-behind-a-proxy) · [🐞 Probleme](#-issues)

</div>

<div align="center">

**English** · [Türkçe](README.tr.md) · [中文](README.cn.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Русский](README.ru.md) · [Português](README.pt.md)

</div>

---

## ✨ Warum es das gibt

io.net (IO Intelligence) gibt jedem Konto API-Zugriff, und die nützliche Einheit ist *ein Konto pro Schlüssel*. Die Anmeldung ist eine einzige gehostete Seite: E-Mail-Adresse, ein Einmalcode per E-Mail und ein API-Schlüssel-Endpunkt. Dieses Tool durchläuft den gesamten Weg — ein echter Browser, wo die Seite einen erfordert, reines HTTP für alles andere — und zeichnet einen Schlüssel erst nach einer echten Completion auf:

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

> **Status-Hinweis (2026-10-18):** Das Repo wurde am selben Tag früher archiviert, als man die Rail für tot hielt; eine abendliche erneute Prüfung hat sie wieder verifiziert — ein Live-Sweep des auf der Festplatte liegenden Pools beantwortete echte Chat-Completions (`google/gemma-4-26b-a4b-it` → 200 `"pong"`) und die Rail `id.io.net/login` antwortete mit `200`. Das Repo ist wieder **aktiv**. Registrierungen sind vom Anbieter ratenbegrenzt und Challenges sind menschlich gesteuert; die Skalierung ist durch diese Hürden begrenzt.

## 🎁 Kostenloser Tarif — wie viel du bekommst

**Was ein kostenloses Konto tatsächlich aufrufen kann:** Der Katalog wird jedem Schlüssel *aufgelistet*, aber die Generierung wird pro Modell durch den Kontotarif gesteuert. Gemessen mit einem Schlüssel des kostenlosen Tarifs über 24 dieser IDs antwortete genau eine auf eine Completion — **`google/gemma-4-26b-a4b-it`** (`200`, eine echte Assistenten-Nachricht; es ist ein Reasoning-Modell, daher kann der Text in `reasoning_content` ankommen). Jede andere ID antwortete mit `402 {"note":"Model '<id>' requires a higher IO Intelligence tier"}`.

| Was | Wert |
| --- | --- |
| Katalog pro Schlüssel | **39 IDs** bei `GET /v1/models` (erfasst in [`models.json`](models.json)) |
| Verifizierer des kostenlosen Tarifs | `google/gemma-4-26b-a4b-it` — **200** mit echtem Inhalt |
| Andere IDs im kostenlosen Tarif | `402 requires a higher IO Intelligence tier` bis zum Upgrade |
| Metadaten pro Modell | jedes Modell trägt `min_access_tier` (1–3) und `higher_tier_required` |
| Anmeldung | `id.io.net/login` (E-Mail → Code → `magic-auth/verify` → `accessToken` → `POST /v1/api-keys`) |
| Die Einheit, die skaliert | **ein Konto = ein Schlüssel** → `--target N` sind N Konten/Schlüssel |

> 💡 Der kostenlose Tarif wird von IO Intelligence festgelegt und kann sich ändern. Prüfe die Live-Zahlen auf [io.net](https://io.net) — und lass das eigene Gate des Tools entscheiden:

```bash
node src/cli.js verify --proxy socks5://127.0.0.1:1080     # every key is re-tested (models + chat) through one exit
```

## 🤖 Modelle — alle 39 davon

`GET https://api.intelligence.io.solutions/api/v1/models` antwortet mit **39 Modell-IDs** für jeden gültigen Schlüssel, darunter:

`deepseek-ai/DeepSeek-V4.1-Flash` · `deepseek-ai/DeepSeek-V4-Pro` · `zai-org/GLM-5.3` · `zai-org/GLM-5.3-Flash` · `XiaomiMiMo/MiMo-V2.6-Flash` · `moonshotai/Kimi-K3` · `MiniMaxAI/MiniMax-M2.7` · `Qwen/Qwen3.8-27B` · `openai/gpt-oss-120b` · `deepseek-ai/DeepSeek-R1-0528` · `google/gemma-4-26b-a4b-it`

Gemessene Abdeckung im kostenlosen Tarif:

|Modell|✓|
|---|---|
|`google/gemma-4-26b-a4b-it`|✓|
|`nvidia/nemotron-3.5-lightning`|✓|

Live-Nachprüfung vom 2026-10-19 (5 Schlüssel × 4 Exits): `nvidia/nemotron-3.5-lightning` antwortete mit `200` bei 20/20 Probes; der Rest des 39-ID-Katalogs antwortet mit `402 requires a higher IO Intelligence tier`.

Die vollständigen 39 IDs stehen in [`models.json`](models.json). Live-Probe eines Schlüssels (genau das, was der Verifizierer tut):

```bash
curl https://api.intelligence.io.solutions/api/v1/chat/completions \
  -H "Authorization: Bearer io-v2-…" -H "Content-Type: application/json" \
  -d '{"model":"google/gemma-4-26b-a4b-it","messages":[{"role":"user","content":"hi"}]}'
```

## 🧪 Die API nutzen

Die Basis-URL ist **`https://api.intelligence.io.solutions/api/v1`** — OpenAI-kompatibel.

**Jedes SDK / curl**

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

## ⚡ Ein Befehl

```bash
node src/cli.js --count N      # mint N keys — exit screen, browser, HTTP finish, one account at a time
node src/cli.js --dry          # print the resolved plan: writes nothing, sends nothing
```

`--auto` ist die Standardeinstellung: Der Mint-Pfad benötigt kein Token, keine Captcha-Antwort und keine Proxy-Frage von dir. Eine `proxies.txt` neben der CLI wird automatisch verwendet (andernfalls geht das Tool direkt), und das interaktive Menü (`node src/launcher.js`) umschließt dieselben Aufgaben.

> ⚠️ **Nutzungsbedingungen & Kontorisiko.** Die Automatisierung eines Anbieters kann gegen dessen Nutzungsbedingungen verstoßen und zur Sperrung von Konten oder IPs führen. Du führst dies auf Konten aus, die dir gehören, von deinem eigenen Rechner, auf eigenes Risiko; das Tool steuert nur die eigene Anmeldeseite der Website an und umgeht niemals ein bezahltes Gate. Lies die ToS des Anbieters, bevor du eine große Kampagne startest.

## 🛠 Schnellstart

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

**Die Challenge wird von deiner Seite aus beantwortet:** Jede Runde wird als `solve-<tag>/round-N.png` + `state.json` ausgegeben, und du schreibst `solve-<tag>/clicks.json` mit den anzuklickenden Kacheln — das Tool klickt sie an, liest das Widget neu und fährt fort.

### 🖱️ Der Launcher

`src/launcher.js` ist das interaktive Menü über mint / verify / screen und 9Router. Es hat dieselbe Banner-/Menü-Form wie die anderen Repos und delegiert an die Aufgaben von `src/cli.js`. `node src/launcher.js --connect-9router` registriert die Schlüssel in einem lokalen 9Router.

## ✅ Verifiziert funktionierend — jeder Schlüssel wird getestet

> **Qualitäts-Gates.** Jeder Schlüssel hier hat ein Live-`chat-200` bestanden, bevor er in `keys.txt` geschrieben wurde
> (tote Schlüssel werden nie ausgeliefert). Router-Kombinationen folgen derselben Regel auf Modellebene: Ein Eintrag wird
> **nur hinzugefügt, wenn das Modell mit `chat-200` antwortet und Tools aufrufen kann** — ein Modell ohne Tool-Unterstützung,
> ein toter Schlüssel oder ein toter Anbieter wird verworfen statt hinzugefügt. Funktioniert mit **9Router und OmniRoute**.

Ein Schlüssel wird erst dann in `keys.txt` geschrieben, wenn die Live-API damit antwortet:

| Prüfung | Aufruf | Erwartet |
| --- | --- | --- |
| Auth + Modellliste | `GET https://api.intelligence.io.solutions/api/v1/models` | `200` + die Modell-IDs des Kontos (39) |
| Echte Completion | `POST …/chat/completions` (`google/gemma-4-26b-a4b-it`) | `200` + eine nicht leere Assistenten-Nachricht |

```bash
node src/cli.js verify --proxy socks5://127.0.0.1:1080    # re-runs both checks over every key and reports a per-key verdict
```

Der Treiber führt dieselbe Prüfung bei jedem Schlüssel durch, den er anhängt. `google/gemma-4-26b-a4b-it` ist ein Reasoning-Modell — der Text kann in `reasoning_content` ankommen.

> ionet steht auf der Liste der blockierten Anbieter — die Verifikationsform ist wie gemessen; anbieterseitige Tarifierung gilt.

## 🧭 So funktioniert es

```
inbox (one address per account)                                  a fresh address per account
   │
   ├─▶ sign-up: IO Intelligence page → e-mail address → code / link from the inbox
   ├─▶ session: the account's cookies or access token in hand
   ├─▶ key mint: the account's key endpoint → plaintext key returned once (written to disk immediately)
   └─▶ live proof: POST https://api.intelligence.io.solutions/api/v1/chat/completions → real content = the key is live
```

Pro Konto ein Chrome (Browser-Phase) + ein HTTP-Abschnitt:

1. **Browser-Phase** (`run-account.js --until start`): navigieren, eine frische Mailbox-Adresse eingeben, die Challenge-Runden aus deiner `clicks.json` beantworten, absenden. In dem Moment, in dem `POST /api/workos/magic-auth/start` antwortet, werden Posteingang + Token des Kontos in `handoff.json` geschrieben und **Chrome wird sofort geschlossen** — die Aufgabe des Browsers ist beendet.
2. **HTTP-Abschnitt** (`http-finish.js`): den Einmalcode aus der Mailbox lesen, `magic-auth/verify` aufrufen → `accessToken`, den Schlüssel erstellen (`POST /v1/api-keys/`), ihn live verifizieren, an `keys.txt` + `accounts.json` anhängen.
3. **Treiber** (`lane.js`): eine serielle Schleife über Versuche — wählt einen frischen Pool-Exit, führt unmittelbar vor der Nutzung einen Preflight durch, führt die Browser-Phase aus, stellt Versuche automatisch wieder her, die vor dem Absenden unterbrochen wurden, führt den HTTP-Abschnitt innerhalb der Lebensdauer des Tokens aus, blockiert fehlgeschlagene Exits auf die Blacklist und wählt neu. `lane-<TAG>.jsonl` zeichnet jeden Versuch auf.

Zwei Knöpfe, die man kennen sollte: Der API-Schlüssel muss mit `project: "io-intelligence"` erstellt werden (das Tool erledigt das für dich), und das Access-Token, das der Browser übergibt, lebt **5 Minuten** — genau deshalb übergibt die Browser-Phase an HTTP, statt auf der Seite zu beenden.

## ⚙️ CLI-Optionen

| Tool | Flags |
| --- | --- |
| `cli.js` | `mint` · `finish` · `verify` · `screen` — jede Aufgabe gibt ihre eigenen Flags aus (`node src/lane.js --help`) |
| `lane.js` | `--tag` (L) · `--port` (9411) · `--target N` (5) · `--preset turbo\|balanced\|safe` (Pacing-Abstand) · `--gap S` · `--pick` (frischer Pool-Exit pro Versuch) oder `--proxy <line>` (fester Exit) · `--direct` (gar kein Proxy) · `--max-attempts N` · `--union-file` / `--new-file` |
| `run-account.js` | `--tag` · `--port` · `--until start\|email\|otp\|key` · `--proxy <line>` · `--broker <url>` · `--solve-dir` · `--solve-budget-ms` · `--round-wait-ms` · `--otp-timeout-ms` · `--email` / `--email-token` (einen Posteingang fortsetzen) |
| `http-finish.js` | `--email` + `--box-token`, oder `--token <accessToken>` / `--token-file`, oder `--from-log <net.jsonl>` · `--name` · `--model` · `--otp-timeout-ms` |
| 9Router | `--connect-9router` bei jeder Aufgabe — nach deren Abschluss wird jeder Schlüssel in `keys.txt` in einen laufenden 9Router registriert (`node src/connect-9router.js --help`) |

Turbo önerilir (5); daha fazlası zayıf bilgisayarda yük/ban riski.

## 🛰️ Hinter einem Proxy

**Optional — bei Skalierung empfohlen (Limits pro IP, Sperren).** Das Tool funktioniert auch ohne Proxy.

- **Mit einem Pool:** Exits stammen aus einem Text-Pool (eine Zeile pro Exit, `scheme://host:port`); jeder Versuch erhält einen frischen Exit und einen Preflight zur Nutzungszeit, und Exits, die einen fehlgeschlagenen Versuch verursacht haben, werden pro Lane auf die Blacklist gesetzt.
- **Ohne einen Pool:** nichts auszuwählen — die Lane wechselt von selbst in den DIRECT-Modus (oder erzwingt ihn mit `--direct`); der Chrome-Kontext öffnet sich ungetunnelt und jede Anfrage — Browser, Code-Lesen, Schlüsselerstellung, Verifizieren — verlässt diesen Rechner direkt.
- Das reCAPTCHA-Implementierungsskript wird der Seite aus einem lokalen Cache ausgeliefert, sodass ein Exit für die Browser-Phase nur `id.io.net` und `www.google.com` erreichen muss.
- Der Mailbox-Broker läuft auf Loopback (`127.0.0.1`) — er gehört dir, nicht dem Anbieter, und er hält deine Mail-Zugangsdaten, niemals das Repo.

## 📄 Dateien

| Pfad | Inhalt |
| --- | --- |
| `keys.txt` | die Schlüssel, **einer pro Zeile**, angehängt in dem Moment, in dem ein Schlüssel die Live-Prüfung besteht — von Git ignoriert |
| `accounts.json` | ein Datensatz pro Konto: Mailbox, Schlüssel, der Exit, der ihn erzeugt hat — von Git ignoriert |
| [`models.json`](models.json) | `GET /v1/models`, wie von einem erzeugten Schlüssel beantwortet (39 IDs) |
| `out/` | Dumps pro Versuch (Screenshots + DOM-/Netzwerk-Logs), Batch-Log, Exit-Buchhaltung — von Git ignoriert |
| `proxies.txt` | dein Exit-Pool, ein Proxy pro Zeile (optional) — von Git ignoriert |

## 🔌 Mit 9Router verbinden

[9Router](https://9router.com) ist ein selbst gehosteter, OpenAI-kompatibler Router. io.net bietet einen OpenAI-kompatiblen Endpunkt (`https://api.intelligence.io.solutions/api/v1`), also registriere ihn einmal und jeder Schlüssel, den du erzeugt hast, wird zu einer Verbindung unter einem Provider-Node — 9Router verteilt die Last über sie:

```bash
node src/connect-9router.js \
  --base http://localhost:20128 --password 123456 \
  --api-key io-v2-xxxxxxxx
```

Führe es ohne `--api-key` aus, um **jeden** Schlüssel in `keys.txt` zu registrieren. Ein erneuter Lauf ist idempotent: Der Node wird über `--prefix ionet` abgeglichen, jede Verbindung wird über den Namen abgeglichen (`ionet-001`, `ionet-002`, …), und ein bereits registrierter Schlüssel bleibt unangetastet. Standardwerte: `--base http://localhost:20128`, `--password 123456`, `--name "IO Intelligence"`, `--prefix ionet`, `--base-url https://api.intelligence.io.solutions/api/v1`, `--model google/gemma-4-26b-a4b-it`.

In 9Router wird der Katalog so bereitgestellt:

```
ionet/google/gemma-4-26b-a4b-it
ionet/deepseek-ai/DeepSeek-V4.1-Flash
ionet/zai-org/GLM-5.3-Flash
```

`node src/cli.js mint --target 5 --pick --connect-9router` erzeugt und registriert in einem Durchgang, und `node src/launcher.js` steuert denselben Ablauf über sein Menü.

## 🔌 Mit OmniRoute verbinden

[OmniRoute](https://omniroute.online) ist ein selbst gehosteter, OpenAI-kompatibler Router. io.net bietet einen OpenAI-kompatiblen Endpunkt (`https://api.intelligence.io.solutions/api/v1`), also registriere ihn einmal und jeder Schlüssel, den du erzeugt hast, wird zu einer Verbindung unter einem Provider-Node — OmniRoute verteilt die Last über sie:

```bash
node src/connect-omniroute.js \
  --base http://localhost:20128 --password 123456 \
  --api-key io-v2-xxxxxxxx
```

Führe es ohne `--api-key` aus, um **jeden** Schlüssel in `keys.txt` zu registrieren. Ein erneuter Lauf ist idempotent: Der Node wird über `--prefix ionet` abgeglichen, jede Verbindung wird über den Namen abgeglichen (`ionet-001`, `ionet-002`, …), und ein bereits registrierter Schlüssel bleibt unangetastet. Standardwerte: `--base http://localhost:20128`, `--password 123456`, `--name "IO Intelligence"`, `--prefix ionet`, `--base-url https://api.intelligence.io.solutions/api/v1`, `--model google/gemma-4-26b-a4b-it`.

In OmniRoute wird der Katalog so bereitgestellt:

```
ionet/google/gemma-4-26b-a4b-it
ionet/deepseek-ai/DeepSeek-V4.1-Flash
ionet/zai-org/GLM-5.3-Flash
```

`node src/cli.js mint --target 5 --pick --connect-omniroute` erzeugt und registriert in einem Durchgang, und `node src/launcher.js` steuert denselben Ablauf über sein Menü.
## 🔑 Was ein Schlüssel dir bringt

| | |
| --- | --- |
| 🏢 Anbieter | **IO Intelligence** — [io.net](https://io.net) |
| 🎁 Was der Anbieter gibt | 39 Modelle aufgelistet — der kostenlose Tarif beschränkt die meisten IDs auf 402; google/gemma-4-26b-a4b-it ist der Verifizierer des kostenlosen Tarifs |
| 🔑 Was ein Schlüssel dir bringt | ein API-Schlüssel, der auf sein eigenes Konto beschränkt ist: die 39 Modell-IDs am unten stehenden Endpunkt, im Rahmen der Limits deines Tarifs. Das Kontingent liegt beim **Konto**, weshalb dieses Tool genau ein Konto pro Schlüssel erstellt |
| 🌐 API-Form | OpenAI-kompatibel: `POST https://api.intelligence.io.solutions/api/v1/chat/completions` |
| 🔒 Deine Daten | nur io.net und das von dir konfigurierte Posteingangs-Backend werden kontaktiert; Schlüssel bleiben auf deinem Rechner |

## 🐞 Probleme

Öffne ein Issue mit dem fehlgeschlagenen Schritt, dem Tag/Versuch, dem verwendeten Exit und dem Trace-Ende (`lane-<TAG>-trace.log`) — Screenshots und State-Dumps unter `out/` machen Fehler reproduzierbar, ohne einen Schlüssel preiszugeben. **[Öffne ein Issue](../../issues)** mit dem ausgeführten Befehl und der exakten Ausgabe; PRs sind willkommen. Wenn das Tarif-Gate des Anbieters weiterhin auf `402 requires a higher IO Intelligence tier` verweist, stoppt das Tool bei diesem Modell und sagt es — der beschränkte Katalog ist wie gemessen.

## 📄 Lizenz

MIT © 2026 — siehe [LICENSE](LICENSE).

<div align="center">

**[MIT](LICENSE)** © 2026 ionet-bulk-apikey contributors

</div>