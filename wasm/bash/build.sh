#!/usr/bin/env bash
# Builds GNU bash to WebAssembly via Docker + Emscripten and writes the
# result to public/bash/{bash.js,bash.wasm} (gitignored — see
# wasm/bash/README.md for why these aren't committed).
#
# Run from the repo root: pnpm run build:bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

if [ ! -f wasm/bash/vendor/bash/configure ]; then
  echo "error: wasm/bash/vendor/bash submodule is not checked out." >&2
  echo "run: git submodule update --init --recursive" >&2
  exit 1
fi

if [ ! -d node_modules/xterm-pty ]; then
  echo "error: node_modules/xterm-pty is missing." >&2
  echo "run: pnpm install" >&2
  exit 1
fi

IMAGE=sh-ryan-gdn-bash-builder

docker build -t "$IMAGE" -f wasm/bash/Dockerfile wasm/bash
docker run --rm \
  -v "$(pwd):/src" \
  -w /src \
  "$IMAGE" \
  bash wasm/bash/build-inner.sh
