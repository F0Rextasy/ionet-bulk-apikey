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

**Crie contas IO Intelligence (io.net) em massa com chaves de API geradas automaticamente — inferência compatível com OpenAI + conector 9Router.**

[![Node](https://img.shields.io/badge/Node-%E2%89%A518-3DA639?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![Dependencies](https://img.shields.io/badge/dependencies-0-blue?style=for-the-badge)](#)
[![License](https://img.shields.io/badge/license-MIT-6ea8fe?style=for-the-badge)](LICENSE)
[![Models](https://img.shields.io/badge/models-39%20served-412991?style=for-the-badge)](https://io.net)
[![9Router](https://img.shields.io/badge/9Router-connector-8B5CF6?style=for-the-badge)](#-connect-to-9router)
[![OmniRoute](https://img.shields.io/badge/OmniRoute-connector-8B5CF6?style=for-the-badge)](#-connect-to-omniroute)
[![X](https://img.shields.io/badge/X-%40bigbullapp-000000?style=for-the-badge&logo=x&logoColor=white)](https://x.com/bigbullapp)

[🛠 Início rápido](#-quick-start) · [🎁 Nível gratuito](#-free-tier--how-much-you-get) · [🤖 Modelos](#-models--all-39-of-them) · [🧪 Use a API](#-how-to-use-the-api) · [✅ Verificado](#-verified-working--every-key-is-tested) · [🧭 Como funciona](#-how-it-works) · [🔌 9Router](#-connect-to-9router) · [🔌 OmniRoute](#-connect-to-omniroute) · [⚙️ Opções](#️-cli-options) · [🛰️ Proxies](#️-behind-a-proxy) · [🐞 Problemas](#-issues)

</div>

<div align="center">

**English** · [Türkçe](README.tr.md) · [中文](README.cn.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Русский](README.ru.md) · [Português](README.pt.md)

</div>

---

## ✨ Por que isso existe

A io.net (IO Intelligence) dá acesso à API para cada conta, e a unidade útil é *uma conta por chave*. O cadastro é uma única página hospedada: endereço de e-mail, um código de uso único por e-mail e um endpoint de chave de API. Esta ferramenta percorre todo o caminho — um navegador real onde a página exige um, HTTP puro para todo o resto — e só registra uma chave após uma conclusão real:

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

> **Nota de status (2026-10-18):** o repositório foi arquivado mais cedo no mesmo dia enquanto se acreditava que o trilho estava morto; uma reauditoria à noite o reverificou — uma varredura ao vivo do pool em disco respondeu a conclusões de chat reais (`google/gemma-4-26b-a4b-it` → 200 `"pong"`) e o trilho `id.io.net/login` respondeu `200`. O repositório está **ativo** novamente. Os cadastros são limitados por taxa pelo provedor e os desafios são controlados por humanos; a escala é limitada por esses portões.

## 🎁 Nível gratuito — quanto você recebe

**O que uma conta gratuita pode realmente chamar:** o catálogo é *listado* para cada chave, mas a geração é restringida por modelo pelo nível da conta. Medido com uma chave de nível gratuito em 24 desses ids, exatamente um respondeu a uma conclusão — **`google/gemma-4-26b-a4b-it`** (`200`, uma mensagem real do assistente; é um modelo de raciocínio, então o texto pode chegar em `reasoning_content`). Todos os outros ids responderam `402 {"note":"Model '<id>' requires a higher IO Intelligence tier"}`.

| O quê | Valor |
| --- | --- |
| Catálogo por chave | **39 ids** em `GET /v1/models` (capturado em [`models.json`](models.json)) |
| Verificador do nível gratuito | `google/gemma-4-26b-a4b-it` — **200** com conteúdo real |
| Outros ids no nível gratuito | `402 requires a higher IO Intelligence tier` até o upgrade |
| Metadados por modelo | cada modelo carrega `min_access_tier` (1–3) e `higher_tier_required` |
| Cadastro | `id.io.net/login` (e-mail → código → `magic-auth/verify` → `accessToken` → `POST /v1/api-keys`) |
| A unidade que escala | **uma conta = uma chave** → `--target N` são N contas/chaves |

> 💡 O nível gratuito é definido pela IO Intelligence e pode mudar. Confira os números ao vivo em [io.net](https://io.net) — e deixe o próprio portão da ferramenta decidir:

```bash
node src/cli.js verify --proxy socks5://127.0.0.1:1080     # every key is re-tested (models + chat) through one exit
```

## 🤖 Modelos — todos os 39

`GET https://api.intelligence.io.solutions/api/v1/models` responde **39 ids de modelos** para qualquer chave válida, incluindo:

`deepseek-ai/DeepSeek-V4.1-Flash` · `deepseek-ai/DeepSeek-V4-Pro` · `zai-org/GLM-5.3` · `zai-org/GLM-5.3-Flash` · `XiaomiMiMo/MiMo-V2.6-Flash` · `moonshotai/Kimi-K3` · `MiniMaxAI/MiniMax-M2.7` · `Qwen/Qwen3.8-27B` · `openai/gpt-oss-120b` · `deepseek-ai/DeepSeek-R1-0528` · `google/gemma-4-26b-a4b-it`

Cobertura medida do nível gratuito:

|Modelo|✓|
|---|---|
|`google/gemma-4-26b-a4b-it`|✓|
|`nvidia/nemotron-3.5-lightning`|✓|

Reverificação ao vivo de 2026-10-19 (5 chaves × 4 saídas): `nvidia/nemotron-3.5-lightning` respondeu `200` em 20/20 sondagens; o restante do catálogo de 39 ids responde `402 requires a higher IO Intelligence tier`.

Os 39 ids completos estão em [`models.json`](models.json). Sondagem ao vivo de uma chave (exatamente o que o verificador faz):

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

## ⚡ Um comando

```bash
node src/cli.js --count N      # mint N keys — exit screen, browser, HTTP finish, one account at a time
node src/cli.js --dry          # print the resolved plan: writes nothing, sends nothing
```

`--auto` é o padrão: o caminho de criação não precisa de token, resposta de captcha ou pergunta de proxy da sua parte. Um `proxies.txt` ao lado do CLI é usado automaticamente (caso contrário, a ferramenta vai direto), e o menu interativo (`node src/launcher.js`) envolve as mesmas tarefas.

> ⚠️ **Termos e risco de conta.** Automatizar um provedor pode violar seus Termos de Serviço e fazer com que contas ou IPs sejam banidos. Você executa isso em contas que possui, da sua própria máquina, por sua conta e risco; a ferramenta apenas conduz a própria página de cadastro do site e nunca contorna um portão pago. Leia os ToS do provedor antes de uma campanha grande.

## 🛠 Início rápido

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

**O desafio é respondido do seu lado:** cada rodada é despejada como `solve-<tag>/round-N.png` + `state.json`, e você escreve `solve-<tag>/clicks.json` listando os blocos a clicar — a ferramenta clica neles, relê o widget e segue em frente.

### 🖱️ O launcher

`src/launcher.js` é o menu interativo sobre mint / verify / screen e 9Router. Tem o mesmo formato de banner/menu dos outros repositórios e delega para as tarefas de `src/cli.js`. `node src/launcher.js --connect-9router` registra as chaves em um 9Router local.

## ✅ Verificado e funcionando — toda chave é testada

> **Portões de qualidade.** Toda chave aqui passou por um `chat-200` ao vivo antes de ser escrita em `keys.txt`
> (chaves mortas nunca são entregues). As combinações do roteador seguem a mesma regra no nível do modelo: uma entrada é
> adicionada **somente se o modelo responder `chat-200` e puder chamar ferramentas** — um modelo sem suporte a ferramentas,
> uma chave morta ou um provedor morto é descartado em vez de adicionado. Funciona com **9Router e OmniRoute**.

Uma chave só é escrita em `keys.txt` depois que a API ao vivo responde com ela:

| verificação | chamada | esperado |
| --- | --- | --- |
| auth + lista de modelos | `GET https://api.intelligence.io.solutions/api/v1/models` | `200` + os ids de modelos da conta (39) |
| conclusão real | `POST …/chat/completions` (`google/gemma-4-26b-a4b-it`) | `200` + uma mensagem do assistente não vazia |

```bash
node src/cli.js verify --proxy socks5://127.0.0.1:1080    # re-runs both checks over every key and reports a per-key verdict
```

O driver faz a mesma verificação em cada chave que anexa. `google/gemma-4-26b-a4b-it` é um modelo de raciocínio — o texto pode chegar em `reasoning_content`.

> ionet está na lista de provedores bloqueados — o formato da verificação é conforme medido; aplica-se o escalonamento por nível do lado do provedor.

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

1. **Fase de navegador** (`run-account.js --until start`): navegar, inserir um endereço de caixa de correio novo, responder às rodadas do desafio a partir do seu `clicks.json`, enviar. No momento em que `POST /api/workos/magic-auth/start` responde, a caixa de entrada + token da conta são escritos em `handoff.json` e **o Chrome fecha imediatamente** — o trabalho do navegador acabou.
2. **Etapa HTTP** (`http-finish.js`): ler o código de uso único da caixa de correio, chamar `magic-auth/verify` → `accessToken`, criar a chave (`POST /v1/api-keys/`), verificá-la ao vivo, anexar a `keys.txt` + `accounts.json`.
3. **Driver** (`lane.js`): um loop serial sobre as tentativas — escolhe uma saída nova do pool, faz o preflight no momento do uso, executa a fase de navegador, recupera automaticamente tentativas interrompidas antes do envio, executa a etapa HTTP dentro do tempo de vida do token, coloca na lista negra as saídas que falharam e escolhe novamente. `lane-<TAG>.jsonl` registra cada tentativa.

Dois detalhes que vale conhecer: a chave de API deve ser criada com `project: "io-intelligence"` (a ferramenta faz isso por você), e o token de acesso que o navegador entrega vive **5 minutos** — que é exatamente por isso que a fase de navegador entrega para o HTTP em vez de terminar na página.

## ⚙️ Opções do CLI

| ferramenta | flags |
| --- | --- |
| `cli.js` | `mint` · `finish` · `verify` · `screen` — cada tarefa imprime suas próprias flags (`node src/lane.js --help`) |
| `lane.js` | `--tag` (L) · `--port` (9411) · `--target N` (5) · `--preset turbo\|balanced\|safe` (intervalo de ritmo) · `--gap S` · `--pick` (saída nova do pool por tentativa) ou `--proxy <line>` (saída fixa) · `--direct` (sem proxy algum) · `--max-attempts N` · `--union-file` / `--new-file` |
| `run-account.js` | `--tag` · `--port` · `--until start\|email\|otp\|key` · `--proxy <line>` · `--broker <url>` · `--solve-dir` · `--solve-budget-ms` · `--round-wait-ms` · `--otp-timeout-ms` · `--email` / `--email-token` (retomar uma caixa de entrada) |
| `http-finish.js` | `--email` + `--box-token`, ou `--token <accessToken>` / `--token-file`, ou `--from-log <net.jsonl>` · `--name` · `--model` · `--otp-timeout-ms` |
| 9Router | `--connect-9router` em qualquer tarefa — após terminar, registra cada chave em `keys.txt` em um 9Router em execução (`node src/connect-9router.js --help`) |

Turbo önerilir (5); daha fazlası zayıf bilgisayarda yük/ban riski.

## 🛰️ Atrás de um proxy

**Opcional — recomendado em escala (limites por IP, banimentos).** A ferramenta funciona sem proxy também.

- **Com um pool:** as saídas vêm de um pool de texto (uma linha por saída, `scheme://host:port`); cada tentativa recebe uma saída nova e um preflight no momento do uso, e as saídas que produziram uma tentativa falha são colocadas na lista negra por lane.
- **Sem um pool:** nada a escolher — a lane muda para o modo DIRECT por conta própria (ou force com `--direct`); o contexto do Chrome abre sem túnel e cada requisição — navegador, leitura de código, criação de chave, verificação — sai desta máquina diretamente.
- O script de implementação do reCAPTCHA é servido à página a partir de um cache local, então uma saída só precisa alcançar `id.io.net` e `www.google.com` para a fase de navegador.
- O broker de caixa de correio roda em loopback (`127.0.0.1`) — é seu, não do provedor, e guarda suas credenciais de e-mail, nunca o repositório.

## 📄 Arquivos

| Caminho | Conteúdo |
| --- | --- |
| `keys.txt` | as chaves, **uma por linha**, anexadas no momento em que uma chave passa na verificação ao vivo — ignorado pelo git |
| `accounts.json` | um registro por conta: caixa de correio, chave, a saída que a criou — ignorado pelo git |
| [`models.json`](models.json) | `GET /v1/models` conforme respondido por uma chave criada (39 ids) |
| `out/` | despejos por tentativa (capturas de tela + logs de DOM/rede), log de lote, contabilidade de saídas — ignorado pelo git |
| `proxies.txt` | seu pool de saídas, um proxy por linha (opcional) — ignorado pelo git |

## 🔌 Conectar ao 9Router

[9Router](https://9router.com) é um roteador auto-hospedado e compatível com OpenAI. A io.net serve um endpoint compatível com OpenAI (`https://api.intelligence.io.solutions/api/v1`), então registre-o uma vez e cada chave que você criou se torna uma conexão sob um nó de provedor — o 9Router faz balanceamento de carga entre elas:

```bash
node src/connect-9router.js \
  --base http://localhost:20128 --password 123456 \
  --api-key io-v2-xxxxxxxx
```

Execute sem `--api-key` para registrar **todas** as chaves em `keys.txt`. Reexecutar é idempotente: o nó é correspondido por `--prefix ionet`, cada conexão é correspondida por nome (`ionet-001`, `ionet-002`, …), e uma chave já registrada é deixada em paz. Padrões: `--base http://localhost:20128`, `--password 123456`, `--name "IO Intelligence"`, `--prefix ionet`, `--base-url https://api.intelligence.io.solutions/api/v1`, `--model google/gemma-4-26b-a4b-it`.

No 9Router o catálogo é servido como:

```
ionet/google/gemma-4-26b-a4b-it
ionet/deepseek-ai/DeepSeek-V4.1-Flash
ionet/zai-org/GLM-5.3-Flash
```

`node src/cli.js mint --target 5 --pick --connect-9router` cria e registra em uma única passagem, e `node src/launcher.js` conduz o mesmo fluxo a partir do seu menu.

## 🔌 Conectar ao OmniRoute

[OmniRoute](https://omniroute.online) é um roteador auto-hospedado e compatível com OpenAI. A io.net serve um endpoint compatível com OpenAI (`https://api.intelligence.io.solutions/api/v1`), então registre-o uma vez e cada chave que você criou se torna uma conexão sob um nó de provedor — o OmniRoute faz balanceamento de carga entre elas:

```bash
node src/connect-omniroute.js \
  --base http://localhost:20128 --password 123456 \
  --api-key io-v2-xxxxxxxx
```

Execute sem `--api-key` para registrar **todas** as chaves em `keys.txt`. Reexecutar é idempotente: o nó é correspondido por `--prefix ionet`, cada conexão é correspondida por nome (`ionet-001`, `ionet-002`, …), e uma chave já registrada é deixada em paz. Padrões: `--base http://localhost:20128`, `--password 123456`, `--name "IO Intelligence"`, `--prefix ionet`, `--base-url https://api.intelligence.io.solutions/api/v1`, `--model google/gemma-4-26b-a4b-it`.

No OmniRoute o catálogo é servido como:

```
ionet/google/gemma-4-26b-a4b-it
ionet/deepseek-ai/DeepSeek-V4.1-Flash
ionet/zai-org/GLM-5.3-Flash
```

`node src/cli.js mint --target 5 --pick --connect-omniroute` cria e registra em uma única passagem, e `node src/launcher.js` conduz o mesmo fluxo a partir do seu menu.
## 🔑 O que uma chave lhe dá

| | |
| --- | --- |
| 🏢 Provedor | **IO Intelligence** — [io.net](https://io.net) |
| 🎁 O que o provedor oferece | 39 modelos listados — o nível gratuito restringe a maioria dos ids a 402; google/gemma-4-26b-a4b-it é o verificador do nível gratuito |
| 🔑 O que uma chave lhe dá | uma chave de API limitada à sua própria conta: os 39 ids de modelos no endpoint abaixo, nos limites do seu plano. A cota fica na **conta**, que é exatamente por isso que esta ferramenta cria uma conta por chave |
| 🌐 Formato da API | Compatível com OpenAI: `POST https://api.intelligence.io.solutions/api/v1/chat/completions` |
| 🔒 Seus dados | apenas a io.net e o backend de caixa de correio que você configurar são contatados; as chaves ficam na sua máquina |

## 🐞 Problemas

Abra uma issue com a etapa que falhou, a tag/tentativa, a saída usada e o final do trace (`lane-<TAG>-trace.log`) — capturas de tela e despejos de estado em `out/` tornam as falhas reproduzíveis sem vazar uma chave. **[Abra uma issue](../../issues)** com o comando que você executou e a saída exata; PRs são bem-vindos. Se o portão de nível do provedor ainda encaminhar para `402 requires a higher IO Intelligence tier`, a ferramenta para nesse modelo e o informa — o catálogo restrito é conforme medido.

## 📄 Licença

MIT © 2026 — veja [LICENSE](LICENSE).

<div align="center">

**[MIT](LICENSE)** © 2026 ionet-bulk-apikey contributors

</div>