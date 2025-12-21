# Admin Panel

**ERN-ÇİÇEK Admin Dashboard**

## 📍 Lokasyon

Bu dosya `/admin/` directory'sinde yer almaktadır.

- **URL**: `https://ern-cicek.com/admin/`
- **Erişim**: Authenticated users (admin panel)
- **Ayrılmış**: 21 Aralık 2025

## 🔐 Güvenlik

- Admin paneli başlı başına bir HTML dosyası
- localStorage check: `admin_auth_ok` key
- Token girilmek gerekiyor (GitHub OAuth token)

## 📊 İçeriği

- Order management
- User management
- Product editing
- Settings

## 🔗 Bağlantılar

- [Ana Sayfa](../anasayfa.html)
- [Ürünler](../products.json)
- [Ayarlar](../site-settings.json)

## 📝 Notlar

- `/admin/` directory ayrı tutuldu (21 Aralık 2025)
- Code duplication azaltılacak (lib.js ile)
- CSS 390KB → 50KB optimize edilecek (sonraki aşama)

---

**Last Updated**: 21 Aralık 2025
