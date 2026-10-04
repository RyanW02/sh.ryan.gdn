# BusyBox → WebAssembly build

Compiles BusyBox to a single multi-applet WASM module
(`public/tools/busybox_unstripped.wasm` + glue `public/tools/busybox.js`),
providing broad Unix-utility coverage (`ls`, `cat`, `grep`, `sed`, `awk`, ...)
on top of bash's own builtins via the existing external-tool dispatch
mechanism (see `wasm/bash/README.md`'s "External tools" section for how a
command name resolves to a WASM module in the first place — that mechanism
is unchanged here; this file only covers BusyBox's own build).

## Scope

One applet per plain-file/text Unix utility bash doesn't already provide as
a builtin — see `busybox.config` for the exact enabled set. Deliberately
excludes anything needing real process management, mounts, networking, or
daemons (`ps`, `top`, `mount`, `insmod`, `ifconfig`, `init`, ...) —
fundamentally incompatible with this project's architecture (no real
fork()/exec(), same wall as everywhere else in this repo), not a build-effort
problem. Also excludes BusyBox's own `ash`/`hush` shells entirely
(`CONFIG_SH_IS_NONE`/`CONFIG_BASH_IS_NONE`) since bash is the shell here.

## How to build

```sh
git submodule update --init --recursive   # fetches vendor/busybox if not already present
pnpm run build:busybox                     # runs build.sh, needs a running Docker daemon
```

This writes `public/tools/busybox.js` and
`public/tools/busybox_unstripped.wasm`, which are gitignored and must be
(re)built locally before `pnpm dev` / `pnpm run build` will have these tools
available. Rebuild whenever `VERSION`, `busybox.config`, or
`build-inner.sh`'s build flags change.

## How the pieces fit together

- `Dockerfile` — pins `emscripten/emsdk` to the same `3.1.69` tag
  `wasm/bash/Dockerfile` uses, so the whole repo only needs to maintain one
  Emscripten version. BusyBox has no dependency on this *specific* version
  (unlike bash, which needs it for `xterm-pty` syscall compatibility) — it's
  just reused for consistency.
- `build.sh` — host-side entry point (`pnpm run build:busybox` calls this).
  Builds the Docker image and runs `build-inner.sh` inside it with the repo
  bind-mounted at `/src`.
- `build-inner.sh` — runs inside the container: resets the `vendor/busybox`
  submodule checkout to the pinned commit, copies `busybox.config` in as
  `.config`, runs `make oldconfig` (non-interactively) then `emmake make`
  with the overrides described below, then copies the build output into
  `public/tools/`.
- `vendor/busybox` — git submodule pointing at the official upstream repo
  (`https://git.busybox.net/busybox`), pinned to the commit recorded in
  `VERSION`. Reset to that commit on every build; never edited in place.
- `busybox.config` — a committed, full Kconfig `.config` (generated via
  `make allnoconfig` plus hand-enabling only the applets this project uses),
  playing the same role `wasm/bash/patches/` plays for bash: the thing that
  makes the build reproducible without needing interactive `make menuconfig`.
- `VERSION` — two lines: the upstream tag name, then the exact commit hash
  the submodule is pinned to.

## Build recipe, and why each piece is there

Unlike bash (which only needed configure-time cache-variable overrides and
one source patch), BusyBox's own *build system* makes two assumptions that
don't survive Emscripten at all, both bypassed via `cmd_busybox__ ?=` and
`SKIP_STRIP`, two override points BusyBox's Makefile explicitly supports:

1. **`scripts/trylink` emits GNU-ld-only flags Emscripten's `wasm-ld`
   rejects.** `make busybox` normally links via `trylink`, a size-shrinking
   script that iteratively relinks while dropping unneeded libraries. It
   unconditionally passes `-Wl,--warn-common -Wl,-Map,...`; real `ld` accepts
   these, `wasm-ld` doesn't ("unknown argument: --warn-common"), and there's
   no Kconfig/env knob to turn them off — unlike `--sort-section`/
   `--sort-common` right next to them in the same script, which *are* gated
   by a `check_cc` capability probe. Fix: override `cmd_busybox__` (declared
   with `?=` specifically so it can be overridden) with a plain direct link,
   skipping `trylink`'s relink-and-shrink loop entirely. Binary size isn't a
   concern at this project's scale.

