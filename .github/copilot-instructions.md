## ERN Çiçek — AI Ajan Rehberi

Türk çiçekçi e-ticareti: **vanilla JS SPA** + **GitHub veri tabanı** + **Cloudflare Worker backend**.

### Mimari

```
anasayfa.html (SPA ~7k satır) ←→ GitHub API (users/, carts/, orders/)
         ↓
cloudflare-worker/src/index.js (sipariş, PDF fatura, e-posta, auth)
         ↓
products.json, site-settings.json (yapılandırma)
```

### Kritik Dosyalar

| Dosya | Amaç |
|-------|------|
| `anasayfa.html` | Ana SPA — tüm frontend (auth, sepet, ürün, UI) |
| `admin/index.html` | Admin paneli (~8.4k satır) — siparişler, kullanıcılar |
| `cloudflare-worker/src/index.js` | Backend API (2.4k satır) — pdf-lib ile fatura |
| `products.json` | Ürün kataloğu (`{updatedAt, items:[...]}` formatı) |
| `site-settings.json` | Mağaza ayarları, `commitEndpoint` URL |
| `lib/mojibake.js` | Türkçe karakter encoding düzeltici (browser) |
| `scripts/normalize-*.js` | Veri şema normalizasyon (Node.js) |

### Veri Şemaları

**Ürün** (`products.json`):
```json
{"id": "TEMP-{timestamp}", "name": "...", "price": 1100, "stock": 3,
 "images": ["images/gallery/..."], "potDiameter": "15", "height": "30", "sortOrder": 1}
```

**Kullanıcı** (`users/{email}_full.json`):
```json
{"name": "...", "email": "...", "phone": "+90...",
 "pw": {"algo": "PBKDF2-SHA256", "iterations": 150000, "salt": "...", "hash": "..."},
 "addresses": [{"id": "default", "city": "...", "district": "...", "isDefault": true}]}
```

**Sipariş** (`orders/ORD-{timestamp}.json`):
```json
{"id": "ORD-...", "date": 1767134789642, "status": "pending",
 "customerEmail": "...", "items": [...], "total": "1220"}
```

**localStorage anahtarları** (e-posta bazlı):
- `currentUser` → `{name, email}`
- `user_${email}` → tam kimlik objesi
- `cart_${email}` → `[{id, name, price, quantity, addedAt}]`

### Geliştirme

```bash
# Lokal test — build gerekmez
open anasayfa.html                    # Frontend (doğrudan tarayıcı)
cd cloudflare-worker && wrangler dev  # Worker (port 8787)

# Veri normalizasyonu (VS Code task olarak da mevcut)
node scripts/normalize-orders.js
node scripts/normalize-products.js

# Deploy: site-release branch'e push (otomatik CI/CD)
git push origin site-release
```

### CI/CD Workflow'ları (`.github/workflows/`)

| Workflow | Tetikleyici | Amaç |
|----------|-------------|------|
| `deploy-worker.yml` | `cloudflare-worker/**` değişikliği | Worker deploy |
| `save-order.yml` | Sipariş kaydetme | orders/ güncelle |
| `update-products.yml` | Ürün güncelleme | products.json commit |
| `static.yml` | site-release push | GitHub Pages deploy |

### Kritik Kalıplar

1. **Build aracı YOK** — webpack/esbuild kullanma; inline `<script>` tercih et
2. **Fetch cache** — daima `cache: 'no-store'` kullan (GitHub raw cache sorunları)
3. **Türkçe encoding** — `/Ã|Ä|Å/` regex ile tespit; `lib/mojibake.js` (browser) veya `scripts/normalize-*.js` (Node) ile düzelt
4. **CORS whitelist** — Worker'da regex: `ern-cicek.com.tr`, `amtbrs-03.github.io`, `localhost`
5. **Rate limiting** — `checkRateLimit(ip)`, `checkEmailRateLimit(ip)` Worker'da
6. **PDF fatura** — `pdf-lib` kütüphanesi, Worker içinde generate edilir

### Worker API Endpoint'leri

| Endpoint | Amaç |
|----------|------|
| `POST /send-order` | Sipariş kaydet, PDF fatura, e-posta (Resend) |
| `POST /request-reset` | Şifre sıfırlama (Turnstile CAPTCHA) |
| `POST /verify-reset` | Kodu doğrula, şifre güncelle |
| `POST /update-user` | Kullanıcı → GitHub commit |
| `POST /commit` | Genel amaçlı GitHub commit |
| `GET /send-order` | Health check (ok: true döner) |

### Şema Değişikliği Kontrol Listesi

1. `anasayfa.html` render fonksiyonlarını güncelle (`loadProducts`, `renderCart`, vb.)
2. `scripts/normalize-*.js` senkronize et
3. `admin/index.html` ilgili bölümleri kontrol et
4. Worker'da PDF oluşturma kodunu incele (order şeması için)
5. Mobil uygulama varsa `ern-uygulama/src/types/` güncelle

### Mobil Uygulama Entegrasyonu

iOS ve Android uygulaması **ayrı projede**: `/Users/amtbrs/Documents/GitHub/ern-uygulama`

**Teknoloji**: Expo SDK 54 + React Native + TypeScript

**⚠️ KRİTİK: Site etkilenmemeli!**
- Mobil uygulama GitHub'dan **sadece OKUMA** yapar
- Site kodlarına (`anasayfa.html`, `admin/`) dokunulmaz
- Mobil origin CORS whitelist'e eklenmeli (`cloudflare-worker/src/index.js` → `allowed`)

**Veri akışı (mobil)**:
```
READ (doğrudan GitHub raw):
├── products.json         → Ürün listesi
├── site-settings.json    → Mağaza ayarları
└── images/gallery/*      → Ürün görselleri

WRITE (Worker API üzerinden):
├── POST /send-order      → Sipariş oluştur
├── POST /update-user     → Kullanıcı güncelle
└── POST /request-reset   → Şifre sıfırla
```

**GitHub Raw URL formatı**:
```
https://raw.githubusercontent.com/amtbrs-03/AMTBRS/site-release/products.json
```

**Auth**: `expo-secure-store` ile token saklama (localStorage yerine)

### Secrets

| Ortam | Değişken |
|-------|----------|
| Cloudflare | `CF_API_TOKEN`, `CF_ACCOUNT_ID` |
| Worker env | `GITHUB_TOKEN`, `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`, `RATE_LIMIT_KV` |
| GitHub Actions | `GH_TOKEN` (repo erişimi için) |

### Dosya Yapısı Özeti

```
├── anasayfa.html           # Ana SPA (auth, sepet, ürün)
├── admin/index.html        # Admin paneli
├── cloudflare-worker/
│   └── src/index.js        # Backend API (Wrangler)
├── lib/                    # Paylaşılan modüller (ES modules)
├── scripts/                # Node.js araçları
├── users/                  # {email}_full.json kullanıcı verileri
├── orders/                 # ORD-{timestamp}.json siparişler
├── carts/                  # {email}.json sepet verileri
└── products.json           # Ürün kataloğu
```
