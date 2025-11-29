#!/bin/zsh
set -e

# Terminal içi sudo ile Touch ID tetikle (AppleScript diyaloğu yerine)
sudo -k || true
if ! grep -q 'pam_tid.so' /etc/pam.d/sudo 2>/dev/null; then
  echo "ℹ️  pam_tid bulunamadı (Touch ID devre dışı olabilir, parola sorulacak)."
else
  echo "🔐 pam_tid bulundu; Touch ID doğrulaması bekleniyor."
fi
echo "🔒 Doğrulama gerekiyor (Touch ID veya parola)..."
if ! sudo -v; then
  echo "❌ Kimlik doğrulama başarısız veya iptal edildi." >&2
  exit 1
fi
echo "✅ Kimlik doğrulama başarılı."

# Sunucuyu başlat
cd "$(dirname "$0")" || exit 1
python3 http_utf8_server.py & disown
sleep 1

# Chrome ile aç; yoksa bilgi ver ve varsayılan tarayıcıyı kullan
if [[ -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]]; then
  open -a "Google Chrome" http://127.0.0.1:8000/admin.html
else
  osascript -e 'display alert "Google Chrome bulunamadı. Lütfen Chrome yükleyin veya admin paneline varsayılan tarayıcı ile devam edin." as warning'
  open http://127.0.0.1:8000/admin.html
fi
