# Agenteryx

Agenteryx is a local-first, AI-native document workspace. The app combines a Markdown editor, project/thread organization, local filesystem storage, PostgreSQL-backed search/indexing, Honcho memory, and optional cloud model providers for synthesis and ingestion workflows.

The Electron app lives in [`editor/`](editor/).

## What It Does

- **Scribe:** document editing with Markdown, comments, redlines, versioning, preview tabs, and thread-aware file navigation.
- **Codex:** local knowledge-base search, ingestion tracking, wiki pages, graph exploration, and synthesis views.
- **Foundry:** intake/review queue for web captures, pasted text, and uploaded documents before they enter the knowledge base.
- **Hive:** operational dashboard for memory, ingestion, validation, synthesis, and relay services.
- **Hermes:** optional Telegram and iCloud Drive relay for mobile capture and remote thread interaction.

Agenteryx is designed around a simple invariant: the filesystem is the source of truth, and the database is a rebuildable index.

## Requirements

- macOS for the packaged desktop target
- Node.js `>=22.12`
- npm `>=10`
- Docker Desktop for local Postgres/test infrastructure
- Optional local services:
  - LM Studio at `http://127.0.0.1:1234/v1`
  - Honcho at `http://localhost:8000`
  - Redis/Postgres stack for Honcho

## Quickstart

```bash
git clone https://github.com/NovaTrustSolutions/Agenteryx.git
cd Agenteryx/editor
npm ci
cp .env.example .env
npm run db:setup
npm run dev
```

If you only want to run the checks, the test command starts an isolated Postgres container on port `5433`:

```bash
cd editor
npm ci
npm test
npm run typecheck
npm run build
```

## Configuration

Runtime settings are saved in Electron's user-data folder. Sensitive fields such as API keys and Telegram tokens are encrypted before they are written to disk when Electron's `safeStorage` facility is available.

Useful environment variables:

| Variable | Purpose |
| --- | --- |
| `HOLOCRON_DB_URI` | Main Agenteryx RAG/index database |
| `HOLOCRON_TEST_DB_URI` | Test database override |
| `HOLOCRON_TEST_DB_PORT` | Port for the test Postgres container, default `5433` |
| `DB_CONNECTION_URI` | Optional Honcho database URI for setup checks |

## Verification

The repository has four primary gates:

```bash
npm ci
npm audit --audit-level=moderate
npm run typecheck
npm test
npm run build
```

The GitHub Actions workflow runs the same core checks on pull requests and pushes.

## Project Map

- [`docs/STATUS.md`](docs/STATUS.md): current implementation state and handoff notes.
- [`docs/architecture-v4.md`](docs/architecture-v4.md): forward architecture and sequencing.
- [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md): filesystem hierarchy and metadata schemas.
- [`editor/src/main/`](editor/src/main/): Electron main process, filesystem, RAG, memory, and service integrations.
- [`editor/src/preload/`](editor/src/preload/): renderer IPC bridge.
- [`editor/src/renderer/`](editor/src/renderer/): React application.
- [`editor/tests/`](editor/tests/): Vitest main-process and filesystem/DB tests.

## Security Notes

Agenteryx is local-first, but it still handles sensitive data. Keep `.env`, local workspaces, and Electron user data out of source control. The renderer talks to the main process through a narrow IPC bridge; file writes are scoped to configured workspace/cache roots.
