# Third-party notices

This project builds and ships a compiled WebAssembly binary of GNU Bash, and
uses the following third-party software:

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
