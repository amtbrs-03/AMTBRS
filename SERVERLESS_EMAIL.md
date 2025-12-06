
## Sipariş Bildirimi için Cloudflare Worker + SendGrid

Bu projede sipariş bildirimi için Cloudflare Worker ve SendGrid API kullanılmaktadır.

### Nasıl çalışır?
- Sipariş POST isteği ile Worker'a iletilir.
- Worker, siparişi GitHub'a kaydeder ve SendGrid API ile admin mailine bildirim gönderir.

### Gerekli ortam değişkenleri (Cloudflare Worker Secrets):
- `SENDGRID_API_KEY` (SendGrid hesabınızdan alınır)
- `TO_EMAIL` (admin mail adresiniz)
- `FROM_EMAIL` (gönderici adresi)

### Ayar ve test:
1. SendGrid hesabı açın, API anahtarı oluşturun.
2. Cloudflare Worker ortamında yukarıdaki secret'ları tanımlayın.
3. Sipariş verin, mailin gelip gelmediğini test edin.

Ekstra: Siparişler ayrıca GitHub repo'da `orders/` klasörüne JSON olarak kaydedilir.
- Bunun için `site-settings.json` içine bir ayar eklendi: `orderEndpoint`.
  - Örnek: `"orderEndpoint": "https://<netlify-site-adınız>.netlify.app/.netlify/functions/send-order"`
  - `odeme.html` önce bu URL'yi dener; 2xx alırsa doğrudan sunucuya bildirim yapılır. Aksi halde mailto fallback devreye girer.

6) İleri düzey (Opsiyonel GitHub commit)

- `functions/send-order/index.js` içinde isterseniz siparişi `orders/` klasörüne commit eden bir adım da vardır.
- Bunun için deploy ortamına şu env değişkenlerini ekleyin:
  - `GITHUB_TOKEN` (repo'ya yazma yetkisi olan bir token)
  - `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_BRANCH` (opsiyonel; varsayılan repo/branch kullanılır)
- Başarılı olursa API `commitOk: true` döndürür; istemci tarafında bu bilgi kullanıcıya gösterilir.

7) İstemci (tarayıcı) örneği (fetch ile)

```js
fetch('/.netlify/functions/send-order', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ payerEmail: 'you@example.com', cart: [...], iban: 'TR00...' })
}).then(r=>r.json()).then(console.log).catch(console.error);
```

Notlar ve güvenlik

- SMTP kimlik bilgilerini asla istemci tarafında saklamayın.
- Bu örnek basittir; üretim için rate limiting, doğrulama ve logging ekleyin.
- Eğer isterseniz bu fonksiyonu doğrudan projeye entegre edip `anasayfa.html`'de mailto çağrısını yerine fetch çağrısı yapan bir seçenek ekleyebilirim.
