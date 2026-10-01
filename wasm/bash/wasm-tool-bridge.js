// Asyncify bridge for bash's execute_wasm_tool_command (execute_cmd.c).
//
// Runs a separately-compiled Emscripten tool module (e.g. sed.wasm) to
// completion against a fresh, private instance -- see wasm/bash/README.md
// ("external tools") for the full design. This file is linked into bash's
// own build via --js-library, same mechanism xterm-pty's emscripten-pty.js
// already uses for fd_read.
//
// Helper functions shared between library functions must themselves be
// registered here with a `$`-prefixed name (and listed in `__deps`) --
// plain top-level `function` declarations in this file are NOT visible at
// runtime, since Emscripten extracts/re-serializes each mergeInto entry
// independently rather than preserving this file's own lexical scope.

mergeInto(LibraryManager.library, {
  $wasmToolWriteToFd: function (fd, text) {
    if (!text) return;
    var bytes = new TextEncoder().encode(text);
    var stream = FS.getStream(fd);
    if (!stream) return;
    FS.write(stream, bytes, 0, bytes.length);
  },

  // Recursively copies a filesystem tree from one Emscripten FS instance to
  // another. Whole-tree, not just cwd/argv-named files -- simplest correct
  // choice at this (tutorial-scale) filesystem size. Skips synthetic device
  // mounts, which aren't plain files/directories and can't be read/written
  // the same way.
  $wasmToolShouldSkipFSEntry: function (entry) {
    return entry === 'dev' || entry === 'proc';
  },

  $wasmToolCopyFSTree__deps: ['$wasmToolShouldSkipFSEntry'],
  $wasmToolCopyFSTree: function (srcFS, destFS, path) {
    var entries;
    try {
      entries = srcFS.readdir(path);
    } catch {
      return;
    }

    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      if (entry === '.' || entry === '..') continue;
      if (path === '/' && wasmToolShouldSkipFSEntry(entry)) continue;

      var srcPath = path === '/' ? '/' + entry : path + '/' + entry;
      var stat;
      try {
        stat = srcFS.stat(srcPath);
      } catch {
        continue;
      }

      if (srcFS.isDir(stat.mode)) {
        try {
          destFS.mkdir(srcPath);
        } catch {
          /* already exists -- fine */
        }
        wasmToolCopyFSTree(srcFS, destFS, srcPath);
      } else if (srcFS.isFile(stat.mode)) {
        try {
          var data = srcFS.readFile(srcPath);
          destFS.writeFile(srcPath, data);
        } catch {
          /* best-effort */
        }
      }
    }
  },

  wasm_exec_tool__deps: ['$FS', '$wasmToolWriteToFd', '$wasmToolCopyFSTree'],
  wasm_exec_tool__async: true,
  wasm_exec_tool: function (namePtr, argvPtr, stdinPtr, stdinLen) {
    return Asyncify.handleAsync(async () => {
      const name = UTF8ToString(namePtr);

      const argv = [];
      for (let i = 0; ; i++) {
        const strPtr = HEAP32[(argvPtr >> 2) + i];
        if (!strPtr) break;
        argv.push(UTF8ToString(strPtr));
      }

      // Copy out of wasm memory now -- HEAPU8 is a live view and the
      // underlying buffer can be detached/resized by the time we're done
      // awaiting module loading below.
      const stdinBytes = stdinLen > 0 ? HEAPU8.slice(stdinPtr, stdinPtr + stdinLen) : new Uint8Array(0);

      const loadTool = Module['wasmToolLoader'];
      let exitCode = 127;
      let stderrText = '';

      try {
        if (!loadTool) {
          throw new Error('no wasm tool loader configured');
        }
        const factory = await loadTool(name);
        if (!factory) {
          throw new Error(name + ': tool not registered');
        }

        const stdoutChunks = [];
        const stderrChunks = [];
        let stdinPos = 0;

        const toolModule = await factory({
          noInitialRun: true,
          print: (line) => stdoutChunks.push(line + '\n'),
          printErr: (line) => stderrChunks.push(line + '\n'),
          stdin: () => (stdinPos < stdinBytes.length ? stdinBytes[stdinPos++] : null),
        });

        wasmToolCopyFSTree(FS, toolModule.FS, '/');
        try {
          toolModule.FS.chdir(FS.cwd());
        } catch {
          /* best-effort -- cwd may not exist in the tool's fresh FS yet */
        }

        exitCode = toolModule.callMain(argv.slice(1));

        wasmToolCopyFSTree(toolModule.FS, FS, '/');

        wasmToolWriteToFd(1, stdoutChunks.join(''));
        stderrText = stderrChunks.join('');
      } catch (err) {
        stderrText += name + ': ' + (err && err.message ? err.message : String(err)) + '\n';
        exitCode = 126;
      }

      if (stderrText) {
        wasmToolWriteToFd(2, stderrText);
      }

      return exitCode;
    });
  },
});
