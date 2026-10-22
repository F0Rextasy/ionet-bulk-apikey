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

**Crie contas em massa da IO Intelligence (io.net) com chaves de API geradas automaticamente — inferência compatível com OpenAI + conector 9Router.**

[![Node](https://img.shields.io/badge/Node-%E2%89%A518-3DA639?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![Dependencies](https://img.shields.io/badge/dependencies-0-blue?style=for-the-badge)](#)
[![License](https://img.shields.io/badge/license-MIT-6ea8fe?style=for-the-badge)](LICENSE)
[![Models](https://img.shields.io/badge/models-39%20served-412991?style=for-the-badge)](https://io.net)
[![9Router](https://img.shields.io/badge/9Router-connector-8B5CF6?style=for-the-badge)](#-connect-to-9router)
[![X](https://img.shields.io/badge/X-%40bigbullapp-000000?style=for-the-badge&logo=x&logoColor=white)](https://x.com/bigbullapp)

[🛠 Início rápido](#-quick-start) · [🎁 Camada gratuita](#-free-tier--how-much-you-get) · [🤖 Modelos](#-models--all-39-of-them) · [🧪 Use a API](#-how-to-use-the-api) · [✅ Verificado](#-verified-working--every-key-is-tested) · [🧭 Como funciona](#-how-it-works) · [🔌 9Router](#-connect-to-9router) · [⚙️ Opções](#️-cli-options) · [🛰️ Proxies](#️-behind-a-proxy) · [🐞 Problemas](#-issues)

</div>

<div align="center">

**English** · [Türkçe](README.tr.md) · [中文](README.cn.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Русский](README.ru.md) · [Português](README.pt.md)

</div>

---

## ✨ Por que isto existe

io.net (IO Intelligence) dá a toda conta acesso à API, e a unidade útil é *uma conta por chave*. O cadastro é uma única página hospedada: endereço de e-mail, um código de uso único por e-mail e um endpoint de chave de API. Esta ferramenta percorre todo o caminho — um navegador real onde a página exige um, HTTP simples para todo o resto — e só registra uma chave após uma completion real:

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

> **Nota de status (2026-10-18):** o repositório foi arquivado mais cedo no mesmo dia enquanto se acreditava que a via estivesse morta; uma reauditoria à noite o reverificou — uma varredura ao vivo do pool em disco respondeu a completions reais de chat (`google/gemma-4-26b-a4b-it` → 200 `"pong"`) e a via `id.io.net/login` respondeu `200`. O repositório está **ativo** novamente. Os cadastros têm limite de taxa pelo provedor e os desafios são controlados por humanos; a escala é limitada por esses portões.

## 🎁 Camada gratuita — quanto você recebe

**O que uma conta gratuita pode realmente chamar:** o catálogo é *listado* para cada chave, mas a geração é restrita por modelo conforme o nível da conta. Medido com uma chave da camada gratuita em 24 desses ids, exatamente um respondeu a uma completion — **`google/gemma-4-26b-a4b-it`** (`200`, uma mensagem real do assistente; é um modelo de raciocínio, então o texto pode chegar em `reasoning_content`). Todos os outros ids responderam `402 {"note":"Model '<id>' requires a higher IO Intelligence tier"}`.

| O quê | Valor |
| --- | --- |
| Catálogo por chave | **39 ids** em `GET /v1/models` (capturado em [`models.json`](models.json)) |
| Verificador da camada gratuita | `google/gemma-4-26b-a4b-it` — **200** com conteúdo real |
| Outros ids na camada gratuita | `402 requires a higher IO Intelligence tier` até fazer upgrade |
| Metadados por modelo | cada modelo carrega `min_access_tier` (1–3) e `higher_tier_required` |
| Cadastro | `id.io.net/login` (e-mail → código → `magic-auth/verify` → `accessToken` → `POST /v1/api-keys`) |
| A unidade que escala | **uma conta = uma chave** → `--target N` são N contas/chaves |

> 💡 A camada gratuita é definida pela IO Intelligence e pode mudar. Confira os números ao vivo em [io.net](https://io.net) — e deixe o próprio portão da ferramenta decidir:

```bash
node src/cli.js verify --proxy socks5://127.0.0.1:1080     # every key is re-tested (models + chat) through one exit
```

## 🤖 Modelos — todos os 39

`GET https://api.intelligence.io.solutions/api/v1/models` responde **39 ids de modelo** para qualquer chave válida, incluindo:

`deepseek-ai/DeepSeek-V4.1-Flash` · `deepseek-ai/DeepSeek-V4-Pro` · `zai-org/GLM-5.3` · `zai-org/GLM-5.3-Flash` · `XiaomiMiMo/MiMo-V2.6-Flash` · `moonshotai/Kimi-K3` · `MiniMaxAI/MiniMax-M2.7` · `Qwen/Qwen3.8-27B` · `openai/gpt-oss-120b` · `deepseek-ai/DeepSeek-R1-0528` · `google/gemma-4-26b-a4b-it`

Cobertura medida da camada gratuita:

|Modelo|✓|
|---|---|
|`google/gemma-4-26b-a4b-it`|✓|
|`nvidia/nemotron-3.5-lightning`|✓|

Rechecagem ao vivo de 2026-10-19 (5 chaves × 4 saídas): `nvidia/nemotron-3.5-lightning` respondeu `200` em 20/20 sondas; o restante do catálogo de 39 ids responde `402 requires a higher IO Intelligence tier`.

Os 39 ids completos estão em [`models.json`](models.json). Sonda ao vivo de uma chave (exatamente o que o verificador faz):

```bash
curl https://api.intelligence.io.solutions/api/v1/chat/completions \
  -H "Authorization: Bearer io-v2-…" -H "Content-Type: application/json" \
  -d '{"model":"google/gemma-4-26b-a4b-it","messages":[{"role":"user","content":"hi"}]}'
```

## 🧪 Como usar a API

A URL base é **`https://api.intelligence.io.solutions/api/v1`** — compatível com OpenAI.

**Qualquer SDK / curl**

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

## 🛠 Início rápido

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

**O desafio é respondido do seu lado:** cada rodada é despejada como `solve-<tag>/round-N.png` + `state.json`, e você escreve `solve-<tag>/clicks.json` listando os blocos a clicar — a ferramenta clica neles, relê o widget e segue em frente.

### 🖱️ O launcher

`src/launcher.js` é o menu interativo sobre mint / verify / screen e 9Router. Tem o mesmo formato de banner/menu dos outros repositórios e delega para as tarefas de `src/cli.js`. `node src/launcher.js --connect-9router` registra as chaves em um 9Router local.

## ✅ Verificado funcionando — cada chave é testada

Uma chave só é gravada em `keys.txt` depois que a API ao vivo responde com ela:

| verificação | chamada | esperado |
| --- | --- | --- |
| autenticação + lista de modelos | `GET https://api.intelligence.io.solutions/api/v1/models` | `200` + os ids de modelo da conta (39) |
| completion real | `POST …/chat/completions` (`google/gemma-4-26b-a4b-it`) | `200` + uma mensagem do assistente não vazia |

```bash
node src/cli.js verify --proxy socks5://127.0.0.1:1080    # re-runs both checks over every key and reports a per-key verdict
```

O driver faz a mesma verificação em cada chave que acrescenta. `google/gemma-4-26b-a4b-it` é um modelo de raciocínio — o texto pode chegar em `reasoning_content`.

> ionet está na lista de provedores bloqueados — o formato da verificação é o medido; a definição de níveis do lado do provedor se aplica.

## 🧭 Como funciona

```
inbox (one address per account)                                  a fresh address per account
   │
   ├─▶ sign-up: IO Intelligence page → e-mail address → code / link from the inbox
   ├─▶ session: the account's cookies or access token in hand
   ├─▶ key mint: the account's key endpoint → plaintext key returned once (written to disk immediately)
   └─▶ live proof: POST https://api.intelligence.io.solutions/api/v1/chat/completions → real content = the key is live
```

Por conta, um Chrome (fase de navegador) + uma etapa HTTP:

1. **Fase de navegador** (`run-account.js --until start`): navegue, insira um endereço de caixa de entrada novo, responda às rodadas do desafio a partir do seu `clicks.json`, envie. No momento em que `POST /api/workos/magic-auth/start` responde, a caixa de entrada + o token da conta são gravados em `handoff.json` e **o Chrome fecha imediatamente** — o trabalho do navegador acabou.
2. **Etapa HTTP** (`http-finish.js`): leia o código de uso único da caixa de entrada, chame `magic-auth/verify` → `accessToken`, crie a chave (`POST /v1/api-keys/`), verifique-a ao vivo, acrescente a `keys.txt` + `accounts.json`.
3. **Driver** (`lane.js`): um loop serial sobre tentativas — escolhe uma saída nova do pool, faz sua pré-verificação no momento do uso, executa a fase de navegador, recupera automaticamente tentativas interrompidas antes do envio, executa a etapa HTTP dentro do tempo de vida do token, coloca na lista negra saídas que falharam e escolhe novamente. `lane-<TAG>.jsonl` registra cada tentativa.

Dois detalhes que vale conhecer: a chave de API precisa ser criada com `project: "io-intelligence"` (a ferramenta faz isso por você), e o token de acesso que o navegador entrega dura **5 minutos** — e é exatamente por isso que a fase de navegador passa para HTTP em vez de terminar na página.

## ⚙️ Opções da CLI

| ferramenta | flags |
| --- | --- |
| `cli.js` | `mint` · `finish` · `verify` · `screen` — cada tarefa imprime suas próprias flags (`node src/lane.js --help`) |
| `lane.js` | `--tag` (L) · `--port` (9411) · `--target N` (5) · `--preset turbo\|balanced\|safe` (intervalo de ritmo) · `--gap S` · `--pick` (saída nova do pool por tentativa) ou `--proxy <line>` (saída fixa) · `--max-attempts N` · `--union-file` / `--new-file` |
| `run-account.js` | `--tag` · `--port` · `--until start\|email\|otp\|key` · `--proxy <line>` · `--broker <url>` · `--solve-dir` · `--solve-budget-ms` · `--round-wait-ms` · `--otp-timeout-ms` · `--email` / `--email-token` (retomar uma caixa de entrada) |
| `http-finish.js` | `--email` + `--box-token`, ou `--token <accessToken>` / `--token-file`, ou `--from-log <net.jsonl>` · `--name` · `--model` · `--otp-timeout-ms` |
| 9Router | `--connect-9router` em qualquer tarefa — depois que ela termina, registra cada chave em `keys.txt` em um 9Router em execução (`node src/connect-9router.js --help`) |

Turbo recomendado (5); mais do que isso traz risco de carga/banimento em computadores fracos.

## 🛰️ Atrás de um proxy

* As saídas vêm de um pool de texto (uma linha por saída, `scheme://host:port`); cada tentativa recebe uma saída nova e uma pré-verificação no momento do uso, e saídas que produziram uma tentativa com falha são colocadas na lista negra por lane.
* Toda chamada ao provedor — o navegador, a leitura do código, a criação da chave, a verificação — passa pelo pool; nada é enviado do seu próprio endereço.
* O script de implementação do reCAPTCHA é servido à página a partir de um cache local, então uma saída só precisa alcançar `id.io.net` e `www.google.com` para a fase de navegador.
* O broker de caixa de entrada roda em loopback (`127.0.0.1`) — é seu, não do provedor, e guarda suas credenciais de e-mail, nunca o repositório.

## 📄 Arquivos

| Caminho | Conteúdo |
| --- | --- |
| `keys.txt` | as chaves, **uma por linha**, anexadas no momento em que uma chave passa na verificação ao vivo — ignorado pelo git |
| `accounts.json` | um registro por conta: caixa de entrada, chave, a saída que a gerou — ignorado pelo git |
| [`models.json`](models.json) | `GET /v1/models` conforme respondido por uma chave gerada (39 ids) |
| `out/` | dumps por tentativa (capturas de tela + logs de DOM/rede), log do lote, contabilidade de saídas — ignorado pelo git |
| `proxies.txt` | seu pool de saídas, um proxy por linha — ignorado pelo git |

## 🔌 Conectar ao 9Router

[9Router](https://9router.com) é um roteador auto-hospedado e compatível com OpenAI. io.net serve um endpoint compatível com OpenAI (`https://api.intelligence.io.solutions/api/v1`), então registre-o uma vez e cada chave que você gerou se torna uma conexão sob um nó de provedor — o 9Router faz balanceamento de carga entre elas:

```bash
node src/connect-9router.js \
  --base http://localhost:20128 --password 123456 \
  --api-key io-v2-xxxxxxxx
```

Execute sem `--api-key` para registrar **todas** as chaves em `keys.txt`. Reexecutar é idempotente: o nó é correspondido por `--prefix ionet`, cada conexão é correspondida por nome (`ionet-001`, `ionet-002`, …), e uma chave já registrada é deixada como está. Padrões: `--base http://localhost:20128`, `--password 123456`, `--name "IO Intelligence"`, `--prefix ionet`, `--base-url https://api.intelligence.io.solutions/api/v1`, `--model google/gemma-4-26b-a4b-it`.

No 9Router, o catálogo é servido como:

```
ionet/google/gemma-4-26b-a4b-it
ionet/deepseek-ai/DeepSeek-V4.1-Flash
ionet/zai-org/GLM-5.3-Flash
```

`node src/cli.js mint --target 5 --pick --connect-9router` gera e registra em uma única passagem, e `node src/launcher.js` conduz o mesmo fluxo a partir do seu menu.

## 🔑 O que uma chave oferece

| | |
| --- | --- |
| 🏢 Provedor | **IO Intelligence** — [io.net](https://io.net) |
| 🎁 O que o provedor oferece | 39 modelos listados — a camada gratuita restringe a maioria dos ids a 402; google/gemma-4-26b-a4b-it é o verificador da camada gratuita |
| 🔑 O que uma chave oferece | uma chave de API limitada à própria conta: os 39 ids de modelo no endpoint abaixo, nos limites do seu plano. A cota fica na **conta**, e é exatamente por isso que esta ferramenta cria uma conta por chave |
| 🌐 Formato da API | Compatível com OpenAI: `POST https://api.intelligence.io.solutions/api/v1/chat/completions` |
| 🔒 Seus dados | apenas io.net e o backend de caixa de entrada que você configurar são contatados; as chaves ficam na sua máquina |

## 🐞 Problemas

Abra uma issue com a etapa com falha, a tag/tentativa, a saída usada e o final do trace (`lane-<TAG>-trace.log`) — capturas de tela e dumps de estado em `out/` tornam falhas reproduzíveis sem vazar uma chave. **[Abra uma issue](../../issues)** com o comando que você executou e a saída exata; PRs são bem-vindos. Se o portão de nível do provedor ainda encaminhar para `402 requires a higher IO Intelligence tier`, a ferramenta para naquele modelo e informa isso — o catálogo restrito é o medido.

## 📄 Licença

MIT © 2026 — veja [LICENSE](LICENSE).

<div align="center">

**[MIT](LICENSE)** © 2026 colaboradores do ionet-bulk-apikey

</div>