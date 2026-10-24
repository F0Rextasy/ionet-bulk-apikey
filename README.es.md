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

**Crea cuentas de IO Intelligence (io.net) en masa con claves API autogeneradas — inferencia compatible con OpenAI + conector 9Router.**

[![Node](https://img.shields.io/badge/Node-%E2%89%A518-3DA639?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![Dependencies](https://img.shields.io/badge/dependencies-0-blue?style=for-the-badge)](#)
[![License](https://img.shields.io/badge/license-MIT-6ea8fe?style=for-the-badge)](LICENSE)
[![Models](https://img.shields.io/badge/models-39%20served-412991?style=for-the-badge)](https://io.net)
[![9Router](https://img.shields.io/badge/9Router-connector-8B5CF6?style=for-the-badge)](#-connect-to-9router)
[![OmniRoute](https://img.shields.io/badge/OmniRoute-connector-8B5CF6?style=for-the-badge)](#-connect-to-omniroute)
[![X](https://img.shields.io/badge/X-%40bigbullapp-000000?style=for-the-badge&logo=x&logoColor=white)](https://x.com/bigbullapp)

[🛠 Inicio rápido](#-quick-start) · [🎁 Nivel gratuito](#-free-tier--how-much-you-get) · [🤖 Modelos](#-models--all-39-of-them) · [🧪 Usa la API](#-how-to-use-the-api) · [✅ Verificado](#-verified-working--every-key-is-tested) · [🧭 Cómo funciona](#-how-it-works) · [🔌 9Router](#-connect-to-9router) · [🔌 OmniRoute](#-connect-to-omniroute) · [⚙️ Opciones](#️-cli-options) · [🛰️ Proxies](#️-behind-a-proxy) · [🐞 Problemas](#-issues)

</div>

<div align="center">

**English** · [Türkçe](README.tr.md) · [中文](README.cn.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Русский](README.ru.md) · [Português](README.pt.md)

</div>

---

## ✨ Por qué existe esto

io.net (IO Intelligence) da acceso API a cada cuenta, y la unidad útil es *una cuenta por clave*. El registro es una única página alojada: dirección de correo, un código de un solo uso por correo y un endpoint de clave API. Esta herramienta recorre todo el camino — un navegador real donde la página lo requiere, HTTP simple para todo lo demás — y solo registra una clave tras una completion real:

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

> **Nota de estado (2026-10-18):** el repositorio fue archivado antes ese mismo día mientras se creía que el rail estaba muerto; una reauditoría por la tarde lo reverificó — un barrido en vivo del pool en disco respondió completions de chat reales (`google/gemma-4-26b-a4b-it` → 200 `"pong"`) y el rail `id.io.net/login` respondió `200`. El repositorio está **activo** de nuevo. Los registros están limitados por el proveedor y los desafíos están controlados por humanos; la escala está limitada por esas barreras.

## 🎁 Nivel gratuito — cuánto obtienes

**Lo que una cuenta gratuita puede llamar realmente:** el catálogo se *lista* para cada clave, pero la generación está restringida por modelo según el nivel de la cuenta. Medido con una clave de nivel gratuito en 24 de esos ids, exactamente uno respondió a una completion — **`google/gemma-4-26b-a4b-it`** (`200`, un mensaje de asistente real; es un modelo de razonamiento, así que el texto puede llegar en `reasoning_content`). Todos los demás ids respondieron `402 {"note":"Model '<id>' requires a higher IO Intelligence tier"}`.

| Qué | Valor |
| --- | --- |
| Catálogo por clave | **39 ids** en `GET /v1/models` (capturado en [`models.json`](models.json)) |
| Verificador de nivel gratuito | `google/gemma-4-26b-a4b-it` — **200** con contenido real |
| Otros ids en nivel gratuito | `402 requires a higher IO Intelligence tier` hasta actualizar |
| Metadatos por modelo | cada modelo lleva `min_access_tier` (1–3) y `higher_tier_required` |
| Registro | `id.io.net/login` (correo → código → `magic-auth/verify` → `accessToken` → `POST /v1/api-keys`) |
| La unidad que escala | **una cuenta = una clave** → `--target N` son N cuentas/claves |

> 💡 El nivel gratuito lo define IO Intelligence y puede cambiar. Consulta los números en vivo en [io.net](https://io.net) — y deja que la propia barrera de la herramienta decida:

```bash
node src/cli.js verify --proxy socks5://127.0.0.1:1080     # every key is re-tested (models + chat) through one exit
```

## 🤖 Modelos — los 39

`GET https://api.intelligence.io.solutions/api/v1/models` responde **39 ids de modelo** para cualquier clave válida, incluidos:

`deepseek-ai/DeepSeek-V4.1-Flash` · `deepseek-ai/DeepSeek-V4-Pro` · `zai-org/GLM-5.3` · `zai-org/GLM-5.3-Flash` · `XiaomiMiMo/MiMo-V2.6-Flash` · `moonshotai/Kimi-K3` · `MiniMaxAI/MiniMax-M2.7` · `Qwen/Qwen3.8-27B` · `openai/gpt-oss-120b` · `deepseek-ai/DeepSeek-R1-0528` · `google/gemma-4-26b-a4b-it`

Cobertura medida del nivel gratuito:

|Modelo|✓|
|---|---|
|`google/gemma-4-26b-a4b-it`|✓|
|`nvidia/nemotron-3.5-lightning`|✓|

Revisión en vivo del 2026-10-19 (5 claves × 4 salidas): `nvidia/nemotron-3.5-lightning` respondió `200` en 20/20 sondeos; el resto del catálogo de 39 ids responde `402 requires a higher IO Intelligence tier`.

Los 39 ids completos están en [`models.json`](models.json). Sondeo en vivo de una clave (exactamente lo que hace el verificador):

```bash
curl https://api.intelligence.io.solutions/api/v1/chat/completions \
  -H "Authorization: Bearer io-v2-…" -H "Content-Type: application/json" \
  -d '{"model":"google/gemma-4-26b-a4b-it","messages":[{"role":"user","content":"hi"}]}'
```

## 🧪 Cómo usar la API

La URL base es **`https://api.intelligence.io.solutions/api/v1`** — compatible con OpenAI.

**Cualquier SDK / curl**

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

## ⚡ Un solo comando

```bash
node src/cli.js --count N      # mint N keys — exit screen, browser, HTTP finish, one account at a time
node src/cli.js --dry          # print the resolved plan: writes nothing, sends nothing
```

`--auto` es el valor predeterminado: la ruta de creación no requiere ningún token, respuesta de captcha ni pregunta de proxy por tu parte. Un `proxies.txt` junto al CLI se usa automáticamente (de lo contrario, la herramienta va directa), y el menú interactivo (`node src/launcher.js`) envuelve las mismas tareas.

> ⚠️ **Términos y riesgo de cuenta.** Automatizar un proveedor puede violar sus Términos de Servicio y provocar el baneo de cuentas o IPs. Ejecutas esto en cuentas que posees, desde tu propia máquina, bajo tu propio riesgo; la herramienta solo maneja la propia página de registro del sitio y nunca elude una barrera de pago. Lee los ToS del proveedor antes de una campaña grande.

## 🛠 Inicio rápido

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

**El desafío se responde desde tu lado:** cada ronda se vuelca como `solve-<tag>/round-N.png` + `state.json`, y tú escribes `solve-<tag>/clicks.json` listando los mosaicos a clicar — la herramienta los clica, relee el widget y continúa.

### 🖱️ El lanzador

`src/launcher.js` es el menú interactivo sobre mint / verify / screen y 9Router. Tiene la misma forma de banner/menú que los otros repositorios y delega a las tareas de `src/cli.js`. `node src/launcher.js --connect-9router` registra las claves en un 9Router local.

## ✅ Verificado y funcionando — cada clave se prueba

> **Barreras de calidad.** Cada clave aquí pasó un `chat-200` en vivo antes de escribirse en `keys.txt`
> (las claves muertas nunca se envían). Las combinaciones del router siguen la misma regla a nivel de modelo: una entrada se
> añade **solo si el modelo responde `chat-200` y puede llamar herramientas** — un modelo sin soporte de herramientas,
> una clave muerta o un proveedor muerto se descarta en lugar de añadirse. Funciona con **9Router y OmniRoute**.

Una clave se escribe en `keys.txt` solo después de que la API en vivo responda con ella:

| comprobación | llamada | esperado |
| --- | --- | --- |
| auth + lista de modelos | `GET https://api.intelligence.io.solutions/api/v1/models` | `200` + los ids de modelo de la cuenta (39) |
| completion real | `POST …/chat/completions` (`google/gemma-4-26b-a4b-it`) | `200` + un mensaje de asistente no vacío |

```bash
node src/cli.js verify --proxy socks5://127.0.0.1:1080    # re-runs both checks over every key and reports a per-key verdict
```

El driver hace la misma comprobación en cada clave que añade. `google/gemma-4-26b-a4b-it` es un modelo de razonamiento — el texto puede llegar en `reasoning_content`.

> ionet está en la lista de proveedores bloqueados — la forma de verificación es la medida; se aplica la segmentación por niveles del lado del proveedor.

## 🧭 Cómo funciona

```
inbox (one address per account)                                  a fresh address per account
   │
   ├─▶ sign-up: IO Intelligence page → e-mail address → code / link from the inbox
   ├─▶ session: the account's cookies or access token in hand
   ├─▶ key mint: the account's key endpoint → plaintext key returned once (written to disk immediately)
   └─▶ live proof: POST https://api.intelligence.io.solutions/api/v1/chat/completions → real content = the key is live
```

Por cuenta, un Chrome (fase de navegador) + una etapa HTTP:

1. **Fase de navegador** (`run-account.js --until start`): navega, introduce una dirección de buzón nueva, responde las rondas del desafío desde tu `clicks.json`, envía. En el momento en que `POST /api/workos/magic-auth/start` responde, el buzón + token de la cuenta se escriben en `handoff.json` y **Chrome se cierra inmediatamente** — el trabajo del navegador ha terminado.
2. **Etapa HTTP** (`http-finish.js`): lee el código de un solo uso del buzón, llama a `magic-auth/verify` → `accessToken`, crea la clave (`POST /v1/api-keys/`), la verifica en vivo, la añade a `keys.txt` + `accounts.json`.
3. **Driver** (`lane.js`): un bucle serial sobre intentos — elige una salida fresca del pool, la preverifica en el momento de uso, ejecuta la fase de navegador, recupera automáticamente los intentos interrumpidos antes del envío, ejecuta la etapa HTTP dentro de la vida útil del token, pone en lista negra las salidas que fallaron y vuelve a elegir. `lane-<TAG>.jsonl` registra cada intento.

Dos detalles que vale la pena conocer: la clave API debe crearse con `project: "io-intelligence"` (la herramienta lo hace por ti), y el token de acceso que entrega el navegador vive **5 minutos** — que es exactamente por lo que la fase de navegador entrega a HTTP en lugar de terminar en la página.

## ⚙️ Opciones del CLI

| herramienta | flags |
| --- | --- |
| `cli.js` | `mint` · `finish` · `verify` · `screen` — cada tarea imprime sus propios flags (`node src/lane.js --help`) |
| `lane.js` | `--tag` (L) · `--port` (9411) · `--target N` (5) · `--preset turbo\|balanced\|safe` (pacing gap) · `--gap S` · `--pick` (fresh pool exit per attempt) or `--proxy <line>` (fixed exit) · `--direct` (no proxy at all) · `--max-attempts N` · `--union-file` / `--new-file` |
| `run-account.js` | `--tag` · `--port` · `--until start\|email\|otp\|key` · `--proxy <line>` · `--broker <url>` · `--solve-dir` · `--solve-budget-ms` · `--round-wait-ms` · `--otp-timeout-ms` · `--email` / `--email-token` (resume an inbox) |
| `http-finish.js` | `--email` + `--box-token`, or `--token <accessToken>` / `--token-file`, or `--from-log <net.jsonl>` · `--name` · `--model` · `--otp-timeout-ms` |
| 9Router | `--connect-9router` on any task — after it finishes, registers every key in `keys.txt` into a running 9Router (`node src/connect-9router.js --help`) |

Se recomienda turbo (5); más supone riesgo de carga/ban en equipos débiles.

## 🛰️ Detrás de un proxy

**Opcional — recomendado a escala (límites por IP, baneos).** La herramienta también funciona sin proxy.

- **Con un pool:** las salidas provienen de un pool de texto (una línea por salida, `scheme://host:port`); cada intento recibe una salida fresca y una preverificación en el momento de uso, y las salidas que produjeron un intento fallido se ponen en lista negra por lane.
- **Sin un pool:** no hay nada que elegir — el lane cambia a modo DIRECT por sí mismo (o fuérzalo con `--direct`); el contexto de Chrome se abre sin túnel y cada solicitud — navegador, lectura de código, creación de clave, verificación — sale de esta máquina directamente.
- El script de implementación de reCAPTCHA se sirve a la página desde una caché local, así que una salida solo necesita alcanzar `id.io.net` y `www.google.com` para la fase de navegador.
- El broker de buzón se ejecuta en loopback (`127.0.0.1`) — es tuyo, no del proveedor, y guarda tus credenciales de correo, nunca el repositorio.

## 📄 Archivos

| Ruta | Contenido |
| --- | --- |
| `keys.txt` | las claves, **una por línea**, añadidas en el momento en que una clave pasa la comprobación en vivo — ignorado por git |
| `accounts.json` | un registro por cuenta: buzón, clave, la salida que la creó — ignorado por git |
| [`models.json`](models.json) | `GET /v1/models` tal como lo responde una clave creada (39 ids) |
| `out/` | volcados por intento (capturas de pantalla + registros DOM/red), registro por lote, contabilidad de salidas — ignorado por git |
| `proxies.txt` | tu pool de salidas, un proxy por línea (opcional) — ignorado por git |

## 🔌 Conectar con 9Router

[9Router](https://9router.com) es un router autoalojado compatible con OpenAI. io.net sirve un endpoint compatible con OpenAI (`https://api.intelligence.io.solutions/api/v1`), así que regístralo una vez y cada clave que hayas creado se convierte en una conexión bajo un nodo proveedor — 9Router balancea la carga entre ellas:

```bash
node src/connect-9router.js \
  --base http://localhost:20128 --password 123456 \
  --api-key io-v2-xxxxxxxx
```

Ejecútalo sin `--api-key` para registrar **todas** las claves en `keys.txt`. Volver a ejecutarlo es idempotente: el nodo se empareja por `--prefix ionet`, cada conexión se empareja por nombre (`ionet-001`, `ionet-002`, …), y una clave ya registrada se deja intacta. Valores predeterminados: `--base http://localhost:20128`, `--password 123456`, `--name "IO Intelligence"`, `--prefix ionet`, `--base-url https://api.intelligence.io.solutions/api/v1`, `--model google/gemma-4-26b-a4b-it`.

En 9Router el catálogo se sirve como:

```
ionet/google/gemma-4-26b-a4b-it
ionet/deepseek-ai/DeepSeek-V4.1-Flash
ionet/zai-org/GLM-5.3-Flash
```

`node src/cli.js mint --target 5 --pick --connect-9router` crea y registra en una sola pasada, y `node src/launcher.js` maneja el mismo flujo desde su menú.

## 🔌 Conectar con OmniRoute

[OmniRoute](https://omniroute.online) es un router autoalojado compatible con OpenAI. io.net sirve un endpoint compatible con OpenAI (`https://api.intelligence.io.solutions/api/v1`), así que regístralo una vez y cada clave que hayas creado se convierte en una conexión bajo un nodo proveedor — OmniRoute balancea la carga entre ellas:

```bash
node src/connect-omniroute.js \
  --base http://localhost:20128 --password 123456 \
  --api-key io-v2-xxxxxxxx
```

Ejecútalo sin `--api-key` para registrar **todas** las claves en `keys.txt`. Volver a ejecutarlo es idempotente: el nodo se empareja por `--prefix ionet`, cada conexión se empareja por nombre (`ionet-001`, `ionet-002`, …), y una clave ya registrada se deja intacta. Valores predeterminados: `--base http://localhost:20128`, `--password 123456`, `--name "IO Intelligence"`, `--prefix ionet`, `--base-url https://api.intelligence.io.solutions/api/v1`, `--model google/gemma-4-26b-a4b-it`.

En OmniRoute el catálogo se sirve como:

```
ionet/google/gemma-4-26b-a4b-it
ionet/deepseek-ai/DeepSeek-V4.1-Flash
ionet/zai-org/GLM-5.3-Flash
```

`node src/cli.js mint --target 5 --pick --connect-omniroute` crea y registra en una sola pasada, y `node src/launcher.js` maneja el mismo flujo desde su menú.
## 🔑 Qué te da una clave

| | |
| --- | --- |
| 🏢 Proveedor | **IO Intelligence** — [io.net](https://io.net) |
| 🎁 Qué da el proveedor | 39 modelos listados — el nivel gratuito restringe la mayoría de ids a 402; google/gemma-4-26b-a4b-it es el verificador del nivel gratuito |
| 🔑 Qué te da una clave | una clave API limitada a su propia cuenta: los 39 ids de modelo en el endpoint de abajo, con los límites de tu plan. La cuota vive en la **cuenta**, que es exactamente por lo que esta herramienta crea una cuenta por clave |
| 🌐 Forma de la API | Compatible con OpenAI: `POST https://api.intelligence.io.solutions/api/v1/chat/completions` |
| 🔒 Tus datos | solo se contacta con io.net y el backend de buzón que configures; las claves permanecen en tu máquina |

## 🐞 Problemas

Abre un issue con el paso fallido, el tag/intento, la salida usada y la cola del trace (`lane-<TAG>-trace.log`) — las capturas de pantalla y los volcados de estado bajo `out/` hacen que los fallos sean reproducibles sin filtrar una clave. **[Abre un issue](../../issues)** con el comando que ejecutaste y la salida exacta; los PRs son bienvenidos. Si la barrera de nivel del proveedor sigue enrutando a `402 requires a higher IO Intelligence tier`, la herramienta se detiene en ese modelo y lo indica — el catálogo restringido es el medido.

## 📄 Licencia

MIT © 2026 — consulta [LICENSE](LICENSE).

<div align="center">

**[MIT](LICENSE)** © 2026 ionet-bulk-apikey contributors

</div>