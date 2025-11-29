# Admin Launcher Touch ID / Parmak İzi Desteği

Bu proje statik olduğundan parmak izi (Touch ID) tarayıcı içinden doğrudan okunamaz. Ancak macOS **sudo** kimlik doğrulamasına entegre edilen `pam_tid.so` modülü sayesinde launcher açılışında parmak izi kullanılabilir.

## 1. Sudo'da Touch ID'yi Etkinleştirme
macOS (Touch ID destekli cihaz) üzerinde aşağıdaki satır `/etc/pam.d/sudo` dosyasında yoksa ekleyin:

```bash
sudo grep pam_tid /etc/pam.d/sudo || echo 'auth       sufficient     pam_tid.so' | sudo tee -a /etc/pam.d/sudo
```

Terminalde ilk kez bir `sudo` komutu çalıştırdığınızda parmak izi penceresi (veya fallback olarak parola) çıkacaktır.

## 2. Launcher Mantığı
`admin-launcher.command` ve `admin-launcher-chrome.command` artık:

```applescript
do shell script "sudo -v" with administrator privileges
```

kullanarak kimlik doğrulama yapar. Bu komut kısa süreli sudo zaman damgasını yeniler; Touch ID uygunsa parmak izi ile doğrulanır.

## 3. Güvenlik Notları
- Bu yöntem lokal fiziksel erişim varsayar. Oturum açmış kullanıcı Touch ID'yi kullanarak admin panelini açabilir.
- Tarayıcı içindeki admin sayfası ek bir parmak izi istemez; zaten yerel olarak korunan giriş aşamasından geçilmiştir.

## 4. İsteğe Bağlı: WebAuthn (Passkey) Desteği
Admin arayüzüne tarayıcı içi "Passkey ile giriş" (Touch ID / Face ID) eklemek mümkündür. Bunun için:
1. WebAuthn kayıt (`navigator.credentials.create`) ile credential ID saklanır.
2. Giriş (`navigator.credentials.get`) sırasında credential ID eşleşirse admin oturumu açılır.
3. Tam kriptografik doğrulama (imza kontrolü) için ek CBOR ayrıştırma + `crypto.subtle.verify` gerekir. Statik ortamda örnek zayıf doğrulamayı kullanmak yeterli olabilir.

Bu dosya yalnızca sistem düzeyindeki Touch ID entegrasyonunu anlatır. Passkey uygulaması için admin HTML içinde ek script eklendi (varsa) veya eklenebilir.

---
Sorular için: amtbrs@icloud.com
