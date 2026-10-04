// Where each registered external WASM tool lives. The C-side table
// (wasm/bash/patches/0002-add-wasm-tool-dispatch.patch) only needs to know
// *that* a tool exists by name; this is the JS-side source of truth for
// *where* to load it from. Keep the two lists in sync when adding a tool.

// Every applet enabled in wasm/busybox/busybox.config (keep the two in
// sync). All of them share one compiled binary -- loadModuleFactory caches
// by jsUrl, so busybox.js/busybox_unstripped.wasm is only fetched once per
// session no matter how many of these names get invoked.
const busyboxEntry = { jsUrl: '/tools/busybox.js', dir: '/tools/' }
const BUSYBOX_APPLETS = [
  'ls', 'cat', 'cp', 'mv', 'rm', 'mkdir', 'rmdir', 'touch', 'chmod', 'ln',
  'stat', 'basename', 'dirname', 'realpath', 'sort', 'uniq', 'wc', 'head',
  'tail', 'cut', 'tr', 'grep', 'sed', 'awk', 'diff', 'cmp', 'tee', 'split',
  'od', 'seq', 'yes', 'date', 'md5sum', 'sha256sum', 'base64',
]

export const wasmToolRegistry: Record<string, { jsUrl: string; dir: string }> = {
  echoargv: { jsUrl: '/tools/echoargv.js', dir: '/tools/' },
  ...Object.fromEntries(BUSYBOX_APPLETS.map((name) => [name, busyboxEntry])),
}
