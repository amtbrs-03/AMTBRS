#!/usr/bin/env zsh
# Güvenli yardımcı: mevcut dalı `main` olarak oluşturup remote'a push eder.
# Kullanım: terminalde bu dosyayı çalıştırın: `./push-to-main.sh`
# Not: script, kritik işlemler öncesi onay ister. Force-push/uzak dal silme opsiyoneldir.

set -euo pipefail
CURRENT=$(git branch --show-current 2>/dev/null || echo "")
if [[ -z "$CURRENT" ]]; then
  echo "Git deposu bulunamadı veya branch bilgisi alınamadı." >&2
  exit 1
fi

echo "Mevcut branch: $CURRENT"
read -q "ans?Bu branch'den yeni bir local 'main' oluşturup origin/main olarak push etmek istiyor musunuz? (y/n) "
echo
if [[ "$ans" != "y" ]]; then
  echo "İşlem iptal edildi."
  exit 0
fi

# Durumu göster
git status --short

read -q "commitAns?Değişiklikleri sahneleyip commit etmek ister misiniz? (y/n) "
echo
if [[ "$commitAns" == "y" ]]; then
  read -r "msg?Commit mesajı (boş bırakırsanız varsayılan kullanılacak): "
  msg=${msg:-"Update site files"}
  git add .
  git commit -m "$msg"
fi

# Oluştur ve push et
if git show-ref --verify --quiet refs/heads/main; then
  echo "Local 'main' zaten mevcut. Mevcut branch '$CURRENT' ile birleştirmek istiyorsanız git merge/rebase yapmalısınız." 
  read -q "mergeAns?Local main ile birleştirmek ve main üzerine push etmek istiyor musunuz? (y/n) "
  echo
  if [[ "$mergeAns" == "y" ]]; then
    git checkout main
    git merge --no-ff "$CURRENT"
    git push -u origin main
    echo "Local main güncellendi ve origin/main'e pushlandı."
  else
    echo "Lütfen ihtiyacınıza göre manual adımları uygulayın."
  fi
else
  # main mevcut değilse yeni oluştur
  git checkout -b main
  git push -u origin main
  echo "Yeni local 'main' oluşturuldu ve origin/main olarak pushlandı."
fi

# Uzak eski branch'i silme seçeneği
read -q "delAns?Uzakta origin/$CURRENT dalını silmek ister misiniz? (yalnızca uzak dal silinir, yereldeki dal korunur) (y/n) "
echo
if [[ "$delAns" == "y" ]]; then
  git push origin --delete "$CURRENT"
  echo "origin/$CURRENT silindi."
fi

echo "Tamamlandı. Local branch: $(git branch --show-current)"

echo "Not: Eğer GitHub'da default branch'i değiştirmek isterseniz repo ayarlarından (Settings → Branches) default branch'i 'main' olarak ayarlayın." 
