#!/bin/zsh
set -e

# Touch ID çalışmıyorsa muhtemel nedenler:
# 1) /etc/pam.d/sudo içinde 'auth       sufficient     pam_tid.so' yok.
# 2) Önceki sudo zaman damgası hala geçerli (yeniden doğrulama tetiklenmiyor).
# 3) AppleScript ile parola diyaloğu kullanılıyordu (pam_tid devre dışı kalır) — terminal içi sudo'ya geçildi.

cd "$(dirname "$0")" || exit 1

# Sudo timestamp'ı sıfırla ki mutlaka yeniden doğrulama istensin
sudo -k || true

# pam_tid var mı kontrol et (bilgi amaçlı)
if ! grep -q 'pam_tid.so' /etc/pam.d/sudo 2>/dev/null; then
  echo "ℹ️  Uyarı: /etc/pam.d/sudo içinde pam_tid.so bulunamadı. Touch ID yerine parola istenebilir."
else
  echo "🔐 Touch ID destek satırı bulundu (pam_tid)."
fi

echo "🔒 Admin paneli açılıyor. Lütfen Touch ID veya parolanızla sudo doğrulayın..."
if ! sudo -v; then
  echo "❌ Kimlik doğrulama başarısız veya iptal edildi." >&2
  exit 1
fi
echo "✅ Kimlik doğrulama başarılı."

# Sunucu çalışıyor mu?
if pgrep -f "http_utf8_server.py" >/dev/null 2>&1; then
  # Çalışıyorsa: Chrome'u odakla ve admin sekmesini öne getir
  ADMIN_URL="http://127.0.0.1:8000/admin.html"
  # Mevcut pencere/sekme admin URL ise aktive et; değilse yeni sekme aç
  osascript <<'APPLES'
  try
    tell application "Google Chrome"
      activate
      set foundTab to false
      repeat with w in windows
        set tlist to tabs of w
        repeat with t in tlist
          if (URL of t as text) starts with "http://127.0.0.1:8000/admin.html" then
            set active tab of w to t
            set foundTab to true
            exit repeat
          end if
        end repeat
        if foundTab then exit repeat
      end repeat
      if not foundTab then
        open location "http://127.0.0.1:8000/admin.html"
      end if
    end tell
  end try
APPLES
else
  # Çalışmıyorsa: sunucuyu başlat ve Chrome'da admini aç
  python3 http_utf8_server.py & disown
  sleep 1
  if [[ -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]]; then
    open -a "Google Chrome" http://127.0.0.1:8000/admin.html
  else
    osascript -e 'display alert "Google Chrome bulunamadı. Lütfen Chrome yükleyin." as warning'
    open http://127.0.0.1:8000/admin.html
  fi
fi
