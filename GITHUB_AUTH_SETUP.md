# GitHub Actions ile Kullanıcı Kaydı Kurulumu

Bu sistem, kullanıcı verilerini GitHub repository'nize kaydeder ve farklı tarayıcılardan/cihazlardan giriş yapılmasını sağlar.

## Gereksinimler

1. GitHub Personal Access Token (PAT) oluşturmanız gerekir
2. Token'ın `repo` izinleri olmalı

## Kurulum Adımları

### 1. GitHub Personal Access Token Oluşturma

1. GitHub'da sağ üst köşedeki profil fotoğrafınıza tıklayın
2. **Settings** > **Developer settings** > **Personal access tokens** > **Tokens (classic)**
3. **Generate new token (classic)** butonuna tıklayın
4. Token için bir isim verin (örn: "ERN Cicek User Storage")
5. **repo** iznini seçin (tüm repo izinlerini içerir)
6. **Generate token** butonuna tıklayın
7. Token'ı kopyalayın (bir daha gösterilmeyecek!)

### 2. Token'ı Siteye Ekleme

Token'ı kullanmak için iki seçenek:

#### Seçenek A: Tarayıcı Konsolundan (Önerilen - Test için)

1. Siteyi açın
2. Tarayıcı konsolunu açın (F12)
3. Aşağıdaki komutu çalıştırın:

```javascript
localStorage.setItem('github_token', 'ghp_YourTokenHere');
```

#### Seçenek B: Kodda Sabit Token (Güvenli Değil!)

`anasayfa.html` dosyasında şu satırı bulun:
```javascript
const GITHUB_TOKEN = localStorage.getItem('github_token') || 'GITHUB_TOKEN_BURAYA';
```

Ve şöyle değiştirin:
```javascript
const GITHUB_TOKEN = localStorage.getItem('github_token') || 'ghp_YourActualToken';
```

**⚠️ UYARI:** Token'ı kodda saklamak güvenli değildir! Sadece test için kullanın.

### 3. Workflow'u Aktif Etme

GitHub Actions workflow'u `.github/workflows/save-user.yml` dosyasında tanımlı. Bu dosya zaten repository'nize eklenmiştir.

Workflow'un çalışması için:
1. Bu dosyayı commit edip push edin
2. GitHub repository'nizde **Settings** > **Actions** > **General** 
3. "Workflow permissions" bölümünde "Read and write permissions" seçili olmalı

## Nasıl Çalışır?

1. Kullanıcı kayıt olduğunda:
   - Veriler önce localStorage'a kaydedilir (hızlı erişim için)
   - Ardından GitHub Actions workflow tetiklenir
   - Workflow, kullanıcı verisini `users/email_full.json` dosyası olarak kaydeder

2. Kullanıcı farklı bir cihazdan giriş yapmaya çalıştığında:
   - Önce localStorage kontrol edilir
   - Eğer yoksa, GitHub'dan kullanıcı verisi çekilir
   - Veri localStorage'a cache'lenir

## Test Etme

1. Bir kullanıcı kaydı oluşturun
2. Tarayıcı konsolunda şu mesajları göreceksiniz:
   - `registerUser: ✓ Remote save successful`
3. GitHub repository'nizde `users/` klasöründe kullanıcı dosyasını görebilirsiniz
4. Farklı bir tarayıcıda (veya incognito modda) aynı email ile giriş yapın
5. Konsolda `loginUser: ✓ User fetched from remote and cached locally` mesajını göreceksiniz

## Güvenlik Notları

- Kullanıcı şifreleri PBKDF2-SHA256 ile hash'lenir (150,000 iterasyon)
- Ham şifreler asla saklanmaz
- Token'ları asla public repository'lerde paylaşmayın
- Production için Netlify, Vercel veya benzeri bir serverless platform kullanmanız önerilir

## Sorun Giderme

### "GitHub token not configured" hatası
- Token'ı doğru şekilde kaydettiğinizden emin olun
- Token'ın `repo` iznine sahip olduğunu kontrol edin

### Kullanıcı GitHub'a kaydedilmiyor
- GitHub Actions workflow'unun çalıştığını kontrol edin (Actions sekmesi)
- Repository permissions kontrolünü yapın
- Token'ın süresi dolmamış olmalı

### Farklı cihazdan giriş yapamıyorum
- Kullanıcı dosyasının `users/` klasöründe olduğunu kontrol edin
- Tarayıcı konsolunda hata mesajlarını kontrol edin
- Raw GitHub URL'inin doğru olduğundan emin olun

## Alternatif Çözümler

Eğer GitHub Actions karmaşık geliyorsa:

1. **Firebase Authentication** - Ücretsiz, kolay kurulum
2. **Supabase** - Açık kaynak, ücretsiz tier
3. **Netlify Identity** - Netlify kullanıyorsanız entegre çözüm

Bu alternatifler daha güvenli ve kolay yönetilebilir.
