# Builds BusyBox to WebAssembly with Emscripten.
#
# Usage (from repo root): pnpm run build:busybox
# which runs wasm/busybox/build.sh, which in turn drives this image.
#
# Pinned to the same 3.1.69 as wasm/bash/Dockerfile. BusyBox itself has no
# dependency on that specific version (unlike bash, which needs it for
# xterm-pty's poll()/select() syscall plumbing) -- pinned anyway so the whole
# repo only ever needs to maintain one Emscripten version.
FROM emscripten/emsdk:3.1.69

# Don't assume the base image has these -- build-inner.sh needs them to reset
# the vendored submodule checkout.
RUN apt-get update && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src
