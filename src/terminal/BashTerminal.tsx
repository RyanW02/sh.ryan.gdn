import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { openpty } from 'xterm-pty'
import { loadModuleFactory } from '../wasm/loadEmscriptenModule'
import { wasmToolRegistry } from '../wasm/toolRegistry'
import '@xterm/xterm/css/xterm.css'
import './bashTerminal.css'

const BASH_DIR = '/bash/'
const BASH_MODULE_URL = `${BASH_DIR}bash.js`

export function BashTerminal() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const term = new Terminal({ cursorBlink: true })
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)

    const { master, slave } = openpty()
    term.loadAddon(master)
    term.open(container)
    fitAddon.fit()
    // xterm.js captures keystrokes via a hidden textarea that must have
    // DOM focus — it doesn't grab it automatically on open(), so without
    // this the terminal renders (including its blinking cursor, which
    // blinks on its own timer regardless of focus) but silently ignores
    // all keyboard input until the user happens to click into it.
    term.focus()

    const resizeObserver = new ResizeObserver(() => fitAddon.fit())
    resizeObserver.observe(container)

    let cancelled = false

    void (async () => {
      try {
        const createBashModule = await loadModuleFactory(BASH_MODULE_URL, BASH_DIR)
        if (cancelled) return
        await createBashModule({
          pty: slave,
          // No rc files exist on the ephemeral MEMFS — skip reading them.
          arguments: ['--norc', '--noprofile'],
          // Called from wasm/bash/wasm-tool-bridge.js (linked into bash's
          // own build) whenever a recognized external tool command runs —
          // see wasm/bash/README.md ("External tools") for the full design.
          // Returns an already-locateFile-wired factory, same as bash's own.
          wasmToolLoader: async (name: string) => {
            const entry = wasmToolRegistry[name]
            if (!entry) return null
            return loadModuleFactory(entry.jsUrl, entry.dir)
          },
          // Seeds a one-line marker stub for each registered tool at the
          // real path bash's own $PATH search would find it — runs after
          // the filesystem is initialized but before main()/interactive
          // use starts, so `type`/`command -v`/`ls /usr/bin` all see these
          // as real files, same as execute_disk_command's content-based
          // detection expects (wasm/bash/patches/0002-add-wasm-tool-dispatch.patch).
          preRun: [
            (mod: any) => {
              mod.FS.mkdirTree('/usr/bin')
              for (const name of Object.keys(wasmToolRegistry)) {
                const path = `/usr/bin/${name}`
                mod.FS.writeFile(path, `#!wasmtool ${name}\n`)
                mod.FS.chmod(path, 0o755)
              }
            },
          ],
        })
      } catch (err) {
        console.error('failed to start bash.wasm', err)
        if (!cancelled) {
          term.writeln('\r\nfailed to load bash — see console for details')
        }
      }
    })()

    return () => {
      cancelled = true
      resizeObserver.disconnect()
      term.dispose()
    }
  }, [])

  return <div ref={containerRef} className="bash-terminal" />
}
