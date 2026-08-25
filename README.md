# EasyGrade

EasyGrade is a desktop application that lets teachers create short multiple-choice tests, print them as single-page scannable sheets, and grade a stack of scanned sheets in one pass.

It runs on macOS, Windows, and Linux. All data stays on the teacher's computer.

## Install

Download the latest release from the [Releases page](https://github.com/jasonash/EasyGrade/releases/latest):

| Platform | File |
|---|---|
| macOS (Apple Silicon) | `EasyGrade-<version>-arm64.dmg` |
| macOS (Intel) | `EasyGrade-<version>-x64.dmg` |
| Windows | `EasyGrade-Setup-<version>.exe` (installer) or `EasyGrade-Portable-<version>.exe` |
| Linux | `EasyGrade-<version>-x86_64.AppImage` or `EasyGrade-<version>-amd64.deb` |

The macOS builds are signed and notarized. Windows builds are not code-signed, so SmartScreen may ask you to confirm the first launch. Once installed, EasyGrade checks for new releases on its own and offers to download them; nothing is installed without your say-so.

## What it does

- **Tests**: up to 10 questions with 2 to 5 choices each, edited with a live preview and a fit meter, so a test can never spill onto a second page.
- **Answer sheets**: one PDF per class with a personalized sheet per student (name and QR code printed) plus blank extras, ready for any printer.
- **Grading**: import PDFs from a document scanner or photos from a phone. Sheets are found by their QR code, straightened, and read; every page lands in a bucket (graded, needs assignment, unreadable, not a sheet) and can be reviewed with the scan image beside the detected answers.
- **Results**: per-test and per-student views, per-question statistics, make-up sheets for missing students, and CSV export for a test or a whole class.
- **Questions with AI, without AI in the app**: copy a ready-made prompt into whatever assistant your school uses, paste its reply back, and the questions are imported. EasyGrade never contacts an AI service.
- **Backups**: timestamped snapshots to a folder of your choice (a cloud-synced folder works well), automatic on quit and daily, with one-click restore.

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
