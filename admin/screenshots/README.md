# Admin PWA Screenshots

Bu klasör admin panel PWA ekran görüntüleri içindir.

Gerekli dosyalar:
- `admin-mobile.png` - 1080x1920 px (mobil)
- `admin-desktop.png` - 1920x1080 px (masaüstü)

## Ekran Görüntüsü Oluşturma

Puppeteer ile otomatik oluşturmak için:

```bash
npx puppeteer screenshot https://ern-cicek.com.tr/admin/index.html admin/screenshots/admin-mobile.png --viewport 1080x1920
npx puppeteer screenshot https://ern-cicek.com.tr/admin/index.html admin/screenshots/admin-desktop.png --viewport 1920x1080
```
