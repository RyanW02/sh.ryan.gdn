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

export async function loadModuleFactory(jsUrl: string, dir: string): Promise<EmscriptenModuleFactory> {
  const code = await fetch(jsUrl).then((res) => res.text())
  const blobUrl = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }))
  let rawFactory: EmscriptenModuleFactory
  try {
    rawFactory = (await import(/* @vite-ignore */ blobUrl)).default
  } finally {
    URL.revokeObjectURL(blobUrl)
  }

  return (config = {}) => rawFactory({ ...config, locateFile: (path: string) => `${dir}${path}` })
}
