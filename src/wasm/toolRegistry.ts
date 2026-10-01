// Where each registered external WASM tool lives. The C-side table
// (wasm/bash/patches/0002-add-wasm-tool-dispatch.patch) only needs to know
// *that* a tool exists by name; this is the JS-side source of truth for
// *where* to load it from. Keep the two lists in sync when adding a tool.
export const wasmToolRegistry: Record<string, { jsUrl: string; dir: string }> = {
  echoargv: { jsUrl: '/tools/echoargv.js', dir: '/tools/' },
}
