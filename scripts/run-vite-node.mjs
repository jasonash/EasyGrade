/**
 * Run a TypeScript script under Electron's Node (for better-sqlite3's ABI)
 * through vite-node, using the vitest config for the @shared alias.
 */
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const require = createRequire(import.meta.url)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const electronBinary = require('electron')
const viteNode = resolve(root, 'node_modules/vite-node/vite-node.mjs')

const child = spawn(electronBinary, [viteNode, '--config', 'vitest.config.ts', ...process.argv.slice(2)], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
})
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  process.exit(code ?? 1)
})
