// Shared loader for prebuilt Emscripten modules (bash.js, and external tool
// modules like sed.js) served from public/ as gitignored build artifacts.
//
// Vite's dev server refuses to serve public/ files through its module
// import pipeline at all, even with /* @vite-ignore */ on a direct dynamic
// import — so the glue JS is fetched as plain text and re-imported from a
// blob: URL instead, which bypasses Vite entirely (the browser resolves
// blob: URLs natively). A module loaded this way can't infer its own
// directory from import.meta.url to find its .wasm file, so the returned
// factory already has `locateFile` wired up to `dir`.

type EmscriptenModule = any

export type EmscriptenModuleFactory = (config?: Record<string, any>) => Promise<EmscriptenModule>

// Keyed by jsUrl, not by tool name -- several different tool names can
// resolve to the same underlying module (e.g. every BusyBox applet shares
// one busybox.js/busybox.wasm). Caching the raw factory means that shared
// binary is fetched/compiled once per session, not once per invocation;
// each call to the returned wrapper still produces a fresh running
// instance, which is exactly what Emscripten's MODULARIZE factories are
// designed to support. Caching the promise itself (not just its eventual
// value) avoids a duplicate fetch if two invocations race before the first
// one resolves.
const factoryCache = new Map<string, Promise<EmscriptenModuleFactory>>()

async function loadRawFactory(jsUrl: string): Promise<EmscriptenModuleFactory> {
  const code = await fetch(jsUrl).then((res) => res.text())
  const blobUrl = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }))
  try {
    return (await import(/* @vite-ignore */ blobUrl)).default
  } finally {
    URL.revokeObjectURL(blobUrl)
  }
}

export async function loadModuleFactory(jsUrl: string, dir: string): Promise<EmscriptenModuleFactory> {
  let cached = factoryCache.get(jsUrl)
  if (!cached) {
    cached = loadRawFactory(jsUrl)
    factoryCache.set(jsUrl, cached)
    // Don't leave a permanently-broken cache entry behind after a
    // transient failure (e.g. a network blip) -- let a later call retry.
    cached.catch(() => factoryCache.delete(jsUrl))
  }
  const rawFactory = await cached

  return (config = {}) => rawFactory({ ...config, locateFile: (path: string) => `${dir}${path}` })
}
