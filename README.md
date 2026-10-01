# sh.ryan.gdn

A React + TypeScript SPA built with Vite, deployed to Cloudflare Pages.

## Development

```sh
pnpm install
pnpm run dev
```

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
