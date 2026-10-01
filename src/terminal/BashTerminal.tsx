import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { openpty } from 'xterm-pty'
import '@xterm/xterm/css/xterm.css'
import './bashTerminal.css'

// The prebuilt bash.wasm module isn't part of Vite's module graph (it's a
// gitignored build artifact copied into public/ by `pnpm run build:bash`).
// Vite's dev server refuses to serve public/ files through its module
// import pipeline at all ("should not be imported from source code"), so
// the glue JS is fetched as plain text and re-imported from a blob: URL,
// which bypasses Vite entirely (the browser resolves blob: URLs natively).
const BASH_DIR = '/bash/'
const BASH_MODULE_URL = `${BASH_DIR}bash.js`

async function loadBashModuleFactory() {
  const code = await fetch(BASH_MODULE_URL).then((res) => res.text())
  const blobUrl = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }))
  try {
    return (await import(/* @vite-ignore */ blobUrl)).default
  } finally {
    URL.revokeObjectURL(blobUrl)
  }
}

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
        const createBashModule = await loadBashModuleFactory()
        if (cancelled) return
        await createBashModule({
          pty: slave,
          // No rc files exist on the ephemeral MEMFS — skip reading them.
          arguments: ['--norc', '--noprofile'],
          // Loaded from a blob: URL now, so the module can't infer its own
          // directory from import.meta.url to find bash.wasm — point it
          // back at the real path explicitly.
          locateFile: (path: string) => `${BASH_DIR}${path}`,
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