2. **`CONFIG_EXTRA_LDLIBS`'s literal quote characters survive into the
   link command and crash `emcc.py`'s own argument parser.** It's a Kconfig
   *string* option, stored in `.config` as `CONFIG_EXTRA_LDLIBS=""` — the two
   quote characters are part of the make variable's value when unset.
   `trylink`'s shell script absorbs them for free (passed through a quoted
   shell argument, so adjacent `""` collapse to nothing); our override
   expands it inside `$(addprefix -l,...)`, a pure make context with no shell
   involved, so the quotes survive verbatim into a literal `-l""` argument.
   That doesn't error at the shell level (emcc is invoked directly, not
   through a shell that would strip it) but crashes emcc's own Python
   argument parser one level in (`emcc.py: IndexError: list index out of
   range` in `phase_parse_arguments`, found by actually running the build,
   not predicted in advance). Fix: `$(subst $(quote),,...)` strips the quote
   characters before prefixing.

Separately, `make busybox` also normally strips the linked binary with the
host's real ELF `strip`, which doesn't understand emcc's JS+wasm output
("file format not recognized") — `SKIP_STRIP=y` (an officially supported
Makefile variable, not a hack) makes it `cp` straight through instead.

Two Kconfig settings in `busybox.config` exist specifically for Emscripten,
found the same empirical way:

- **`CONFIG_LFS=y`.** With it off, BusyBox assumes `sizeof(off_t) ==
  sizeof(long)` (true on real 32-bit Linux); Emscripten's libc has an 8-byte
  `off_t` but a 4-byte `long`, which trips `BUG_off_t_size_is_misdetected` in
  `include/libbb.h`. `CONFIG_LFS=y` switches BusyBox's internal `uoff_t` to
  `unsigned long long` (8 bytes), matching Emscripten's real `off_t`.
- **`CONFIG_SH_IS_NONE=y` / `CONFIG_BASH_IS_NONE=y`.** These are separate
  from `CONFIG_ASH` (the standalone `ash` applet toggle, already off) — they
  pick which backend implements the generic `sh`/`bash` names, and default
  to `ash` even with the applet itself disabled. Leaving the default on
  dragged `shell/lib.a(ash.o)` into the link and produced `undefined symbol:
  sigsuspend` (Emscripten's libc doesn't provide it) — the exact same missing
  symbol bash's own build works around via `bash_cv_signal_vintage=posix`
  (see `wasm/bash/README.md`), but there's no corresponding BusyBox knob to
  make `ash` tolerate its absence, so the fix here is to not link `ash` at
  all. Correct regardless: bash is the shell in this project, not BusyBox's.

The Emscripten output-shaping flags in `build-inner.sh`'s final link mirror
`wasm/bash/build-inner.sh`'s, minus `ASYNCIFY` and `--js-library`: BusyBox
never blocks on real terminal I/O (its `stdin` callback is a plain
synchronous buffer pump, same pattern `wasm-tool-bridge.js` already uses for
every external tool) and never calls into custom JS, so neither is needed.

Validated via the same technique as every other milestone in this repo:
actually running the built module (first a 3-applet `ls`/`cat`/`grep` spike
to prove the recipe, then the full applet set) against a simulated FS/stdio
harness and checking real output, not just a clean exit code — confirmed
`thisProgram`-based applet dispatch (`wasm-tool-bridge.js` passing
`thisProgram: name` into the module config, since BusyBox resolves which
applet to run from `argv[0]`, not from which binary was invoked) works
end-to-end across the full applet list, and confirmed two different applet
names invoked in the same session don't re-fetch the shared binary
(`loadModuleFactory`'s per-`jsUrl` cache in `src/wasm/loadEmscriptenModule.ts`).

## Licensing

BusyBox is GPLv2-only (deliberately, not GPLv3). Because
`public/tools/busybox_unstripped.wasm` is a compiled distribution of
BusyBox, this directory — the pinned submodule commit, `busybox.config`, and
the build scripts — is the corresponding source for that artifact,
satisfying GPLv2 even though the compiled binary itself isn't committed to
git. See `THIRD_PARTY_NOTICES.md` at the repo root.
