#!/usr/bin/env bash
# Non-interactive version: creates and pushes main branch automatically
# Usage: ./push-to-main-auto.sh [--commit-message "message"] [--delete-source-branch]
# Suitable for CI/CD and automated workflows

set -euo pipefail

# Parse command line arguments
COMMIT_MSG="Update site files"
DELETE_SOURCE=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --commit-message)
      COMMIT_MSG="$2"
      shift 2
      ;;
    --delete-source-branch)
      DELETE_SOURCE=true
      shift
      ;;
    *)
      echo "Unknown option: $1" >&2
      echo "Usage: $0 [--commit-message \"message\"] [--delete-source-branch]" >&2
      exit 1
      ;;
  esac
done

CURRENT=$(git branch --show-current 2>/dev/null || echo "")
if [[ -z "$CURRENT" ]]; then
  echo "Git deposu bulunamadı veya branch bilgisi alınamadı." >&2
  exit 1
fi

echo "Mevcut branch: $CURRENT"

# Check for uncommitted changes and commit them if any
if [[ -n $(git status --short) ]]; then
  echo "Değişiklikler tespit edildi, commit yapılıyor..."
  git add .
  git commit -m "$COMMIT_MSG"
fi

# Create or update main branch
if git show-ref --verify --quiet refs/heads/main; then
  echo "Local 'main' mevcut, güncelleniyor..."
  git checkout main
  git merge --no-ff "$CURRENT" -m "Merge $CURRENT into main"
  git push -u origin main
  echo "Local main güncellendi ve origin/main'e pushlandı."
else
  echo "Yeni local 'main' oluşturuluyor..."
  git checkout -b main
  git push -u origin main
  echo "Yeni local 'main' oluşturuldu ve origin/main olarak pushlandı."
fi

# Optionally delete source branch from remote
if [[ "$DELETE_SOURCE" == "true" && "$CURRENT" != "main" ]]; then
  echo "Uzak branch origin/$CURRENT siliniyor..."
  git push origin --delete "$CURRENT" || echo "Branch silinemedi (zaten silinmiş olabilir)"
fi

echo "Tamamlandı. Şu anki branch: $(git branch --show-current)"
echo "Not: GitHub'da default branch'i 'main' olarak ayarlamayı unutmayın (Settings → Branches)"
