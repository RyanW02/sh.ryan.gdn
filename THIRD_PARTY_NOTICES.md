# Third-party notices

This project builds and ships compiled WebAssembly binaries of GNU Bash and
BusyBox, and uses the following third-party software:

## GNU Bash

- **License:** GPLv3 (see `wasm/bash/vendor/bash/COPYING` once the submodule
  is checked out)
- **Source:** vendored as a git submodule at `wasm/bash/vendor/bash`, pointing
  at the official upstream repository (`git://git.savannah.gnu.org/bash.git`)
  pinned to the exact commit/tag recorded in `wasm/bash/VERSION`.
- **Modifications:** any changes required to cross-compile with Emscripten are
  kept as patch files in `wasm/bash/patches/`, applied on top of the pinned
  submodule commit at build time — the submodule checkout itself is never
  edited in place.
- Because the `bash.wasm` artifact served by this site is a compiled
  distribution of GPLv3-licensed code, this repository's own history (the
  pinned submodule commit + patches + `wasm/bash/build.sh`) is the
  corresponding source for that artifact. See `wasm/bash/README.md` for how to
  reproduce the exact binary.

## BusyBox

- **License:** GPLv2-only (deliberately, not GPLv3 — see
  `wasm/busybox/vendor/busybox/LICENSE` once the submodule is checked out)
- **Source:** vendored as a git submodule at `wasm/busybox/vendor/busybox`,
  pointing at the official upstream repository (`https://git.busybox.net/busybox`)
  pinned to the exact commit recorded in `wasm/busybox/VERSION`.
- **Modifications:** none to the source itself — only a custom Kconfig
  `.config` (`wasm/busybox/busybox.config`, committed) selecting which
  applets are compiled in, and a non-default link step
  (`wasm/busybox/build-inner.sh`) that bypasses two parts of BusyBox's own
  build system (`scripts/trylink`'s GNU-ld-only flags, and the host `strip`
  step) that don't apply to Emscripten's output. The submodule checkout
  itself is never edited in place.
- Because the `busybox.js`/`busybox_unstripped.wasm` artifact served by this
  site is a compiled distribution of GPLv2-licensed code, this repository's
  own history (the pinned submodule commit + `busybox.config` +
  `wasm/busybox/build.sh`) is the corresponding source for that artifact.

## xterm.js (`@xterm/xterm`, `@xterm/addon-fit`)

- **License:** MIT
- Used for the in-browser terminal emulator UI.

## xterm-pty

- **License:** MIT
- Provides the PTY bridge between xterm.js and the Emscripten-compiled
  bash module (termios/line-discipline emulation, stdin/stdout wiring). Its
  `emscripten-pty.js` `--js-library` file is linked into the bash build (see
  `wasm/bash/build.sh`).
