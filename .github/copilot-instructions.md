## ERN Çiçek — AI Ajan Rehberi

Türk çiçekçi e-ticareti: **vanilla JS SPA** + **GitHub veri tabanı** + **Cloudflare Worker backend**.

### Mimari Genel Bakış

```
anasayfa.html (tek sayfa SPA) ←→ GitHub API (users/, carts/, orders/)
                  ↓
cloudflare-worker/src/index.js (sipariş, fatura PDF, e-posta)
                  ↓
products.json, site-settings.json (yapılandırma)
```

**Veri akışı**: Kullanıcı/sepet/sipariş verileri GitHub repo JSON dosyaları olarak saklanır. Worker, GitHub API ile commit yapar.

### Kritik Dosyalar

| Dosya | Amaç |
|-------|------|
| `anasayfa.html` | Ana SPA (~6.8k satır) — kimlik, sepet, ürün, tüm UI |
| `admin/index.html` | Admin paneli — siparişler, kullanıcılar, ayarlar |
| `cloudflare-worker/src/index.js` | Backend API: `/send-order`, `/request-reset`, `/verify-reset`, `/update-user`, `/commit` |
| `products.json` | Ürün kataloğu: `{id, name, price, stock, sortOrder, images[], potDiameter, height}` |
| `site-settings.json` | Mağaza ayarları, IBAN, `commitEndpoint` URL |
| `lib/mojibake.js` | Türkçe karakter encoding düzeltici |
| `scripts/normalize-*.js` | Veri şema normalizasyon scriptleri |

### Veri Konvansiyonları

**localStorage anahtarları** (e-posta bazlı):
- `currentUser` → `{name, email}`
- `user_${email}` → tam kimlik objesi (PBKDF2 salt/hash/iterations)
- `cart_${email}` → `[{id, name, price, quantity, addedAt}]`
- `sessionId_${email}` → oturum tazelik takibi
- `orders_${email}` → kullanıcı siparişleri cache

**GitHub yolları**: `users/${email}_full.json`, `carts/${email}.json`, `orders/ORD-{timestamp}.json`

### Geliştirme Akışı

```bash
# Veri normalizasyonu (VS Code task veya CLI)
npm run normalize:products
node scripts/normalize-orders.js

# Lokal test — build gerekmez
open anasayfa.html                    # Frontend tarayıcıda
wrangler dev cloudflare-worker/       # Worker lokal (port 8787)

# Deploy: site-release branch'e push → Worker otomatik deploy
git push origin site-release
```

### Kritik Kalıplar

1. **Build aracı YOK**: webpack/esbuild kullanma; inline `<script>` veya ayrı `.js` dosyası tercih et
2. **Fetch cache**: Veri endpoint'lerinde daima `cache: 'no-store'` kullan
3. **Mojibake düzeltme**: Türkçe (ç,ş,ğ,ü,ö,ı) `lib/mojibake.js` + HTML head'de inline fix
4. **CORS**: Worker'da whitelist: `ern-cicek.com.tr`, `amtbrs-03.github.io`, `localhost`
5. **Rate limiting**: Worker'da IP bazlı `checkRateLimit()` ve email için `checkEmailRateLimit()`

### API Endpoint'leri (Worker)

| Endpoint | Method | Amaç |
|----------|--------|------|
| `/send-order` | POST | Sipariş kaydet, PDF fatura oluştur, e-posta gönder |
| `/request-reset` | POST | Şifre sıfırlama kodu gönder (Turnstile CAPTCHA) |
| `/verify-reset` | POST | Kodu doğrula, şifreyi güncelle |
| `/update-user` | POST | Kullanıcı bilgilerini GitHub'a kaydet |
| `/commit` | POST | Genel amaçlı GitHub dosya commit |

### Şema Değişikliği Yapılırken

1. `anasayfa.html` render mantığını güncelle
2. `scripts/normalize-*.js` dosyalarını güncelle
3. `admin/index.html` içindeki ilgili bölümleri kontrol et
4. Order/cart şeması için Worker'daki PDF oluşturma kodunu incele

### Düzenleme Öncesi Kontrol Listesi

- [ ] **Kimlik değişikliği** → `localStorage.setItem/getItem` araması yap
- [ ] **localStorage anahtarları** → `admin/index.html`, `scripts/`, workflows kontrol et
- [ ] **Ürün şeması** → `anasayfa.html` + `normalize-products.js` senkron olmalı
- [ ] **Worker endpoint** → `site-settings.json:commitEndpoint` dağıtımla uyumlu mu?

### GitHub Secrets (CI/CD)

- `CF_API_TOKEN`, `CF_ACCOUNT_ID` — Worker deploy
- `GITHUB_TOKEN` — API commit işlemleri
- Worker env: `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`, `RATE_LIMIT_KV` (KV namespace)
