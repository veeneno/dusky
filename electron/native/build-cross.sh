#!/usr/bin/env bash
# compila o auxiliar de áudio do Windows a partir do Linux (ou macOS), usando o Zig como
# compilador cruzado — não precisa instalar nada no sistema, só ter o zig no PATH (ou em $ZIG).
#
#   ZIG=/caminho/do/zig ./native/build-cross.sh
#
# no Windows, prefira native/build-win.cmd (MSVC).
set -euo pipefail
cd "$(dirname "$0")"
ZIG="${ZIG:-zig}"
mkdir -p bin
"$ZIG" c++ -target x86_64-windows-gnu -O2 -std=c++17 -static \
  audiocap.cpp -o bin/didiscord-audiocap.exe \
  -lole32 -lmmdevapi -lavrt -lversion
rm -f bin/didiscord-audiocap.pdb
echo "ok: $(pwd)/bin/didiscord-audiocap.exe ($(du -h bin/didiscord-audiocap.exe | cut -f1))"
