# sh.ryan.gdn

A React + TypeScript SPA built with Vite, deployed to GitHub Pages.

Currently: a PoC for an interactive bash-scripting tutorial — a real GNU bash
shell compiled to WebAssembly (via Emscripten) and run entirely client-side in
an xterm.js terminal, with no server. See `wasm/bash/README.md` for how that's
built, and `THIRD_PARTY_NOTICES.md` for licensing.

## Development

```sh
git submodule update --init --recursive  # fetches wasm/bash/vendor/bash
pnpm install
pnpm run build:bash                       # compiles bash to WASM, needs Docker
pnpm run dev
```

`pnpm run build:bash` writes `public/bash/bash.wasm` + `bash.js`, which are
gitignored — re-run it whenever `wasm/bash/VERSION`, `wasm/bash/patches/`, or
the Emscripten build flags change. Without it, the terminal in the app has
nothing to load.

## Deployment

Deployed as a static site to GitHub Pages via `.github/workflows/deploy.yml` —
every push to `main` builds the site (including the WASM artifacts, via Docker)
and publishes it automatically. No manual deploy step; trigger a re-run by
pushing to `main` or via the Actions tab's "Run workflow" button
(`workflow_dispatch`).

The custom domain (`sh.ryan.gdn`) and its DNS verification are already
configured at the GitHub Pages settings level (Settings → Pages) — nothing
repo-side is needed for that beyond the committed `public/CNAME` file, which
exists mainly as a defense-in-depth record of the domain.
