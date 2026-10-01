#!/usr/bin/env bash
# Runs INSIDE the emscripten/emsdk container (invoked by build.sh via `docker run`).
# Repo root is bind-mounted at /src and is the working directory.
set -euo pipefail

# The bind-mounted repo is owned by the host user, not whatever UID this
# container runs as — git refuses to touch it ("detected dubious ownership")
# without this. Safe here: the container is single-purpose and ephemeral,
# not a shared/multi-tenant environment.
git config --global --add safe.directory '*'

ROOT=/src
BASH_SRC="$ROOT/wasm/bash/vendor/bash"
PATCH_DIR="$ROOT/wasm/bash/patches"
OUT_DIR="$ROOT/public/bash"
PTY_JS_LIB="$ROOT/node_modules/xterm-pty/emscripten-pty.js"
TOOL_BRIDGE_JS_LIB="$ROOT/wasm/bash/wasm-tool-bridge.js"

if [ ! -f "$BASH_SRC/configure" ]; then
  echo "error: $BASH_SRC/configure not found — did you run 'git submodule update --init --recursive'?" >&2
  exit 1
fi

if [ ! -f "$PTY_JS_LIB" ]; then
  echo "error: $PTY_JS_LIB not found — run 'pnpm install' first so xterm-pty is in node_modules." >&2
  exit 1
fi

# Reset the submodule checkout to the pinned commit and drop any build
# leftovers from a previous run, then re-apply our patches on top. The
# submodule checkout itself is never committed-to; patches live in git,
# the checkout state here is always disposable/reproducible from VERSION.
PINNED_COMMIT="$(sed -n '2p' "$ROOT/wasm/bash/VERSION")"
cd "$BASH_SRC"
git clean -xdf
git checkout -f "$PINNED_COMMIT"

if [ -n "$(ls -A "$PATCH_DIR" 2>/dev/null)" ]; then
  for patch in "$PATCH_DIR"/*.patch; do
    echo "applying $patch"
    patch -p1 < "$patch"
  done
fi

# --- configure --------------------------------------------------------
# Scope: bash builtins only, no fork/exec, no job control, no coreutils.
# Readline is kept ENABLED: xterm-pty's slave implements real termios
# (TCGETS/TCSETS) + TIOCGWINSZ semantics, so it behaves like a genuine
# tty device and readline negotiates raw mode against it the normal way
# a real terminal would — this was confirmed against xterm-pty's docs,
# not assumed. --disable-job-control stays off: there's no fork(), so
# there are no real process groups for bg/fg/^Z to operate on anyway.
#
# IMPORTANT: the Emscripten output-shaping flags (-sMODULARIZE, EXPORT_ES6,
# ASYNCIFY, --js-library, …) must NOT be present in LDFLAGS during
# `configure` itself — configure's own C-compiler sanity check tries to
# produce a directly-runnable conftest, and `-sENVIRONMENT=web` makes emcc
# refuse to do that ("EXECUTABLE requires `node` in ENVIRONMENT"), which
# makes configure wrongly conclude "C compiler cannot create executables"
# and abort. Those flags are only added to LDFLAGS further down, for the
# final `emmake make bash` link step.
#
# bash_cv_signal_vintage=posix: configure's own link-test for this probes
# `sigsuspend`, which Emscripten's libc doesn't provide — the test fails,
# bash falls back to its pre-POSIX signal-handling code path, which then
# conflicts with (actually-POSIX) sigset_t from Emscripten's real headers
# and fails to compile. Emscripten DOES support the POSIX signal API bash
# actually needs (sigaction/sigprocmask/sigemptyset/sigaddset) — just not
# sigsuspend specifically — so force the cache variable bash's configure
# already supports overriding via the environment, rather than patching.
export bash_cv_signal_vintage=posix
# ac_cv_func_pselect=no: even on the pinned Emscripten 3.1.69 (see
# Dockerfile), xterm-pty's emscripten-pty.js wraps __syscall__newselect and
# __syscall_poll but NOT __syscall_pselect6. readline's blocking wait tries
# pselect() first when HAVE_PSELECT is defined; that syscall isn't wrapped,
# falls through to an unsupported-syscall stub, and bash treats the error
# as if it hit EOF — it prints "exit" and quits right after the first
# prompt, exactly like pressing Ctrl-D would. Forcing this off makes
# readline fall back to plain select(), which IS properly wrapped.
export ac_cv_func_pselect=no
unset LDFLAGS

emconfigure ./configure \
  --host=wasm32-unknown-emscripten \
  --build=x86_64-pc-linux-gnu \
  --without-bash-malloc \
  --disable-job-control \
  --disable-progcomp \
  --disable-net-redirections \
  --disable-nls

# NEED_EXTERN_PC: readline's terminal.c defines its own global PC/BC/UP
# termcap variables on any platform it doesn't recognize as __linux__ (the
# Emscripten target isn't recognized), which duplicate-symbol-clashes with
# bash's own bundled lib/termcap (selected because no system
# termcap/terminfo/curses was found while cross-compiling) — both define
# the same globals. readline already supports exactly this split via
# NEED_EXTERN_PC (used by other platforms with a separate termcap lib),
# which turns its copies into `extern` declarations instead of definitions.
# ASYNCIFY_STACK_SIZE: the default (4KB) isn't enough for bash's startup
# call depth (readline init, termios negotiation, …) — it crashes with
# "RuntimeError: unreachable ... may be due to ASYNCIFY_STACK_SIZE not
# being large enough" partway through boot. 1MB is comfortably enough in
# practice; shrink later if binary size/perf matters more than margin.
emmake make CPPFLAGS="-DNEED_EXTERN_PC" bash \
  LDFLAGS="-sFORCE_FILESYSTEM=1 -sEXPORTED_RUNTIME_METHODS=FS,callMain,ccall,cwrap -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web -sASYNCIFY=1 -sASYNCIFY_STACK_SIZE=1048576 -sEXIT_RUNTIME=1 --js-library=$PTY_JS_LIB --js-library=$TOOL_BRIDGE_JS_LIB"

mkdir -p "$OUT_DIR"
# emcc's `-o bash` names the JS glue file literally "bash" (no .js
# extension) and writes the wasm binary alongside as "bash.wasm".
cp bash "$OUT_DIR/bash.js"
cp bash.wasm "$OUT_DIR/bash.wasm"
echo "wrote $OUT_DIR/bash.js and $OUT_DIR/bash.wasm"
