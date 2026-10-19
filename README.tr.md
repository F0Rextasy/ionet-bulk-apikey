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

**Otomatik oluşturulan API anahtarlarıyla toplu IO Intelligence (io.net) hesapları oluşturun — OpenAI uyumlu çıkarım + 9Router bağlayıcısı.**

[![Node](https://img.shields.io/badge/Node-%E2%89%A518-3DA639?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![Dependencies](https://img.shields.io/badge/dependencies-0-blue?style=for-the-badge)](#)
[![License](https://img.shields.io/badge/license-MIT-6ea8fe?style=for-the-badge)](LICENSE)
[![Models](https://img.shields.io/badge/models-39%20served-412991?style=for-the-badge)](https://io.net)
[![9Router](https://img.shields.io/badge/9Router-connector-8B5CF6?style=for-the-badge)](#-connect-to-9router)
[![X](https://img.shields.io/badge/X-%40bigbullapp-000000?style=for-the-badge&logo=x&logoColor=white)](https://x.com/bigbullapp)

[🛠 Hızlı başlangıç](#-quick-start) · [🎁 Ücretsiz katman](#-free-tier--how-much-you-get) · [🤖 Modeller](#-models--all-39-of-them) · [🧪 API'yi kullanma](#-how-to-use-the-api) · [✅ Doğrulandı](#-verified-working--every-key-is-tested) · [🧭 Nasıl çalışır](#-how-it-works) · [🔌 9Router](#-connect-to-9router) · [⚙️ Seçenekler](#️-cli-options) · [🛰️ Proxy'ler](#️-behind-a-proxy) · [🐞 Sorunlar](#-issues)

</div>

<div align="center">

**English** · [Türkçe](README.tr.md) · [中文](README.cn.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Русский](README.ru.md) · [Português](README.pt.md)

</div>

---

## ✨ Bu neden var

io.net (IO Intelligence) her hesaba API erişimi verir ve kullanışlı birim *anahtar başına bir hesaptır*. Kayıt tek bir barındırılan sayfadır: e-posta adresi, e-posta ile gelen tek kullanımlık kod ve bir API anahtarı uç noktası. Bu araç tüm yolu yürür — sayfanın gerektirdiği yerde gerçek bir tarayıcı, geri kalan her şey için düz HTTP — ve bir anahtarı ancak gerçek bir tamamlama sonrasında kaydeder:

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

> **Durum notu (2026-10-18):** depo, hattın öldüğüne inanıldığı sırada aynı gün erken saatlerde arşivlenmişti; akşam yapılan yeniden denetim bunu yeniden doğruladı — diskteki havuz üzerinde yapılan canlı bir tarama gerçek sohbet tamamlamalarına yanıt aldı (`google/gemma-4-26b-a4b-it` → 200 `"pong"`) ve `id.io.net/login` hattı `200` yanıtı verdi. Depo yeniden **aktif**. Kayıtlar sağlayıcı tarafından hız sınırına tabidir ve doğrulama görevleri insan denetimlidir; ölçek bu kapılar tarafından sınırlanır.

## 🎁 Ücretsiz katman — ne kadar alıyorsunuz

**Ücretsiz bir hesabın gerçekte çağırabildikleri:** katalog her anahtara *listelenir*, ancak üretim her model için hesap katmanı tarafından kapılanır. Ücretsiz katman anahtarıyla bu kimliklerin 24'ü üzerinde ölçüldüğünde, tam olarak biri bir tamalamaya yanıt verdi — **`google/gemma-4-26b-a4b-it`** (`200`, gerçek bir asistan mesajı; bu bir akıl yürütme modelidir, dolayısıyla metin `reasoning_content` içinde gelebilir). Diğer tüm kimlikler `402 {"note":"Model '<id>' requires a higher IO Intelligence tier"}` yanıtı verdi.

| Ne | Değer |
| --- | --- |
| Anahtar başına katalog | `GET /v1/models` üzerinde **39 kimlik** ([`models.json`](models.json) içinde yakalandı) |
| Ücretsiz katman doğrulayıcısı | `google/gemma-4-26b-a4b-it` — gerçek içerikle **200** |
| Ücretsiz katmandaki diğer kimlikler | yükseltme yapılana kadar `402 requires a higher IO Intelligence tier` |
| Model başına üst veri | her model `min_access_tier` (1–3) ve `higher_tier_required` taşır |
| Kayıt | `id.io.net/login` (e-posta → kod → `magic-auth/verify` → `accessToken` → `POST /v1/api-keys`) |
| Ölçeklenen birim | **bir hesap = bir anahtar** → `--target N`, N hesap/anahtar demektir |

> 💡 Ücretsiz katman IO Intelligence tarafından belirlenir ve değişebilir. Güncel sayıları [io.net](https://io.net) adresinde kontrol edin — ve kararı aracın kendi kapısına bırakın:

```bash
node src/cli.js verify --proxy socks5://127.0.0.1:1080     # every key is re-tested (models + chat) through one exit
```

## 🤖 Modeller — 39'unun tamamı

`GET https://api.intelligence.io.solutions/api/v1/models`, her geçerli anahtar için **39 model kimliği** yanıtlar; bunlar arasında şunlar bulunur:

`deepseek-ai/DeepSeek-V4.1-Flash` · `deepseek-ai/DeepSeek-V4-Pro` · `zai-org/GLM-5.3` · `zai-org/GLM-5.3-Flash` · `XiaomiMiMo/MiMo-V2.6-Flash` · `moonshotai/Kimi-K3` · `MiniMaxAI/MiniMax-M2.7` · `Qwen/Qwen3.8-27B` · `openai/gpt-oss-120b` · `deepseek-ai/DeepSeek-R1-0528` · `google/gemma-4-26b-a4b-it`

Ölçülen ücretsiz katman kapsamı:

|Model|✓|
|---|---|
|`google/gemma-4-26b-a4b-it`|✓|
|`nvidia/nemotron-3.5-lightning`|✓|

2026-10-19 canlı yeniden kontrol (5 anahtar × 4 çıkış): `nvidia/nemotron-3.5-lightning` 20/20 denemede `200` yanıtladı; 39 kimliklik kataloğun geri kalanı `402 requires a higher IO Intelligence tier` yanıtı veriyor.

39 kimliğin tamamı [`models.json`](models.json) içinde. Tek bir anahtarın canlı denemesi (doğrulayıcının yaptığının tam olarak aynısı):

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

## 🛠 Hızlı başlangıç

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

**Doğrulama görevi sizin tarafınızdan yanıtlanır:** her tur `solve-<tag>/round-N.png` + `state.json` olarak dökülür ve siz tıklanacak karoları listeleyen `solve-<tag>/clicks.json` dosyasını yazarsınız — araç onlara tıklar, widget'ı yeniden okur ve devam eder.

### 🖱️ Başlatıcı

`src/launcher.js`, mint / verify / screen ve 9Router üzerine kurulu etkileşimli menüdür. Diğer depolar ile aynı banner/menü yapısındadır ve görevleri `src/cli.js`'e devreder. `node src/launcher.js --connect-9router` anahtarları yerel bir 9Router'a kaydeder.

## ✅ Çalıştığı doğrulandı — her anahtar test edilir

Bir anahtar `keys.txt` dosyasına ancak canlı API onunla yanıt verdikten sonra yazılır:

| kontrol | çağrı | beklenen |
| --- | --- | --- |
| kimlik doğrulama + model listesi | `GET https://api.intelligence.io.solutions/api/v1/models` | `200` + hesabın model kimlikleri (39) |
| gerçek tamamlama | `POST …/chat/completions` (`google/gemma-4-26b-a4b-it`) | `200` + boş olmayan bir asistan mesajı |

```bash
node src/cli.js verify --proxy socks5://127.0.0.1:1080    # re-runs both checks over every key and reports a per-key verdict
```

Sürücü, eklediği her anahtar üzerinde aynı kontrolü yapar. `google/gemma-4-26b-a4b-it` bir akıl yürütme modelidir — metin `reasoning_content` içinde gelebilir.

> ionet, engelli sağlayıcılar listesindedir — doğrulama şekli ölçüldüğü gibidir; sağlayıcı tarafındaki katmanlandırma geçerlidir.

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

1. **Tarayıcı aşaması** (`run-account.js --until start`): gezin, yeni bir posta kutusu adresi girin, doğrulama turlarını `clicks.json` dosyanızdan yanıtlayın, gönderin. `POST /api/workos/magic-auth/start` yanıt verdiği anda hesabın gelen kutusu + token `handoff.json` dosyasına yazılır ve **Chrome hemen kapanır** — tarayıcının işi bitmiştir.
2. **HTTP ayağı** (`http-finish.js`): tek kullanımlık kodu posta kutusundan okuyun, `magic-auth/verify` çağırın → `accessToken`, anahtarı oluşturun (`POST /v1/api-keys/`), canlı olarak doğrulayın, `keys.txt` + `accounts.json` dosyalarına ekleyin.
3. **Sürücü** (`lane.js`): denemeler üzerinde sıralı bir döngü — havuzdan taze bir çıkış seçer, kullanım anında ön kontrolünü yapar, tarayıcı aşamasını çalıştırır, gönderimden önce kesilen denemeleri otomatik olarak kurtarır, HTTP ayağını token'ın ömrü içinde çalıştırır, başarısız olan çıkışları kara listeye alır ve yeniden seçer. `lane-<TAG>.jsonl` her denemeyi kaydeder.

Bilinmeye değer iki ayar: API anahtarı `project: "io-intelligence"` ile oluşturulmalıdır (araç bunu sizin için yapar) ve tarayıcının devrettiği erişim token'ı **5 dakika** yaşar — tarayıcı aşamasının sayfa içinde bitirmek yerine HTTP'ye devretmesinin nedeni tam olarak budur.

## ⚙️ CLI seçenekleri

| araç | bayraklar |
| --- | --- |
| `cli.js` | `mint` · `finish` · `verify` · `screen` — her görev kendi bayraklarını yazdırır (`node src/lane.js --help`) |
| `lane.js` | `--tag` (L) · `--port` (9411) · `--target N` (5) · `--preset turbo\|balanced\|safe` (tempo aralığı) · `--gap S` · `--pick` (deneme başına havuzdan taze çıkış) veya `--proxy <line>` (sabit çıkış) · `--max-attempts N` · `--union-file` / `--new-file` |
| `run-account.js` | `--tag` · `--port` · `--until start\|email\|otp\|key` · `--proxy <line>` · `--broker <url>` · `--solve-dir` · `--solve-budget-ms` · `--round-wait-ms` · `--otp-timeout-ms` · `--email` / `--email-token` (bir gelen kutusunu sürdür) |
| `http-finish.js` | `--email` + `--box-token` veya `--token <accessToken>` / `--token-file` veya `--from-log <net.jsonl>` · `--name` · `--model` · `--otp-timeout-ms` |
| 9Router | herhangi bir görevde `--connect-9router` — görev bittikten sonra `keys.txt` içindeki her anahtarı çalışan bir 9Router'a kaydeder (`node src/connect-9router.js --help`) |

Turbo önerilir (5); daha fazlası zayıf bilgisayarda yük/ban riski taşır.

## 🛰️ Proxy arkasında

* Çıkışlar bir metin havuzundan gelir (çıkış başına bir satır, `scheme://host:port`); her deneme taze bir çıkış ve kullanım anında bir ön kontrol alır; başarısız denemeye yol açan çıkışlar hat bazında kara listeye alınır.
* Her sağlayıcı çağrısı — tarayıcı, kod okuma, anahtar oluşturma, doğrulama — havuz üzerinden geçer; kendi adresinizden hiçbir şey gönderilmez.
* reCAPTCHA uygulama betiği sayfaya yerel bir önbellekten sunulur, böylece bir çıkışın tarayıcı aşaması için yalnızca `id.io.net` ve `www.google.com` adreslerine ulaşması yeterlidir.
* Posta kutusu broker'ı loopback (`127.0.0.1`) üzerinde çalışır — sağlayıcının değil sizin olan bir şeydir ve posta kimlik bilgilerinizi tutar, asla depoyu değil.

## 📄 Dosyalar

| Yol | İçerik |
| --- | --- |
| `keys.txt` | anahtarlar, **satır başına bir tane**, bir anahtar canlı kontrolü geçtiği anda eklenir — git tarafından yok sayılır |
| `accounts.json` | hesap başına bir kayıt: posta kutusu, anahtar, onu üreten çıkış — git tarafından yok sayılır |
| [`models.json`](models.json) | üretilmiş bir anahtarın yanıtladığı haliyle `GET /v1/models` (39 kimlik) |
| `out/` | deneme başına dökümler (ekran görüntüleri + DOM/ağ günlükleri), toplu iş günlüğü, çıkış kayıtları — git tarafından yok sayılır |
| `proxies.txt` | çıkış havuzunuz, satır başına bir proxy — git tarafından yok sayılır |

## 🔌 9Router'a bağlan

[9Router](https://9router.com) kendi sunucunuzda barındırılan, OpenAI uyumlu bir yönlendiricidir. io.net, OpenAI uyumlu bir uç nokta (`https://api.intelligence.io.solutions/api/v1`) sunar; bir kez kaydedin ve ürettiğiniz her anahtar tek bir sağlayıcı düğümü altında bir bağlantı haline gelir — 9Router bunlar arasında yük dengelemesi yapar:

```bash
node src/connect-9router.js \
  --base http://localhost:20128 --password 123456 \
  --api-key io-v2-xxxxxxxx
```

`--api-key` olmadan çalıştırırsanız `keys.txt` içindeki **her** anahtarı kaydeder. Yeniden çalıştırmak etkisizdir: düğüm `--prefix ionet` ile eşleştirilir, her bağlantı adıyla eşleştirilir (`ionet-001`, `ionet-002`, …) ve zaten kayıtlı bir anahtara dokunulmaz. Varsayılanlar: `--base http://localhost:20128`, `--password 123456`, `--name "IO Intelligence"`, `--prefix ionet`, `--base-url https://api.intelligence.io.solutions/api/v1`, `--model google/gemma-4-26b-a4b-it`.

9Router'da katalog şu şekilde sunulur:

```
ionet/google/gemma-4-26b-a4b-it
ionet/deepseek-ai/DeepSeek-V4.1-Flash
ionet/zai-org/GLM-5.3-Flash
```

`node src/cli.js mint --target 5 --pick --connect-9router` tek geçişte üretir ve kaydeder; `node src/launcher.js` aynı akışı menüsünden yürütür.

## 🔑 Bir anahtar size ne kazandırır

| | |
| --- | --- |
| 🏢 Sağlayıcı | **IO Intelligence** — [io.net](https://io.net) |
| 🎁 Sağlayıcının verdikleri | 39 model listelenir — ücretsiz katman çoğu kimliği 402'ye kilitler; google/gemma-4-26b-a4b-it ücretsiz katman doğrulayıcısıdır |
| 🔑 Bir anahtar size ne kazandırır | kendi hesabına kapsamlı bir API anahtarı: aşağıdaki uç noktada 39 model kimliği, planınızın sınırları dahilinde. Kota **hesap** üzerinde yaşar, bu aracın anahtar başına bir hesap oluşturmasının nedeni tam olarak budur |
| 🌐 API yapısı | OpenAI uyumlu: `POST https://api.intelligence.io.solutions/api/v1/chat/completions` |
| 🔒 Verileriniz | yalnızca io.net ve yapılandırdığınız gelen kutusu arka ucuyla iletişim kurulur; anahtarlar makinenizde kalır |

## 🐞 Sorunlar

Başarısız olan adım, etiket/deneme, kullanılan çıkış ve iz kaydının sonu (`lane-<TAG>-trace.log`) ile bir sorun açın — `out/` altındaki ekran görüntüleri ve durum dökümleri, bir anahtarı sızdırmadan hataları yeniden üretilebilir kılar. Çalıştırdığınız komut ve tam çıktı ile **[bir sorun açın](../../issues)**; PR'lar memnuniyetle karşılanır. Sağlayıcının katman kapısı hâlâ `402 requires a higher IO Intelligence tier` yönlendiriyorsa, araç o modelde durur ve bunu söyler — kapılanmış katalog ölçüldüğü gibidir.

## 📄 Lisans

MIT © 2026 — bkz. [LICENSE](LICENSE).

<div align="center">

**[MIT](LICENSE)** © 2026 ionet-bulk-apikey katkıda bulunanlar

</div>