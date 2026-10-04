#!/usr/bin/env bash
# Builds BusyBox to WebAssembly via Docker + Emscripten and writes the
# result to public/tools/{busybox.js,busybox_unstripped.wasm} (gitignored --
# see wasm/bash/README.md for why build artifacts aren't committed; the same
# reasoning applies here).
#
# Run from the repo root: pnpm run build:busybox
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

if [ ! -f wasm/busybox/vendor/busybox/Makefile ]; then
  echo "error: wasm/busybox/vendor/busybox submodule is not checked out." >&2
  echo "run: git submodule update --init --recursive" >&2
  exit 1
fi

IMAGE=sh-ryan-gdn-busybox-builder

docker build -t "$IMAGE" -f wasm/busybox/Dockerfile wasm/busybox
docker run --rm \
  -v "$(pwd):/src" \
  -w /src \
  "$IMAGE" \
  bash wasm/busybox/build-inner.sh
