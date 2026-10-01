# Builds GNU bash to WebAssembly with Emscripten.
#
# Usage (from repo root): pnpm run build:bash
# which runs wasm/bash/build.sh, which in turn drives this image.
#
# Pinned to 3.1.69, NOT "latest" — this is deliberate, not a reproducibility
# nicety. xterm-pty's own emscripten-pty.js --js-library depends on
# Emscripten's internal poll()/select() syscall plumbing, which changed
# incompatibly in newer Emscripten (confirmed broken on 6.0.10: its newer
# doPollAsync/pollOne helper never passes xterm-pty's poll() override the
# notifyCallback it needs to register a real wake-up, so typed input never
# reaches bash — only xterm-pty's own CI-tested versions, "latest" and this
# pinned 3.1.69, are known to work). See build-inner.sh and
# wasm/bash/README.md for the full story.
FROM emscripten/emsdk:3.1.69

# Don't assume the base image has these — build-inner.sh needs them to reset
# the vendored submodule checkout and apply patches.
RUN apt-get update && apt-get install -y --no-install-recommends git patch \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src
