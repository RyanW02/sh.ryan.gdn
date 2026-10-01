#!/usr/bin/env bash
# Builds the trivial validation spike tool (see wasm/bash/README.md,
# "External tools") to public/tools/. Not a real milestone deliverable —
# just scaffolding used to validate the wasm-tool-dispatch mechanism before
# building anything real (sed) on top of it. Simple enough to not need its
# own Dockerfile/autotools treatment; reuses bash's pinned emsdk image
# directly.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

docker run --rm \
  -v "$(pwd):/src" \
  -w /src/wasm/spike-tool \
  emscripten/emsdk:3.1.69 \
  emcc echoargv.c -o echoargv.js \
    -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web \
    -sEXPORTED_RUNTIME_METHODS=callMain,FS -sEXIT_RUNTIME=1 \
    -sFORCE_FILESYSTEM=1

mkdir -p public/tools
cp wasm/spike-tool/echoargv.js wasm/spike-tool/echoargv.wasm public/tools/
echo "wrote public/tools/echoargv.js and public/tools/echoargv.wasm"
