# bash → WebAssembly build

Compiles GNU bash to a WASM module (`public/bash/bash.wasm` + glue
`public/bash/bash.js`) for the in-browser terminal PoC. See the top-level
plan/PR description for the full feature context — this file only covers the
build itself, its licensing shape, and current verification status.

## Scope (PoC)

Bash **builtins only** — no external commands, no pipelines, no fork/exec, no
job control, no persistence. Emscripten has no fork()/exec() support. See
`THIRD_PARTY_NOTICES.md` and the project plan for why, and for what a future
milestone adding real process support would need to look like.

Readline is kept **enabled** (not disabled): `xterm-pty` (the JS bridge used
on the frontend) implements genuine PTY termios semantics (`TCGETS`/`TCSETS`,
`TIOCGWINSZ`), so from bash's point of view it's talking to a real terminal
device and readline negotiates raw mode / does its own line editing the same
way it would against any real tty. This was confirmed against xterm-pty's own
source before building, not assumed, and the build does select "gnutermcap"
(bash's own bundled termcap, no system termcap/terminfo needed) without issue.

## How to build

```sh
git submodule update --init --recursive   # fetches vendor/bash if not already present
pnpm install                                # needed so node_modules/xterm-pty/emscripten-pty.js exists
pnpm run build:bash                         # runs build.sh, needs a running Docker daemon
```

This writes `public/bash/bash.wasm` and `public/bash/bash.js`, which are
gitignored and must be (re)built locally before `pnpm dev` / `pnpm run build`
will have a working terminal. There is currently no CI/auto-deploy pipeline
for this repo (deploys are manual via `pnpm run deploy`) — if one is added
later, it must run `pnpm run build:bash` before `vite build`.

Rebuild whenever `wasm/bash/VERSION`, `wasm/bash/patches/`, or
`wasm/bash/build-inner.sh`'s configure/emcc flags change.

## How the pieces fit together

- `Dockerfile` — pins `emscripten/emsdk` to a specific tag so the build is
  reproducible across machines.
- `build.sh` — host-side entry point (`pnpm run build:bash` calls this). Builds
  the Docker image and runs `build-inner.sh` inside it with the repo
  bind-mounted at `/src`.
- `build-inner.sh` — runs inside the container: resets the `vendor/bash`
  submodule checkout to the pinned commit, applies `patches/*.patch`, runs
  `emconfigure ./configure` + `emmake make` with the flags described below,
  then copies the build output into `public/bash/`.
- `vendor/bash` — git submodule pointing at the official GNU bash repo
  (`git://git.savannah.gnu.org/bash.git`), pinned to the commit recorded in
  `VERSION`. Reset to that commit on every build; never edited in place.
- `patches/` — `.patch` files needed to make bash's source build cleanly under
  Emscripten, applied on top of the pinned commit at build time (currently one
  — see below).
- `VERSION` — two lines: the upstream tag name, then the exact commit hash the
  submodule is pinned to.

## Build recipe, and why each piece is there

This has actually been built and booted successfully (outside Docker, using a
locally-installed emsdk matching the Dockerfile's pinned version, since this
sandbox had no Docker daemon available — `build-inner.sh` encodes the same
recipe for the normal Docker path). Getting there took three real fixes
beyond the naive "emconfigure + emmake" recipe bash-wasm-style projects
describe:

1. **Emscripten's output-shaping flags must NOT be in `LDFLAGS` during
   `./configure`.** `configure`'s own C-compiler sanity check tries to produce
   a directly-runnable conftest; `-sENVIRONMENT=web` makes emcc refuse
   ("EXECUTABLE requires `node` in ENVIRONMENT"), so configure wrongly
   concludes "C compiler cannot create executables" and aborts. Fix: run
   `configure` with a clean environment, and only pass
   `-sMODULARIZE -sEXPORT_ES6 -sENVIRONMENT=web -sASYNCIFY --js-library=…` etc.
   to the final `emmake make bash LDFLAGS="..."` link step.

2. **`bash_cv_signal_vintage=posix` must be forced via the environment.**
   configure's own link-test for this probes `sigsuspend`, which Emscripten's
   libc doesn't provide; the test fails and bash falls back to its pre-POSIX
   signal code path, which then conflicts with the real POSIX `sigset_t` from
   Emscripten's actual headers and fails to *compile* (`execute_cmd.c`:
   "assigning to 'sigset_t' from incompatible type 'int'"). Emscripten DOES
   support the POSIX signal calls bash actually needs — just not
   `sigsuspend` specifically — so override the cache variable bash's own
   configure already supports overriding this way, rather than patching bash.

