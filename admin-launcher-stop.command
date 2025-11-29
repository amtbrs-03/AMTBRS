#!/bin/zsh

# macOS kullanıcı parolası ile doğrulama
AUTH_SCRIPT='do shell script "id -u" with administrator privileges'
if ! osascript -e "$AUTH_SCRIPT" >/dev/null 2>&1; then
  osascript -e 'display alert "Kimlik doğrulama iptal edildi veya başarısız oldu." as warning'
  exit 1
fi

# UTF-8 sunucusunu durdur (127.0.0.1:8000 üzerinde çalışan python http_utf8_server.py)
# Yöntem: http_utf8_server.py sürecini bulup sonlandır
PIDS=$(pgrep -f "http_utf8_server.py")
if [[ -n "$PIDS" ]]; then
  echo "Sunucu süreçleri sonlandırılıyor: $PIDS"
  kill $PIDS 2>/dev/null || true
  sleep 1
  # Gerekirse zorla sonlandır
  PIDS2=$(pgrep -f "http_utf8_server.py")
  if [[ -n "$PIDS2" ]]; then
    echo "Zorla sonlandırılıyor: $PIDS2"
    kill -9 $PIDS2 2>/dev/null || true
  fi
  osascript -e 'display alert "Admin UTF-8 sunucusu durduruldu." as informational'
else
  osascript -e 'display alert "Sunucu çalışmıyor gibi görünüyor. İşlem bulunamadı." as informational'
fi
