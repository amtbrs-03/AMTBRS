
## ERN Çiçek — AI Ajan Rehberi

Türk çiçekçi e-ticareti: **vanilla JS SPA** + **GitHub veri tabanı** + **Cloudflare Worker backend**.


## ERN Çiçek — Geliştirici Rehberi

Türk çiçekçi e-ticareti: **vanilla JS SPA** + **GitHub veri tabanı** + **Cloudflare Worker backend**.
### Mimari

```
anasayfa.html (SPA) ←→ GitHub API (users/, carts/, orders/)
        ↓
cloudflare-worker/src/index.js (sipariş işleme, fatura, e-posta)
        ↓
products.json, site-settings.json (statik yapılandırma)
```

### Kritik Dosyalar

| Dosya | Amaç |
|-------|------|
| `anasayfa.html` | Ana SPA — kimlik, sepet, ürünler, tüm arayüz (~6.8k satır) |
| `admin/index.html` | Admin paneli — siparişler, kullanıcılar, ayarlar |
| `cloudflare-worker/src/index.js` | Sipariş API, PDF fatura (pdf-lib), e-posta (Resend) |
| `products.json` | Katalog: `{id, name, price, stock, sortOrder, images}` |
| `site-settings.json` | Mağaza ayarları, IBAN, `commitEndpoint` URL |
| `lib/` | Ortak modüller: `cache.js`, `mojibake.js` |

### Veri Konvansiyonları

**localStorage anahtarları** (e-posta bazlı):
- `currentUser` → `{name, email}`
- `user_${email}` → tam kimlik nesnesi (PBKDF2 salt/iteration)
- `cart_${email}` → `[{id, name, price, quantity}]`
- `sessionId_${email}` → oturum tazelik takibi

**GitHub yolları**: `/users/${email}_full.json`, `/carts/${email}.json`, `/orders/ORD-*.json`

### Geliştirme Akışı

```bash
# Verileri normalize et (VS Code görevi veya doğrudan)
npm run normalize:products
node scripts/normalize-orders.js

# Lokal test — derleme gerekmez
open anasayfa.html           # Frontend tarayıcıda
wrangler dev cloudflare-worker/  # Worker lokal

# Yayın: site-release'a gönder → Worker otomatik deploy
git push origin site-release
```

**GitHub Secrets**: `CF_API_TOKEN`, `CF_ACCOUNT_ID` (Worker deploy), `GITHUB_TOKEN` (API commit)

### Temel Kalıplar

- **Mojibake düzeltme**: Türkçe karakterler (ç,ş,ğ,ü,ö,ı) `lib/mojibake.js` + `<head>` içinde inline fix ile çözülür
- **Fetch cache**: Veri uçlarında daima `cache: 'no-store'` kullan
- **Build aracı yok**: webpack/esbuild kullanma; tercihen inline `<script>` veya yeni `.js` dosyası ekle
- **Backend ekleme**: Cloudflare Worker'ı genişlet, veriyi GitHub API ile kaydet
- **Şema değişikliği**: Hem `anasayfa.html` render mantığını HEM de `scripts/normalize-*.js` dosyalarını güncelle

### Düzenleme Öncesi Kontrol

1. **Kimlik değişikliği** → `localStorage.setItem/getItem` araması ile tutarlılığı kontrol et
2. **Ürün şeması** → `anasayfa.html` + `normalize-products.js` güncelle
3. **localStorage anahtarları** → `admin/index.html`, `scripts/`, `.github/workflows/` kontrol et
4. **Worker uçları** → `site-settings.json:commitEndpoint` dağıtım ile uyumlu mu bak