3. **`-DNEED_EXTERN_PC` must be added to `CPPFLAGS` for the whole build.**
   readline's `lib/readline/terminal.c` defines its own global `PC`/`BC`/`UP`
   termcap variables on any platform it doesn't recognize as `__linux__`
   (Emscripten's target isn't), which duplicate-symbol-clashes with bash's
   own bundled `lib/termcap` (selected because no system
   termcap/terminfo/curses was found while cross-compiling — both then try to
   define the same globals). readline already has a flag for exactly this
   split — `NEED_EXTERN_PC` turns its copies into `extern` declarations
   instead of definitions, which is what e.g. OS/2 builds also set for the
   same reason.

4. One genuine **source patch** was needed (not configure-level): `lib/sh/random.c`
   defines its own `static getrandom()` fallback when `HAVE_GETRANDOM` is
   undefined, but Emscripten's sysroot (under `_GNU_SOURCE`, which bash
   defines) declares a non-static `getrandom` prototype without actually
   providing a linkable implementation — "static declaration of 'getrandom'
   follows non-static declaration". Fixed by renaming bash's fallback via a
   macro (`patches/0001-rename-getrandom-fallback.patch`), scoped to only
   apply when `HAVE_GETRANDOM` is unset so normal/native builds are untouched.

5. **`-sASYNCIFY_STACK_SIZE=1048576`.** The default Asyncify stack (4KB) isn't
   enough for bash's startup call depth (readline init, termios negotiation,
   …); without this it crashes partway through boot with `RuntimeError:
   unreachable ... may be due to ASYNCIFY_STACK_SIZE not being large enough`.

6. **Emscripten must be 3.1.69, not "latest"/6.x.** This one cost the most time
   to find because it doesn't fail the build at all — bash compiles, links,
   and boots to its first prompt either way. The difference only shows up once
   you actually type: on Emscripten 6.0.10, nothing happens, ever, after the
   first prompt. Root cause: `xterm-pty`'s `emscripten-pty.js` registers its
   real `PTY.onReadable()` wake-up by expecting Emscripten to call
   `stream_ops.poll(stream, timeout, notifyCallback)` and use that
   `notifyCallback`. Emscripten 6.0.10's internal `doPollAsync`/`pollOne`
   helper calls it as `stream_ops.poll(stream)` — one argument, no callback —
   so that registration path is dead code. Instead `doPollAsync` falls back to
   its own generic `stream.node.addListener(...)` mechanism, which `xterm-pty`
   never feeds events into, so any blocking `poll()`/`select()` call can only
   ever resolve via its own timeout (or immediately, if the timeout happens to
   be 0) — never via a real keystroke. bash/readline, seeing "no input" come
   back, proceeds as if nothing is listening. `xterm-pty`'s own CI
   (`.github/workflows/ci.yml` on github.com/mame/xterm-pty) tests against
   `"latest"` and a pinned `3.1.69` — **3.1.69 is the one to build against**,
   confirmed working end-to-end (see below).

7. **`ac_cv_func_pselect=no` must also be forced**, even on 3.1.69. readline's
   blocking read (`rl_getc` in `lib/readline/input.c`) prefers `pselect()` over
   `select()` when `HAVE_PSELECT` is defined. `emscripten-pty.js` wraps
   `__syscall__newselect` and `__syscall_poll`, but not `__syscall_pselect6` —
   so a `pselect()` call falls through to Emscripten's unsupported-syscall
   stub, readline treats the resulting error as EOF, and bash does exactly
   what it does when you press Ctrl-D at a real prompt: it prints `exit` and
   quits, right after the very first prompt. Forcing bash's `configure` to
   skip detecting `pselect` (the same environment-variable-override mechanism
   as `bash_cv_signal_vintage`) makes readline fall back to plain `select()`,
   which *is* properly wrapped.

With all of the above, **bash compiles, links, boots, prints its prompt, AND
correctly responds to typed input** — confirmed end-to-end: `echo hello` →
`hello`, `export FOO=bar && echo $FOO` → `bar`, a `for i in 1 2 3; do echo $i;
done` loop → `1`/`2`/`3`, all verified by actually running the built module
against a simulated pty and reading its output back. Two warnings are expected
and harmless given this PoC's scope: `unsupported syscall:
__syscall_getresgid32` and `unsupported syscall: __syscall_wait4` (no
fork/exec means no real process info to report; Emscripten stubs these and
logs a warning rather than crashing).

## Licensing

Bash is GPLv3. Because `public/bash/bash.wasm` is a compiled distribution of
bash, this directory — the pinned submodule commit, the patch, and the build
scripts — is the corresponding source for that artifact, satisfying GPLv3
even though the compiled binary itself isn't committed to git. See
`THIRD_PARTY_NOTICES.md` at the repo root.
