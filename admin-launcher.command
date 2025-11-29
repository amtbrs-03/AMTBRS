#!/bin/zsh

# macOS Touch ID / Parola ile doğrulama (sudo -v pam_tid desteği)
# pam_tid etkin ise kullanıcı parmak izi ile doğrulanabilir; değilse parola sorulur.
AUTH_SCRIPT='do shell script "sudo -v" with administrator privileges'
if ! osascript -e "$AUTH_SCRIPT" >/dev/null 2>&1; then
  osascript -e 'display alert "Kimlik doğrulama iptal edildi veya başarısız oldu." as warning'
  exit 1
fi

cd "$(dirname "$0")" || exit 1

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
  python3 http_utf8_server.py &
  sleep 1
  if [[ -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]]; then
    open -a "Google Chrome" http://127.0.0.1:8000/admin.html
  else
    osascript -e 'display alert "Google Chrome bulunamadı. Lütfen Chrome yükleyin." as warning'
    open http://127.0.0.1:8000/admin.html
  fi
fi
