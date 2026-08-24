# EasyGrade

EasyGrade is a desktop application that lets teachers create short multiple-choice tests, print them as single-page scannable sheets, and grade a stack of scanned sheets in one pass.

It runs on macOS, Windows, and Linux. All data stays on the teacher's computer.

## Development

Requirements: Node 20 and npm.

```bash
npm install          # also rebuilds better-sqlite3 for Electron
npm run dev          # start the app with hot reload
npm run typecheck    # strict TypeScript, main + renderer
npm test             # vitest (runs under Electron's Node runtime)
npm run build        # production bundle into dist/
npm run package      # build distributables into release/
```

### Project layout

```
src/main/       Electron main process: window, SQLite, services, IPC handlers
src/preload/    contextBridge exposing window.easygrade
src/renderer/   React + Material UI
src/shared/     Types, Zod schemas, IPC contract, pure logic shared by both sides
tests/          Vitest unit tests
```

### Notes

- `npm test` runs vitest through `scripts/run-vitest.mjs`, which launches Electron with `ELECTRON_RUN_AS_NODE=1`. This is required because `better-sqlite3` is compiled against Electron's ABI, not the system Node's.
- The UI is Material UI only. Dark theme is the default.
- Commit messages use a `[Type]` prefix: `[Feature]`, `[Fix]`, `[Refactor]`, `[Chore]`.

## License

Apache 2.0. See `LICENSE`.
