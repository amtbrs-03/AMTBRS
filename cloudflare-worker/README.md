# Cloudflare Worker (ern-site)

Bu klasör, `ern-cicek.com.tr` sitesi için sipariş ve kullanıcı güncelleme isteklerini alan basit bir Cloudflare Worker örneği içerir.

## Workers

### 1. Ana Worker (send-order.js)
- `/send-order` (POST): Siparişi alır, GitHub'a kaydeder.
- `/update-user` (POST): Kullanıcı güncellemesini alır, GitHub'a kaydeder.
- CORS Desteği: `OPTIONS` preflight istekleri 204 ve doğru başlıklarla yanıtlanır.

### 2. Sepet Hatırlatma Worker (cart-reminder.js) 🆕
Otomatik olarak her saat çalışır ve 3 saatten fazla bekleyen sepetler için müşterilere hatırlatma e-postası gönderir.

**Özellikler:**
- 3 saatten fazla bekleyen sepetleri tespit eder
- Profesyonel HTML e-posta şablonu ile hatırlatma gönderir
- Aynı müşteriye 24 saat içinde tekrar mail göndermez
- Resend.com API ile e-posta gönderimi

**Gerekli Secrets:**
```bash
wrangler secret put GITHUB_TOKEN -c wrangler-cart-reminder.toml
wrangler secret put RESEND_API_KEY -c wrangler-cart-reminder.toml
```

**Environment Variables (Cloudflare Dashboard):**
- `GH_OWNER`: amtbrs-03
- `GH_REPO`: AMTBRS
- `GH_BRANCH`: site-release
- `FROM_EMAIL`: Ern Çiçek <siparis@ern-cicek.com.tr>

> Not: İsterseniz GitHub commit işlemlerini ekleyebilirsiniz. Bunun için `env` değişkenleri ile token kullanmanız gerekir ve Worker içine ilgili kodu eklemeniz yeterli.

## Geliştirme

1. Wrangler kurun ve giriş yapın:

```bash
npm i -g wrangler
wrangler login
```

1. Lokal geliştirme:

```bash
cd cloudflare-worker
wrangler dev
```

1. Yayına alma:

```bash
# Ana worker
wrangler deploy

# Sepet hatırlatma worker
wrangler deploy -c wrangler-cart-reminder.toml
```

Deploy sonrası uç noktalarınız:

- `https://<worker-adınız>.workers.dev/send-order`
- `https://<worker-adınız>.workers.dev/update-user`
- `https://ern-cart-reminder.workers.dev/test-reminder` (manuel test için)

Özel alan adı bağlamak isterseniz, `wrangler.toml` içindeki `routes` kısmını doldurabilirsiniz.

## Resend.com Kurulumu (E-posta için)

1. [resend.com](https://resend.com) hesabı oluşturun
2. Domain doğrulaması yapın (ern-cicek.com.tr)
3. API Key oluşturun
4. Worker'a secret olarak ekleyin:
   ```bash
   wrangler secret put RESEND_API_KEY -c wrangler-cart-reminder.toml
   ```

## Site ile Entegrasyon

- Sitede `site-settings.json` içindeki `orderEndpoint` alanı Worker uç noktanıza bakmalıdır:

```json
{
  "orderEndpoint": "https://ern-site.amtbrs-03.workers.dev/send-order"
}
```

- `anasayfa.html` içinde, sipariş bildirimi sırasında önce bu uç nokta denenir; başarısız olursa Netlify/Functions yedeklerine geçer.

## Güvenlik

- `allowed` listesinde sadece `https://ern-cicek.com.tr` izinli olacak şekilde kısıtlı CORS uygulanmıştır. Yerel denemeler için listeye `http://localhost:8787` gibi adresleri ekleyebilirsiniz.
