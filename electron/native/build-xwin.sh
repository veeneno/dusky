#!/usr/bin/env bash
# compila o auxiliar de áudio do Windows no servidor Linux com o clang-cl do LLVM e o kit da
# Microsoft que o cargo-xwin já baixou (~/.cache/cargo-xwin/xwin) — sem Zig, sem Windows.
#
#   ./native/build-xwin.sh            (LLVM_BIN=/usr/lib/llvm-21/bin por padrão)
set -euo pipefail
cd "$(dirname "$0")"
LLVM_BIN="${LLVM_BIN:-/usr/lib/llvm-21/bin}"
XWIN="${XWIN:-$HOME/.cache/cargo-xwin/xwin}"
OUT="${OUT:-bin/dusky-audiocap.exe}"
mkdir -p "$(dirname "$OUT")"
"$LLVM_BIN/clang-cl" --target=x86_64-pc-windows-msvc -fuse-ld=lld-link \
  /nologo /O2 /std:c++17 /EHsc /MT /W3 \
  -imsvc "$XWIN/crt/include" -imsvc "$XWIN/sdk/include/ucrt" \
  -imsvc "$XWIN/sdk/include/um" -imsvc "$XWIN/sdk/include/shared" \
  audiocap.cpp /Fe"$OUT" /Fo"${TMPDIR:-/tmp}/audiocap.obj" \
  /link /libpath:"$XWIN/crt/lib/x86_64" /libpath:"$XWIN/sdk/lib/ucrt/x86_64" /libpath:"$XWIN/sdk/lib/um/x86_64" \
  ole32.lib mmdevapi.lib avrt.lib version.lib user32.lib
rm -f "${OUT%.exe}.pdb" "${OUT%.exe}.lib" "${OUT%.exe}.exp"
echo "ok: $OUT ($(du -h "$OUT" | cut -f1))"
