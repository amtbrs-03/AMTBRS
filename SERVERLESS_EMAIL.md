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

5) İstemci (tarayıcı) örneği (fetch ile)

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
- Eğer isterseniz bu fonksiyonu doğrudan projeye entegre edip `denme.html`'de mailto çağrısını yerine fetch çağrısı yapan bir seçenek ekleyebilirim.
