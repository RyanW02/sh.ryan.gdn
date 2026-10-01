# sh.ryan.gdn

A React + TypeScript SPA built with Vite, deployed to Cloudflare Pages.

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

Deployed as a static site to Cloudflare Pages via Wrangler (no Pages Functions).

```sh
pnpm dlx wrangler login   # first time only, opens a browser
pnpm run deploy           # builds and deploys dist/ to Cloudflare Pages
```

The first deploy creates the Pages project (`sh-ryan-gdn`, see `wrangler.jsonc`) if it doesn't exist yet.

### Custom domain

Cloudflare Pages custom domains aren't configurable via `wrangler.jsonc`/CLI — add
`sh.ryan.gdn` under **Workers & Pages → sh-ryan-gdn → Custom domains** in the
Cloudflare dashboard (the `ryan.gdn` zone must already be on Cloudflare).
