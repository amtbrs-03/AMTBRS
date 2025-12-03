# Cloudflare Worker (ern-site)

Bu klasör, `ern-cicek.com.tr` sitesi için sipariş ve kullanıcı güncelleme isteklerini alan basit bir Cloudflare Worker örneği içerir.

## Neler var?

- `/send-order` (POST): Siparişi alır, şimdilik `commitOk: true` döner.
- `/update-user` (POST): Kullanıcı güncellemesini alır, `commitOk: true` döner.
- CORS Desteği: `OPTIONS` preflight istekleri 204 ve doğru başlıklarla yanıtlanır. JSON veya text/plain gövde kabul edilir.

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
wrangler deploy
```

Deploy sonrası uç noktalarınız:

- `https://<worker-adınız>.workers.dev/send-order`
- `https://<worker-adınız>.workers.dev/update-user`

Özel alan adı bağlamak isterseniz, `wrangler.toml` içindeki `routes` kısmını doldurabilirsiniz.

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
