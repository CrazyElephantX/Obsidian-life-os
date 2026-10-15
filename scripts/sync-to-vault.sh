#!/usr/bin/env bash
# Синхронизация сборки плагина в Obsidian vault.
# Путь к vault можно переопределить: LIFEOS_VAULT=/path/to/vault npm run sync
set -euo pipefail

VAULT="${LIFEOS_VAULT:-/Users/cex/Documents/obsidian_cex_secondBrain}"
TARGET="$VAULT/.obsidian/plugins/lifeos"

if [ ! -f main.js ]; then
  echo "main.js не найден. Сначала собери плагин: npm run build (или npm run dev)." >&2
  exit 1
fi

mkdir -p "$TARGET"
cp main.js manifest.json styles.css "$TARGET"

# Канонические источники (шаблоны и .opencode) кладём рядом с плагином —
# пригодится для кнопки «Установить конфигурацию» и отладки.
mkdir -p "$TARGET/canonical"
cp -R templates "$TARGET/canonical/" 2>/dev/null || true
cp -R lifeos-opencode "$TARGET/canonical/" 2>/dev/null || true

echo "Synced to $TARGET"