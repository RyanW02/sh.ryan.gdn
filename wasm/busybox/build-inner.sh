#!/usr/bin/env bash
# Runs INSIDE the emscripten/emsdk container (invoked by build.sh via `docker run`).
# Repo root is bind-mounted at /src and is the working directory.
set -euo pipefail

# The bind-mounted repo is owned by the host user, not whatever UID this
# container runs as -- git refuses to touch it ("detected dubious ownership")
# without this. Safe here: the container is single-purpose and ephemeral,
# not a shared/multi-tenant environment.
git config --global --add safe.directory '*'

ROOT=/src
BB_SRC="$ROOT/wasm/busybox/vendor/busybox"
BB_CONFIG="$ROOT/wasm/busybox/busybox.config"
OUT_DIR="$ROOT/public/tools"

if [ ! -f "$BB_SRC/Makefile" ]; then
  echo "error: $BB_SRC/Makefile not found -- did you run 'git submodule update --init --recursive'?" >&2
  exit 1
fi

# Reset the submodule checkout to the pinned commit and drop any build
# leftovers from a previous run. The submodule checkout itself is never
# committed-to; busybox.config lives in git, the checkout state here is
# always disposable/reproducible from VERSION.
PINNED_COMMIT="$(sed -n '2p' "$ROOT/wasm/busybox/VERSION")"
cd "$BB_SRC"
git clean -xdf
git checkout -f "$PINNED_COMMIT"

cp "$BB_CONFIG" .config

# oldconfig resolves any Kconfig prompts that busybox.config doesn't already
# answer (e.g. if VERSION's pinned commit ever moves and introduces new
# options). Redirecting from /dev/null makes every prompt read EOF
# immediately, which Kconfig treats as "take the default", same as running
# it interactively and just pressing enter every time -- there should be none
# for the exact commit busybox.config was generated against, but this keeps
# the build non-interactive either way instead of hanging in CI. (Piping
# `yes ""` instead would do the same thing but trips `set -o pipefail`: once
# make closes its end of the pipe, `yes` dies from SIGPIPE and that becomes
# the whole pipeline's reported exit status even though make itself
# succeeded.)
make CC=emcc oldconfig </dev/null

# --- build --------------------------------------------------------
# Scope: no fork/exec, no mounts, no networking, no daemons -- same wall as
# bash's own build. busybox.config enables only applets that are plain
# file/text utilities (ls, cat, sed, awk, ...); CONFIG_SH_IS_NONE/
# CONFIG_BASH_IS_NONE keep busybox's own ash out entirely since bash is the
# shell here, not busybox's.
#
# Two of busybox's own build-system assumptions don't survive Emscripten and
# have to be bypassed outright (unlike bash, which only needed a handful of
# configure-time cache-variable overrides):
#
# 1. `make busybox` normally links via scripts/trylink, a size-optimization
#    script that iteratively drops unneeded libraries by relinking and
#    checking for undefined symbols. It unconditionally passes
#    `-Wl,--warn-common -Wl,-Map,...` to the linker -- real GNU ld accepts
#    these, but Emscripten's wasm-ld does not ("unknown argument:
#    --warn-common"), and there's no Kconfig/env knob to turn that off.
#    `cmd_busybox__` is explicitly declared with `?=` in the Makefile
#    specifically so it can be overridden from the command line, which is
#    exactly what we do here: a plain direct link, skipping trylink's
#    relink-and-shrink loop entirely (binary size isn't a concern at this
#    project's scale).
#
# 2. CONFIG_EXTRA_LDLIBS is a Kconfig *string* option, stored in .config as
#    `CONFIG_EXTRA_LDLIBS=""` -- i.e. the two literal quote characters are
#    part of the make variable's value when unset. trylink's own shell
#    script absorbs those quotes naturally (it's passed through a quoted
#    shell argument, so adjacent `""` collapse to nothing). Our override
#    expands it directly inside `$(addprefix -l,...)`, a pure make context
#    with no shell involved, so the quote characters survive verbatim and
#    produce a literal `-l""` argument -- which doesn't error at the shell
#    level (emcc is called directly, not through a shell that would word-
#    split or strip it) but crashes emcc's own Python argument parser
#    (`emcc.py: IndexError: list index out of range`) since it's one
#    well-formed-looking but semantically empty flag. `$(subst $(quote),,...)`
#    strips the quote characters before prefixing, same effect as trylink's
#    shell-level quoting gets for free.
#
# `make busybox` also normally strips the linked binary with the host's
# real ELF `strip`, which doesn't understand emcc's JS+wasm output
# ("file format not recognized") -- SKIP_STRIP=y (an officially supported
# Makefile variable) makes it `cp` straight through instead.
#
# The Emscripten output-shaping flags mirror wasm/bash/build-inner.sh's
# final link step, minus ASYNCIFY and --js-library: busybox never blocks on
# real terminal I/O (its stdin callback is a simple synchronous buffer
# pump, same pattern wasm-tool-bridge.js already uses for every external
# tool) and never calls into custom JS, so neither is needed here.
emmake make CC=emcc AR=emar SKIP_STRIP=y \
  LDFLAGS="-sFORCE_FILESYSTEM=1 -sEXPORTED_RUNTIME_METHODS=FS,callMain,ccall,cwrap -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web -sEXIT_RUNTIME=1" \
  'cmd_busybox__=$(CC) $(CFLAGS) $(CFLAGS_busybox) $(LDFLAGS) $(EXTRA_LDFLAGS) -o $@ $(core-y) $(libs-y) $(addprefix -l,$(LDLIBS)) $(addprefix -l,$(subst $(quote),,$(CONFIG_EXTRA_LDLIBS)))' \
  busybox

mkdir -p "$OUT_DIR"
# emcc's `-o busybox_unstripped` (the target name busybox's own Makefile
# requires) names the JS glue file literally "busybox_unstripped" (no .js
# extension) and writes the wasm binary alongside as
# "busybox_unstripped.wasm". The JS glue requests its wasm file by that
# exact baked-in name at runtime (via locateFile), so the .wasm file must
# keep this name -- only the JS glue itself is renamed, for consistency with
# every other tool's <name>.js convention.
cp busybox_unstripped "$OUT_DIR/busybox.js"
cp busybox_unstripped.wasm "$OUT_DIR/busybox_unstripped.wasm"
echo "wrote $OUT_DIR/busybox.js and $OUT_DIR/busybox_unstripped.wasm"
