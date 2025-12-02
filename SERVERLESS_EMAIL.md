Serverless e-posta endpoint (örnek)

Bu proje için opsiyonel olarak mailto: yerine sunucu tarafından e-posta gönderecek bir serverless function örneği ekledim.

1) Ne yapar
- POST istek alır (JSON): { payerEmail, cart: [{id,name,price,qty}], iban }
- SMTP bilgilerini kullanarak alıcıya (TO_EMAIL) bir e-posta gönderir.

2) Nerede
- Fonksiyon kodu: `functions/send-order/index.js` (Netlify/Vercel style)
- Bağımlılık: nodemailer

3) Ortam değişkenleri (deploy ortamına ekleyin)
- SMTP_HOST (ör. smtp.mailprovider.com)
- SMTP_PORT (ör. 587 veya 465)
- SMTP_USER (SMTP kullanıcı adı)
- SMTP_PASS (SMTP parola)
- FROM_EMAIL (opsiyonel, gönderici adresi; yoksa SMTP_USER kullanılır)
- TO_EMAIL (opsiyonel, alıcı adres; yoksa defaults to amtbrs@icloud.com)

4) Nasıl deploy edilir (Netlify örneği)
- `functions/send-order/index.js` dosyasını projenize ekleyin.
- Proje kökünde `package.json` oluşturup `nodemailer`'ı ekleyin veya Netlify UI'dan "Install" edin.

  package.json (örnek)

  {
    "name": "ern-cicek-netlify-func",
    "version": "1.0.0",
    "dependencies": {
      "nodemailer": "^6.9.0"
    }
  }

- Netlify'da site ayarlarından yukarıdaki environment variable'ları ekleyin.
- Deploy edin.

5) GitHub Pages ile birlikte kullanma (Önerilen)

- Statik siteyi GitHub Pages'ta barındırabilir, yalnızca fonksiyonu Netlify/Vercel gibi bir yerde çalıştırabilirsiniz.
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
