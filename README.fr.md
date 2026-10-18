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

**Créer en masse des comptes IO Intelligence (io.net) avec des clés API générées automatiquement — inférence compatible OpenAI + connecteur 9Router.**

[![Node](https://img.shields.io/badge/Node-%E2%89%A518-3DA639?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![Dependencies](https://img.shields.io/badge/dependencies-0-blue?style=for-the-badge)](#)
[![License](https://img.shields.io/badge/license-MIT-6ea8fe?style=for-the-badge)](LICENSE)
[![Models](https://img.shields.io/badge/models-39%20served-412991?style=for-the-badge)](https://io.net)
[![9Router](https://img.shields.io/badge/9Router-connector-8B5CF6?style=for-the-badge)](#-connect-to-9router)
[![X](https://img.shields.io/badge/X-%40bigbullapp-000000?style=for-the-badge&logo=x&logoColor=white)](https://x.com/bigbullapp)

[🛠 Démarrage rapide](#-quick-start) · [🎁 Niveau gratuit](#-free-tier--how-much-you-get) · [🤖 Modèles](#-models--all-39-of-them) · [🧪 Utiliser l'API](#-how-to-use-the-api) · [✅ Vérifié](#-verified-working--every-key-is-tested) · [🧭 Comment ça marche](#-how-it-works) · [🔌 9Router](#-connect-to-9router) · [⚙️ Options](#️-cli-options) · [🛰️ Proxys](#️-behind-a-proxy) · [🐞 Problèmes](#-issues)

</div>

<div align="center">

**English** · [Türkçe](README.tr.md) · [中文](README.cn.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Русский](README.ru.md) · [Português](README.pt.md)

</div>


---

## ✨ Pourquoi ce projet existe

io.net (IO Intelligence) donne à chaque compte un accès API, et l'unité utile est *un compte par clé*. L'inscription tient sur une seule page hébergée : adresse e-mail, un code à usage unique par e-mail, et un point de terminaison de clé API. Cet outil parcourt tout le chemin — un vrai navigateur là où la page l'exige, du HTTP simple pour tout le reste — et n'enregistre une clé qu'après une complétion réelle :

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

> **Note de statut (2026-10-18) :** le dépôt a été archivé plus tôt le même jour alors que le rail était cru mort ; une ré-audit en soirée l'a re-vérifié — un balayage en direct du pool sur disque a répondu à de vraies complétions de chat (`google/gemma-4-26b-a4b-it` → 200 `"pong"`) et le rail `id.io.net/login` a répondu `200`. Le dépôt est de nouveau **actif**. Les inscriptions sont limitées en débit par le fournisseur et les défis sont contrôlés par des humains ; l'échelle est plafonnée par ces barrières.

## 🎁 Niveau gratuit — ce que vous obtenez

**Ce qu'un compte gratuit peut réellement appeler :** le catalogue est *listé* pour chaque clé, mais la génération est contrôlée par modèle selon le niveau du compte. Mesuré avec une clé de niveau gratuit sur 24 de ces identifiants, un seul a répondu à une complétion — **`google/gemma-4-26b-a4b-it`** (`200`, un vrai message d'assistant ; c'est un modèle de raisonnement, donc le texte peut arriver dans `reasoning_content`). Tous les autres identifiants ont répondu `402 {"note":"Model '<id>' requires a higher IO Intelligence tier"}`.

| Quoi | Valeur |
| --- | --- |
| Catalogue par clé | **39 identifiants** sur `GET /v1/models` (capturés dans [`models.json`](models.json)) |
| Vérificateur du niveau gratuit | `google/gemma-4-26b-a4b-it` — **200** avec du contenu réel |
| Autres identifiants en niveau gratuit | `402 requires a higher IO Intelligence tier` jusqu'à mise à niveau |
| Métadonnées par modèle | chaque modèle porte `min_access_tier` (1–3) et `higher_tier_required` |
| Inscription | `id.io.net/login` (e-mail → code → `magic-auth/verify` → `accessToken` → `POST /v1/api-keys`) |
| L'unité qui monte en échelle | **un compte = une clé** → `--target N` correspond à N comptes/clés |

> 💡 Le niveau gratuit est défini par IO Intelligence et peut changer. Vérifiez les chiffres en direct sur [io.net](https://io.net) — et laissez la barrière de l'outil décider :

```bash
node src/cli.js verify --proxy socks5://127.0.0.1:1080     # every key is re-tested (models + chat) through one exit
```

## 🤖 Modèles — les 39

`GET https://api.intelligence.io.solutions/api/v1/models` répond **39 identifiants de modèles** pour toute clé valide, notamment :

`deepseek-ai/DeepSeek-V4.1-Flash` · `deepseek-ai/DeepSeek-V4-Pro` · `zai-org/GLM-5.3` · `zai-org/GLM-5.3-Flash` · `XiaomiMiMo/MiMo-V2.6-Flash` · `moonshotai/Kimi-K3` · `MiniMaxAI/MiniMax-M2.7` · `Qwen/Qwen3.8-27B` · `openai/gpt-oss-120b` · `deepseek-ai/DeepSeek-R1-0528` · `google/gemma-4-26b-a4b-it`

Couverture mesurée du niveau gratuit :

|Modèle|✓|
|---|---|
|`google/gemma-4-26b-a4b-it`|✓|

Les 39 identifiants complets sont dans [`models.json`](models.json). Sonde en direct d'une clé (exactement ce que fait le vérificateur) :

```bash
curl https://api.intelligence.io.solutions/api/v1/chat/completions \
  -H "Authorization: Bearer io-v2-…" -H "Content-Type: application/json" \
  -d '{"model":"google/gemma-4-26b-a4b-it","messages":[{"role":"user","content":"hi"}]}'
```

## 🧪 Comment utiliser l'API

L'URL de base est **`https://api.intelligence.io.solutions/api/v1`** — compatible OpenAI.

**N'importe quel SDK / curl**

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

## 🛠 Démarrage rapide

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

**Le défi est résolu de votre côté :** chaque manche est exportée sous `solve-<tag>/round-N.png` + `state.json`, et vous écrivez `solve-<tag>/clicks.json` listant les tuiles à cliquer — l'outil les clique, relit le widget et continue.

### 🖱️ Le lanceur

`src/launcher.js` est le menu interactif au-dessus de mint / verify / screen et 9Router. Il a la même forme de bannière/menu que les autres dépôts et délègue aux tâches de `src/cli.js`. `node src/launcher.js --connect-9router` enregistre les clés dans un 9Router local.

## ✅ Vérifié fonctionnel — chaque clé est testée

Une clé n'est écrite dans `keys.txt` qu'après que l'API en direct a répondu avec elle :

| vérification | appel | attendu |
| --- | --- | --- |
| auth + liste des modèles | `GET https://api.intelligence.io.solutions/api/v1/models` | `200` + les identifiants de modèles du compte (39) |
| complétion réelle | `POST …/chat/completions` (`google/gemma-4-26b-a4b-it`) | `200` + un message d'assistant non vide |

```bash
node src/cli.js verify --proxy socks5://127.0.0.1:1080    # re-runs both checks over every key and reports a per-key verdict
```

Le pilote effectue la même vérification sur chaque clé qu'il ajoute. `google/gemma-4-26b-a4b-it` est un modèle de raisonnement — le texte peut arriver dans `reasoning_content`.

> ionet figure sur la liste des fournisseurs bloqués — la forme de vérification est telle que mesurée ; la hiérarchisation côté fournisseur s'applique.

## 🧭 Comment ça marche

```
inbox (one address per account)                                  a fresh address per account
   │
   ├─▶ sign-up: IO Intelligence page → e-mail address → code / link from the inbox
   ├─▶ session: the account's cookies or access token in hand
   ├─▶ key mint: the account's key endpoint → plaintext key returned once (written to disk immediately)
   └─▶ live proof: POST https://api.intelligence.io.solutions/api/v1/chat/completions → real content = the key is live
```

Par compte, un Chrome (phase navigateur) + une étape HTTP :

1. **Phase navigateur** (`run-account.js --until start`) : naviguer, saisir une adresse de boîte aux lettres fraîche, répondre aux manches de défi depuis votre `clicks.json`, soumettre. Dès que `POST /api/workos/magic-auth/start` répond, la boîte de réception + le jeton du compte sont écrits dans `handoff.json` et **Chrome se ferme immédiatement** — le travail du navigateur est terminé.
2. **Étape HTTP** (`http-finish.js`) : lire le code à usage unique depuis la boîte aux lettres, appeler `magic-auth/verify` → `accessToken`, créer la clé (`POST /v1/api-keys/`), la vérifier en direct, l'ajouter à `keys.txt` + `accounts.json`.
3. **Pilote** (`lane.js`) : une boucle série sur les tentatives — choisit une sortie de pool fraîche, la pré-vérifie au moment de l'usage, exécute la phase navigateur, récupère automatiquement les tentatives interrompues avant la soumission, exécute l'étape HTTP dans la durée de vie du jeton, met en liste noire les sorties ayant échoué, et re-choisit. `lane-<TAG>.jsonl` enregistre chaque tentative.

Deux réglages à connaître : la clé API doit être créée avec `project: "io-intelligence"` (l'outil le fait pour vous), et le jeton d'accès transmis par le navigateur vit **5 minutes** — c'est exactement pourquoi la phase navigateur passe la main au HTTP au lieu de terminer dans la page.

## ⚙️ Options CLI

| outil | options |
| --- | --- |
| `cli.js` | `mint` · `finish` · `verify` · `screen` — chaque tâche affiche ses propres options (`node src/lane.js --help`) |
| `lane.js` | `--tag` (L) · `--port` (9411) · `--target N` (5) · `--preset turbo\|balanced\|safe` (intervalle de rythme) · `--gap S` · `--pick` (sortie de pool fraîche par tentative) ou `--proxy <line>` (sortie fixe) · `--max-attempts N` · `--union-file` / `--new-file` |
| `run-account.js` | `--tag` · `--port` · `--until start\|email\|otp\|key` · `--proxy <line>` · `--broker <url>` · `--solve-dir` · `--solve-budget-ms` · `--round-wait-ms` · `--otp-timeout-ms` · `--email` / `--email-token` (reprendre une boîte de réception) |
| `http-finish.js` | `--email` + `--box-token`, ou `--token <accessToken>` / `--token-file`, ou `--from-log <net.jsonl>` · `--name` · `--model` · `--otp-timeout-ms` |
| 9Router | `--connect-9router` sur n'importe quelle tâche — une fois terminée, enregistre chaque clé de `keys.txt` dans un 9Router en cours d'exécution (`node src/connect-9router.js --help`) |

Turbo önerilir (5); daha fazlası zayıf bilgisayarda yük/ban riski.

## 🛰️ Derrière un proxy

* Les sorties proviennent d'un pool texte (une ligne par sortie, `scheme://host:port`) ; chaque tentative reçoit une sortie fraîche et une pré-vérification au moment de l'usage, et les sorties ayant produit une tentative échouée sont mises en liste noire par voie.
* Chaque appel au fournisseur — le navigateur, la lecture du code, la création de la clé, la vérification — passe par le pool ; rien n'est envoyé depuis votre propre adresse.
* Le script d'implémentation du reCAPTCHA est servi à la page depuis un cache local, donc une sortie n'a besoin d'atteindre que `id.io.net` et `www.google.com` pour la phase navigateur.
* Le broker de boîte aux lettres tourne sur loopback (`127.0.0.1`) — il est à vous, pas au fournisseur, et il détient vos identifiants de messagerie, jamais le dépôt.

## 📄 Fichiers

| Chemin | Contenu |
| --- | --- |
| `keys.txt` | les clés, **une par ligne**, ajoutées dès qu'une clé passe la vérification en direct — ignoré par git |
| `accounts.json` | un enregistrement par compte : boîte aux lettres, clé, la sortie qui l'a créé — ignoré par git |
| [`models.json`](models.json) | `GET /v1/models` tel que répondu par une clé créée (39 identifiants) |
| `out/` | vidages par tentative (captures d'écran + journaux DOM/réseau), journal de lot, comptabilité des sorties — ignoré par git |
| `proxies.txt` | votre pool de sorties, un proxy par ligne — ignoré par git |

## 🔌 Connexion à 9Router

[9Router](https://9router.com) est un routeur auto-hébergé, compatible OpenAI. io.net sert un point de terminaison compatible OpenAI (`https://api.intelligence.io.solutions/api/v1`), donc enregistrez-le une fois et chaque clé que vous avez créée devient une connexion sous un seul nœud fournisseur — 9Router répartit la charge entre elles :

```bash
node src/connect-9router.js \
  --base http://localhost:20128 --password 123456 \
  --api-key io-v2-xxxxxxxx
```

Exécutez-le sans `--api-key` pour enregistrer **toutes** les clés de `keys.txt`. La ré-exécution est idempotente : le nœud est mis en correspondance par `--prefix ionet`, chaque connexion est mise en correspondance par nom (`ionet-001`, `ionet-002`, …), et une clé déjà enregistrée est laissée telle quelle. Valeurs par défaut : `--base http://localhost:20128`, `--password 123456`, `--name "IO Intelligence"`, `--prefix ionet`, `--base-url https://api.intelligence.io.solutions/api/v1`, `--model google/gemma-4-26b-a4b-it`.

Dans 9Router, le catalogue est servi comme :

```
ionet/google/gemma-4-26b-a4b-it
ionet/deepseek-ai/DeepSeek-V4.1-Flash
ionet/zai-org/GLM-5.3-Flash
```

`node src/cli.js mint --target 5 --pick --connect-9router` crée et enregistre en une seule passe, et `node src/launcher.js` pilote le même flux depuis son menu.

## 🔑 Ce qu'une clé vous donne

| | |
| --- | --- |
| 🏢 Fournisseur | **IO Intelligence** — [io.net](https://io.net) |
| 🎁 Ce que le fournisseur donne | 39 modèles listés — le niveau gratuit limite la plupart des identifiants à 402 ; google/gemma-4-26b-a4b-it est le vérificateur du niveau gratuit |
| 🔑 Ce qu'une clé vous donne | une clé API limitée à son propre compte : les 39 identifiants de modèles sur le point de terminaison ci-dessous, aux limites de votre forfait. Le quota vit sur le **compte**, ce qui est exactement pourquoi cet outil crée un compte par clé |
| 🌐 Forme de l'API | Compatible OpenAI : `POST https://api.intelligence.io.solutions/api/v1/chat/completions` |
| 🔒 Vos données | seuls io.net et le backend de boîte aux lettres que vous configurez sont contactés ; les clés restent sur votre machine |

## 🐞 Problèmes

Ouvrez un ticket avec l'étape en échec, le tag/la tentative, la sortie utilisée et la fin de la trace (`lane-<TAG>-trace.log`) — les captures d'écran et les vidages d'état sous `out/` rendent les échecs reproductibles sans divulguer de clé. **[Ouvrir un ticket](../../issues)** avec la commande exécutée et la sortie exacte ; les PR sont bienvenues. Si la barrière de niveau du fournisseur route encore vers `402 requires a higher IO Intelligence tier`, l'outil s'arrête à ce modèle et le signale — le catalogue restreint est tel que mesuré.

## 📄 Licence

MIT © 2026 — voir [LICENSE](LICENSE).

<div align="center">

**[MIT](LICENSE)** © 2026 ionet-bulk-apikey contributors

</div>