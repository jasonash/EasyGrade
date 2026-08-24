/**
 * Run vitest inside Electron's Node runtime.
 *
 * better-sqlite3 is rebuilt against Electron's ABI by `electron-builder
 * install-app-deps`, so tests that touch the database must run under the
 * same runtime. ELECTRON_RUN_AS_NODE makes the Electron binary behave as a
 * plain Node process (no window, no GUI requirement).
 */
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const require = createRequire(import.meta.url)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const electronBinary = require('electron')
const vitestCli = resolve(root, 'node_modules/vitest/vitest.mjs')

const args = process.argv.slice(2)
const child = spawn(electronBinary, [vitestCli, ...args], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
})
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  process.exit(code ?? 1)
})
