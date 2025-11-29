#!/bin/zsh

# macOS kullanıcı parolası ile doğrulama (Sistem girişine entegre)
# Bu komut, yönetici yetkisi gerektiren zararsız bir komutu çalıştırır.
# Kullanıcı doğru macOS parolasını girerse devam eder; iptal/yanlışsa çıkılır.
AUTH_SCRIPT='do shell script "id -u" with administrator privileges'
if ! osascript -e "$AUTH_SCRIPT" >/dev/null 2>&1; then
  osascript -e 'display alert "Kimlik doğrulama iptal edildi veya başarısız oldu." as warning'
  exit 1
fi

# Sunucuyu başlat
cd "$(dirname "$0")" || exit 1
python3 http_utf8_server.py &
sleep 1

# Chrome ile aç; yoksa bilgi ver ve varsayılan tarayıcıyı kullan
if [[ -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]]; then
  open -a "Google Chrome" http://127.0.0.1:8000/admin.html
else
  osascript -e 'display alert "Google Chrome bulunamadı. Lütfen Chrome yükleyin veya admin paneline varsayılan tarayıcı ile devam edin." as warning'
  open http://127.0.0.1:8000/admin.html
fi
