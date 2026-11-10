#!/usr/bin/env bash
# Recrée public/yucan-extension.zip à partir du dossier extension/
set -euo pipefail
cd "$(dirname "$0")/.."
rm -f public/yucan-extension.zip
(cd extension && zip -rq ../public/yucan-extension.zip . -x '.*')
echo "public/yucan-extension.zip mis à jour"
