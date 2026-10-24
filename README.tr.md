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

**Otomatik oluşturulan API anahtarlarıyla toplu IO Intelligence (io.net) hesabı oluşturun — OpenAI uyumlu çıkarım + 9Router bağlayıcısı.**

[![Node](https://img.shields.io/badge/Node-%E2%89%A518-3DA639?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![Dependencies](https://img.shields.io/badge/dependencies-0-blue?style=for-the-badge)](#)
[![License](https://img.shields.io/badge/license-MIT-6ea8fe?style=for-the-badge)](LICENSE)
[![Models](https://img.shields.io/badge/models-39%20served-412991?style=for-the-badge)](https://io.net)
[![9Router](https://img.shields.io/badge/9Router-connector-8B5CF6?style=for-the-badge)](#-connect-to-9router)
[![OmniRoute](https://img.shields.io/badge/OmniRoute-connector-8B5CF6?style=for-the-badge)](#-connect-to-omniroute)
[![X](https://img.shields.io/badge/X-%40bigbullapp-000000?style=for-the-badge&logo=x&logoColor=white)](https://x.com/bigbullapp)

[🛠 Hızlı başlangıç](#-quick-start) · [🎁 Ücretsiz katman](#-free-tier--how-much-you-get) · [🤖 Modeller](#-models--all-39-of-them) · [🧪 API'yi kullan](#-how-to-use-the-api) · [✅ Doğrulandı](#-verified-working--every-key-is-tested) · [🧭 Nasıl çalışır](#-how-it-works) · [🔌 9Router](#-connect-to-9router) · [🔌 OmniRoute](#-connect-to-omniroute) · [⚙️ Seçenekler](#️-cli-options) · [🛰️ Proxy'ler](#️-behind-a-proxy) · [🐞 Sorunlar](#-issues)

</div>

<div align="center">

**English** · [Türkçe](README.tr.md) · [中文](README.cn.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Русский](README.ru.md) · [Português](README.pt.md)

</div>

---

## ✨ Bu neden var

io.net (IO Intelligence) her hesaba API erişimi verir ve kullanışlı birim *anahtar başına bir hesaptır*. Kayıt tek bir barındırılan sayfadır: e-posta adresi, postayla gelen tek kullanımlık kod ve bir API anahtarı uç noktası. Bu araç tüm yolu yürür — sayfanın gerektirdiği yerde gerçek bir tarayıcı, geri kalan her şey için düz HTTP — ve bir anahtarı ancak gerçek bir tamamlama sonrasında kaydeder:

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

> **Durum notu (2026-10-18):** depo, hattın öldüğüne inanıldığı için aynı gün erken saatlerde arşivlenmişti; akşam yapılan yeniden denetim bunu yeniden doğruladı — diskteki havuz üzerinde canlı bir tarama gerçek sohbet tamamlamalarına yanıt verdi (`google/gemma-4-26b-a4b-it` → 200 `"pong"`) ve `id.io.net/login` hattı `200` yanıtı verdi. Depo yeniden **aktif**. Kayıtlar sağlayıcı tarafından hız sınırına tabidir ve doğrulamalar insan denetimlidir; ölçek bu kapılar tarafından sınırlanır.

## 🎁 Ücretsiz katman — ne kadar alırsınız

**Ücretsiz bir hesabın gerçekte çağırabildiği şey:** katalog her anahtara *listelenir*, ancak üretim, hesap katmanına göre model başına kapılıdır. Bu kimliklerden 24'ü üzerinde ücretsiz katman anahtarıyla ölçüldüğünde, tam olarak biri bir tamamlamaya yanıt verdi — **`google/gemma-4-26b-a4b-it`** (`200`, gerçek bir asistan mesajı; bir akıl yürütme modelidir, bu nedenle metin `reasoning_content` içinde gelebilir). Diğer tüm kimlikler `402 {"note":"Model '<id>' requires a higher IO Intelligence tier"}` yanıtı verdi.

| Ne | Değer |
| --- | --- |
| Anahtar başına katalog | `GET /v1/models` üzerinde **39 kimlik** ([`models.json`](models.json) içinde yakalandı) |
| Ücretsiz katman doğrulayıcısı | `google/gemma-4-26b-a4b-it` — gerçek içerikle **200** |
| Ücretsiz katmandaki diğer kimlikler | yükseltilene kadar `402 requires a higher IO Intelligence tier` |
| Model başına meta veri | her model `min_access_tier` (1–3) ve `higher_tier_required` taşır |
| Kayıt | `id.io.net/login` (e-posta → kod → `magic-auth/verify` → `accessToken` → `POST /v1/api-keys`) |
| Ölçeklenen birim | **bir hesap = bir anahtar** → `--target N`, N hesap/anahtar demektir |

> 💡 Ücretsiz katman IO Intelligence tarafından belirlenir ve değişebilir. Canlı sayıları [io.net](https://io.net) adresinden kontrol edin — ve kararı aracın kendi kapısına bırakın:

```bash
node src/cli.js verify --proxy socks5://127.0.0.1:1080     # every key is re-tested (models + chat) through one exit
```

## 🤖 Modeller — 39'unun tamamı

`GET https://api.intelligence.io.solutions/api/v1/models`, geçerli herhangi bir anahtar için **39 model kimliği** yanıtlar; bunlar arasında:

`deepseek-ai/DeepSeek-V4.1-Flash` · `deepseek-ai/DeepSeek-V4-Pro` · `zai-org/GLM-5.3` · `zai-org/GLM-5.3-Flash` · `XiaomiMiMo/MiMo-V2.6-Flash` · `moonshotai/Kimi-K3` · `MiniMaxAI/MiniMax-M2.7` · `Qwen/Qwen3.8-27B` · `openai/gpt-oss-120b` · `deepseek-ai/DeepSeek-R1-0528` · `google/gemma-4-26b-a4b-it`

Ölçülen ücretsiz katman kapsamı:

|Model|✓|
|---|---|
|`google/gemma-4-26b-a4b-it`|✓|
|`nvidia/nemotron-3.5-lightning`|✓|

2026-10-19 canlı yeniden kontrol (5 anahtar × 4 çıkış): `nvidia/nemotron-3.5-lightning` 20/20 yoklamada `200` yanıtı verdi; 39 kimlikli kataloğun geri kalanı `402 requires a higher IO Intelligence tier` yanıtı veriyor.

39 kimliğin tamamı [`models.json`](models.json) içinde. Bir anahtarın canlı yoklaması (doğrulayıcının tam olarak yaptığı şey):

```bash
curl https://api.intelligence.io.solutions/api/v1/chat/completions \
  -H "Authorization: Bearer io-v2-…" -H "Content-Type: application/json" \
  -d '{"model":"google/gemma-4-26b-a4b-it","messages":[{"role":"user","content":"hi"}]}'
```

## 🧪 API nasıl kullanılır

Temel URL **`https://api.intelligence.io.solutions/api/v1`** — OpenAI uyumlu.

**Herhangi bir SDK / curl**

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

## ⚡ Tek komut

```bash
node src/cli.js --count N      # mint N keys — exit screen, browser, HTTP finish, one account at a time
node src/cli.js --dry          # print the resolved plan: writes nothing, sends nothing
```

`--auto` varsayılandır: üretim yolu sizden hiçbir token, captcha yanıtı veya proxy sorusu istemez. CLI'nin yanındaki bir `proxies.txt` otomatik olarak kullanılır (aksi halde araç doğrudan gider) ve etkileşimli menü (`node src/launcher.js`) aynı görevleri sarar.

> ⚠️ **Koşullar ve hesap riski.** Bir sağlayıcıyı otomatikleştirmek, Hizmet Şartlarını ihlal edebilir ve hesapların veya IP'lerin yasaklanmasına yol açabilir. Bunu kendi makinenizden, sahip olduğunuz hesaplar üzerinde, kendi riskinizle çalıştırırsınız; araç yalnızca sitenin kendi kayıt sayfasını sürer ve ücretli bir kapıyı asla atlamaz. Büyük bir kampanyadan önce sağlayıcının ToS'unu okuyun.

## 🛠 Hızlı başlangıç

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

**Doğrulama sizin tarafınızdan yanıtlanır:** her tur `solve-<tag>/round-N.png` + `state.json` olarak dökülür ve siz tıklanacak kutucukları listeleyen `solve-<tag>/clicks.json` dosyasını yazarsınız — araç bunlara tıklar, widget'ı yeniden okur ve devam eder.

### 🖱️ Başlatıcı

`src/launcher.js`, mint / verify / screen ve 9Router üzerindeki etkileşimli menüdür. Diğer depolar ile aynı banner/menü şekline sahiptir ve `src/cli.js` görevlerine delege eder. `node src/launcher.js --connect-9router`, anahtarları yerel bir 9Router'a kaydeder.

## ✅ Çalıştığı doğrulandı — her anahtar test edilir

> **Kalite kapıları.** Buradaki her anahtar, `keys.txt` dosyasına yazılmadan önce canlı bir `chat-200` geçti
> (ölü anahtarlar asla gönderilmez). Router kombinasyonları model düzeyinde aynı kuralı izler: bir giriş
> **yalnızca model `chat-200` yanıtlıyorsa ve araçları çağırabiliyorsa** eklenir — araç desteği olmayan bir model,
> ölü bir anahtar veya ölü bir sağlayıcı eklenmek yerine çıkarılır. **9Router ve OmniRoute** ile çalışır.

Bir anahtar, `keys.txt` dosyasına ancak canlı API onunla yanıt verdikten sonra yazılır:

| kontrol | çağrı | beklenen |
| --- | --- | --- |
| kimlik doğrulama + model listesi | `GET https://api.intelligence.io.solutions/api/v1/models` | `200` + hesabın model kimlikleri (39) |
| gerçek tamamlama | `POST …/chat/completions` (`google/gemma-4-26b-a4b-it`) | `200` + boş olmayan bir asistan mesajı |

```bash
node src/cli.js verify --proxy socks5://127.0.0.1:1080    # re-runs both checks over every key and reports a per-key verdict
```

Sürücü, eklediği her anahtar üzerinde aynı kontrolü yapar. `google/gemma-4-26b-a4b-it` bir akıl yürütme modelidir — metin `reasoning_content` içinde gelebilir.

> ionet engellenen sağlayıcılar listesindedir — doğrulama şekli ölçüldüğü gibidir; sağlayıcı tarafı katmanlandırma geçerlidir.

## 🧭 Nasıl çalışır

```
inbox (one address per account)                                  a fresh address per account
   │
   ├─▶ sign-up: IO Intelligence page → e-mail address → code / link from the inbox
   ├─▶ session: the account's cookies or access token in hand
   ├─▶ key mint: the account's key endpoint → plaintext key returned once (written to disk immediately)
   └─▶ live proof: POST https://api.intelligence.io.solutions/api/v1/chat/completions → real content = the key is live
```

Hesap başına bir Chrome (tarayıcı aşaması) + bir HTTP ayağı:

1. **Tarayıcı aşaması** (`run-account.js --until start`): gezin, yeni bir posta kutusu adresi girin, doğrulama turlarını `clicks.json` dosyanızdan yanıtlayın, gönderin. `POST /api/workos/magic-auth/start` yanıt verdiği anda hesabın gelen kutusu + token'ı `handoff.json` dosyasına yazılır ve **Chrome hemen kapanır** — tarayıcının işi bitmiştir.
2. **HTTP ayağı** (`http-finish.js`): posta kutusundan tek kullanımlık kodu okuyun, `magic-auth/verify` → `accessToken` çağırın, anahtarı oluşturun (`POST /v1/api-keys/`), canlı doğrulayın, `keys.txt` + `accounts.json` dosyalarına ekleyin.
3. **Sürücü** (`lane.js`): denemeler üzerinde seri bir döngü — yeni bir havuz çıkışı seçer, kullanım anında ön kontrol yapar, tarayıcı aşamasını çalıştırır, gönderimden önce kesilen denemeleri otomatik kurtarır, HTTP ayağını token'ın ömrü içinde çalıştırır, başarısız olan çıkışları kara listeye alır ve yeniden seçer. `lane-<TAG>.jsonl` her denemeyi kaydeder.

Bilmeye değer iki ayar: API anahtarı `project: "io-intelligence"` ile oluşturulmalıdır (araç bunu sizin için yapar) ve tarayıcının devrettiği erişim token'ı **5 dakika** yaşar — bu tam olarak tarayıcı aşamasının sayfa içinde bitirmek yerine HTTP'ye devretmesinin nedenidir.

## ⚙️ CLI seçenekleri

| araç | bayraklar |
| --- | --- |
| `cli.js` | `mint` · `finish` · `verify` · `screen` — her görev kendi bayraklarını yazdırır (`node src/lane.js --help`) |
| `lane.js` | `--tag` (L) · `--port` (9411) · `--target N` (5) · `--preset turbo\|balanced\|safe` (tempo aralığı) · `--gap S` · `--pick` (deneme başına yeni havuz çıkışı) veya `--proxy <line>` (sabit çıkış) · `--direct` (hiç proxy yok) · `--max-attempts N` · `--union-file` / `--new-file` |
| `run-account.js` | `--tag` · `--port` · `--until start\|email\|otp\|key` · `--proxy <line>` · `--broker <url>` · `--solve-dir` · `--solve-budget-ms` · `--round-wait-ms` · `--otp-timeout-ms` · `--email` / `--email-token` (bir gelen kutusunu sürdür) |
| `http-finish.js` | `--email` + `--box-token`, veya `--token <accessToken>` / `--token-file`, veya `--from-log <net.jsonl>` · `--name` · `--model` · `--otp-timeout-ms` |
| 9Router | herhangi bir görevde `--connect-9router` — görev bittikten sonra `keys.txt` içindeki her anahtarı çalışan bir 9Router'a kaydeder (`node src/connect-9router.js --help`) |

Turbo önerilir (5); daha fazlası zayıf bilgisayarda yük/ban riski.

## 🛰️ Proxy arkasında

**İsteğe bağlı — ölçekte önerilir (IP başına sınırlar, yasaklar).** Araç proxy olmadan da çalışır.

- **Havuzla:** çıkışlar bir metin havuzundan gelir (çıkış başına bir satır, `scheme://host:port`); her deneme yeni bir çıkış ve kullanım anında bir ön kontrol alır ve başarısız bir deneme üreten çıkışlar hat başına kara listeye alınır.
- **Havuz olmadan:** seçilecek bir şey yoktur — hat kendiliğinden DIRECT moduna geçer (veya `--direct` ile zorlayın); Chrome bağlamı tünelsiz açılır ve her istek — tarayıcı, kod okuma, anahtar oluşturma, doğrulama — bu makineden doğrudan çıkar.
- reCAPTCHA uygulama betiği sayfaya yerel bir önbellekten sunulur, bu nedenle bir çıkışın tarayıcı aşaması için yalnızca `id.io.net` ve `www.google.com` adreslerine ulaşması gerekir.
- Posta kutusu broker'ı loopback (`127.0.0.1`) üzerinde çalışır — o sizindir, sağlayıcının değil ve posta kimlik bilgilerinizi tutar, asla depoyu değil.

## 📄 Dosyalar

| Yol | İçerik |
| --- | --- |
| `keys.txt` | anahtarlar, **her satırda bir tane**, bir anahtar canlı kontrolü geçtiği anda eklenir — git tarafından yok sayılır |
| `accounts.json` | hesap başına bir kayıt: posta kutusu, anahtar, onu üreten çıkış — git tarafından yok sayılır |
| [`models.json`](models.json) | üretilen bir anahtarın yanıtladığı şekliyle `GET /v1/models` (39 kimlik) |
| `out/` | deneme başına dökümler (ekran görüntüleri + DOM/ağ günlükleri), toplu günlük, çıkış kayıtları — git tarafından yok sayılır |
| `proxies.txt` | çıkış havuzunuz, her satırda bir proxy (isteğe bağlı) — git tarafından yok sayılır |

## 🔌 9Router'a bağlan

[9Router](https://9router.com) kendi kendine barındırılan, OpenAI uyumlu bir yönlendiricidir. io.net, OpenAI uyumlu bir uç nokta sunar (`https://api.intelligence.io.solutions/api/v1`), bu nedenle bir kez kaydedin ve ürettiğiniz her anahtar tek bir sağlayıcı düğümü altında bir bağlantı haline gelir — 9Router bunlar arasında yük dengeler:

```bash
node src/connect-9router.js \
  --base http://localhost:20128 --password 123456 \
  --api-key io-v2-xxxxxxxx
```

`--api-key` olmadan çalıştırın, `keys.txt` içindeki **her** anahtarı kaydetmek için. Yeniden çalıştırma idempotenttir: düğüm `--prefix ionet` ile eşleştirilir, her bağlantı adıyla eşleştirilir (`ionet-001`, `ionet-002`, …) ve zaten kayıtlı bir anahtar olduğu gibi bırakılır. Varsayılanlar: `--base http://localhost:20128`, `--password 123456`, `--name "IO Intelligence"`, `--prefix ionet`, `--base-url https://api.intelligence.io.solutions/api/v1`, `--model google/gemma-4-26b-a4b-it`.

9Router'da katalog şu şekilde sunulur:

```
ionet/google/gemma-4-26b-a4b-it
ionet/deepseek-ai/DeepSeek-V4.1-Flash
ionet/zai-org/GLM-5.3-Flash
```

`node src/cli.js mint --target 5 --pick --connect-9router` tek geçişte üretir ve kaydeder ve `node src/launcher.js` aynı akışı menüsünden yürütür.

## 🔌 OmniRoute'a bağlan

[OmniRoute](https://omniroute.online) kendi kendine barındırılan, OpenAI uyumlu bir yönlendiricidir. io.net, OpenAI uyumlu bir uç nokta sunar (`https://api.intelligence.io.solutions/api/v1`), bu nedenle bir kez kaydedin ve ürettiğiniz her anahtar tek bir sağlayıcı düğümü altında bir bağlantı haline gelir — OmniRoute bunlar arasında yük dengeler:

```bash
node src/connect-omniroute.js \
  --base http://localhost:20128 --password 123456 \
  --api-key io-v2-xxxxxxxx
```

`--api-key` olmadan çalıştırın, `keys.txt` içindeki **her** anahtarı kaydetmek için. Yeniden çalıştırma idempotenttir: düğüm `--prefix ionet` ile eşleştirilir, her bağlantı adıyla eşleştirilir (`ionet-001`, `ionet-002`, …) ve zaten kayıtlı bir anahtar olduğu gibi bırakılır. Varsayılanlar: `--base http://localhost:20128`, `--password 123456`, `--name "IO Intelligence"`, `--prefix ionet`, `--base-url https://api.intelligence.io.solutions/api/v1`, `--model google/gemma-4-26b-a4b-it`.

OmniRoute'ta katalog şu şekilde sunulur:

```
ionet/google/gemma-4-26b-a4b-it
ionet/deepseek-ai/DeepSeek-V4.1-Flash
ionet/zai-org/GLM-5.3-Flash
```

`node src/cli.js mint --target 5 --pick --connect-omniroute` tek geçişte üretir ve kaydeder ve `node src/launcher.js` aynı akışı menüsünden yürütür.
## 🔑 Bir anahtar size ne kazandırır

| | |
| --- | --- |
| 🏢 Sağlayıcı | **IO Intelligence** — [io.net](https://io.net) |
| 🎁 Sağlayıcının verdikleri | 39 model listelenir — ücretsiz katman çoğu kimliği 402'ye kapılar; google/gemma-4-26b-a4b-it ücretsiz katman doğrulayıcısıdır |
| 🔑 Bir anahtar size ne kazandırır | kendi hesabına kapsanmış bir API anahtarı: aşağıdaki uç noktada 39 model kimliği, planınızın sınırlarında. Kota **hesapta** yaşar, bu tam olarak bu aracın neden anahtar başına bir hesap oluşturduğunun nedenidir |
| 🌐 API şekli | OpenAI uyumlu: `POST https://api.intelligence.io.solutions/api/v1/chat/completions` |
| 🔒 Verileriniz | yalnızca io.net ve yapılandırdığınız gelen kutusu arka ucuna bağlantı kurulur; anahtarlar makinenizde kalır |

## 🐞 Sorunlar

Başarısız adım, etiket/deneme, kullanılan çıkış ve iz kuyruğu (`lane-<TAG>-trace.log`) ile bir sorun açın — `out/` altındaki ekran görüntüleri ve durum dökümleri, bir anahtarı sızdırmadan hataları yeniden üretilebilir kılar. Çalıştırdığınız komut ve tam çıktı ile **[bir sorun açın](../../issues)**; PR'lar memnuniyetle karşılanır. Sağlayıcının katman kapısı hâlâ `402 requires a higher IO Intelligence tier` yönlendiriyorsa, araç o modelde durur ve bunu söyler — kapılı katalog ölçüldüğü gibidir.

## 📄 Lisans

MIT © 2026 — bkz. [LICENSE](LICENSE).

<div align="center">

**[MIT](LICENSE)** © 2026 ionet-bulk-apikey katkıda bulunanlar

</div>