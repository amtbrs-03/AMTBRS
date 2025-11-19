HTTPS (TLS) Kurulumu — Özet ve Adımlar

Bu depo statik bir site içeriyor. HTTPS (güvenli bağlantı) sertifikası kodun içine "eklenmez"; HTTPS web sunucusu veya hosting platformu (GitHub Pages, Netlify, Vercel, kendi sunucunuz) tarafından sağlanır. Aşağıda en yaygın senaryolar için adımlar ve öneriler yer almaktadır.

1) GitHub Pages (önerilen, basit)
- Önkoşul: Repo root'ta `index.html` veya `docs/` dizini ve `CNAME` dosyası (custom domain) varsa doğru CNAME değeri olmalı.
- DNS:
  - Apex domain (ör. `ern-cicek.com.tr`) için sağlayıcınıza 4 tane A kaydı ekleyin:
    - 185.199.108.153
    - 185.199.109.153
    - 185.199.110.153
    - 185.199.111.153
  - `www` alt domain kullanacaksanız `www` için CNAME kaydı oluşturun ve hedef olarak GitHub Pages host'unuza (örn. `nx25pg9kdn-create.github.io`) veya apex alanınıza yönlendirin.
- GitHub tarafı:
  - Repo → Settings → Pages bölümüne gidin.
  - "Custom domain" alanına `ern-cicek.com.tr` girin (veya kullandığınız domain).
  - "Enforce HTTPS" seçeneğini işaretleyin (GitHub otomatik olarak Let's Encrypt sertifikası alır; DNS değişikliği yayılana kadar birkaç dakika–saat sürebilir).
- Notlar:
  - GitHub Pages otomatik olarak TLS yönetir; ekstra sunucu yapılandırması gerekmez.

2) Netlify (otomatik, kolay)
- Netlify'a repo'yu deploy edin (GitHub entegrasyonu ile).
- Netlify → Site settings → Domain management bölümünden özel domain ekleyin.
- DNS yönlendirmesi Netlify tarafından veya DNS sağlayıcısından yapılır; Netlify Let’s Encrypt ile otomatik HTTPS sağlar.
- Ek yapılandırma gerekirse Netlify UI üzerinden yönetin.

3) Vercel
- Repo'yu Vercel'e bağlayın.
- Vercel domain yönetiminden özel domain ekleyin; DNS kurulumunu yapın.
- Vercel otomatik olarak TLS sertifikası sağlar.

4) Kendi sunucunuz (Nginx/Apache) — Let's Encrypt + Certbot
- Bu seçenek kendi VPS/VM/host'unuz var ise kullanılır.
- Örnek (Ubuntu + Nginx):

  # 1. Certbot yükleyin
  sudo apt update
  sudo apt install certbot python3-certbot-nginx

  # 2. Nginx yapılandırması: server_name example.com www.example.com
  # 3. Certbot ile otomatik kurulum
  sudo certbot --nginx -d ern-cicek.com.tr -d www.ern-cicek.com.tr

- Certbot, Nginx/Apache konfigürasyonunu otomatik günceller ve cron/ systemd timer ile yenilemeyi sağlar.
- Manuel yenileme test:
  sudo certbot renew --dry-run

5) Eğer domain DNS'inizde sorun yaşarsanız
- DNS kayıtlarının doğru olduğundan ve TTL süresinin dolduğundan emin olun. DNS değişiklikleri genelde birkaç dakika–24 saat içinde yayılır.
- `dig +short A ern-cicek.com.tr` veya `nslookup ern-cicek.com.tr` ile A/CNAME kayıtlarını kontrol edin.

6) Mail/Serverless fonksiyon güvenliği
- `functions/send-order/index.js` gibi serverless fonksiyonları dağıtırken, SMTP/3rd party API anahtarlarını ortam değişkeni (env vars) olarak ekleyin. Anahtarları repo'ya koymayın.

7) Hızlı kontrol listesi (GitHub Pages için)
- `CNAME` dosyası repo kökünde `ern-cicek.com.tr` içeriyor mu? (evet, repo bunu içeriyor)
- DNS A kayıtları GitHub IP'lerine işaret ediyor mu?
- GitHub repo → Settings → Pages → Custom domain olarak domain eklendi mi ve "Enforce HTTPS" seçeneği aktif mi?

8) İleri adım önerileri (isteğe bağlı)
- Eğer ben yapmamı isterseniz: DNS kayıtlarınızı ve GitHub Pages ayarlarını nasıl kontrol edeceğinizi adım adım yönlendirebilirim; bir domain sağlayıcısı kullanıyorsanız (GoDaddy, Namecheap, Cloudflare vb.) hangisi olduğunu söyleyin, ben size tam DNS girişlerini hazırlayayım.
- Eğer kendi sunucunuz varsa, Nginx konfigürasyon dosyanızı paylaşırsanız `certbot` komutunu ve gerektiğinde reverse-proxy ayarlarını sizin için düzenleyebilirim.

Not: HTTPS sertifikası doğrudan HTML/JS içine "eklenmez" — hosting/edge/servis tarafında sağlanır. Bu dosya, projeyi HTTPS altına almak için gerekli yolları ve komutları özetler.
