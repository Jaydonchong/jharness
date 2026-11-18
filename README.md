# jharness: A Modular, Mostly Hand-Rolled Agent Harness

`jharness` is a TypeScript agent harness built around explicit modules for conversations, model turns, tools, compaction, memory, and evaluation.
The harness owns the control flow between these modules, while a provider adapter connects it to a language model SDK.

## Architecture

The root README covers setup and operations.
The module READMEs explain how the code is divided and how each piece works.

| Module | Documentation |
| --- | --- |
| Agent conversation and turn loop | [src/agent/README.md](src/agent/README.md) |
| Compaction pipeline | [src/compaction/README.md](src/compaction/README.md) |
| Offline and online evaluation | [src/evaluation/README.md](src/evaluation/README.md) |
| Harness, sessions, state, and logging | [src/harness/README.md](src/harness/README.md) |
| Local memory and RAG | [src/memory/README.md](src/memory/README.md) |
| Provider contract and SDK adapter | [src/providers/README.md](src/providers/README.md) |
| OpenTelemetry instrumentation and custom metrics | [src/telemetry/README.md](src/telemetry/README.md) |
| Agent tools and tool loops | [src/tools/README.md](src/tools/README.md) |

## Requirements

- Node.js 22
- PostgreSQL with the pgvector extension
- Model provider credentials accepted by the installed AI SDK
- Google Calendar service account credentials for the bundled runtime and evaluation setup
- Discord bot credentials for the bundled Discord runtime
- Ollama and Cloudflare Workers AI credentials for RAG embedding and reranking
- Docker Compose for the container setup

## Setup

Install dependencies and create a local environment file:

```sh
npm ci
cp .env.example .env
```

Set the values in `.env` for your machine and services.
`MEMORY_FOLDER_FS_PATH`, `SESSION_LOG_FS_PATH`, and `GOOGLE_GCAL_CREDENTIALS_PATH` must be absolute paths.

Create the configured memory and session directories, and place the Google service account file at the configured credentials path.
Do not commit `.env` or credential files.

Start PostgreSQL with pgvector enabled, then apply migrations:

```sh
npm run migration:run
```

Build and run the application:

```sh
npm run build
npm start
```

`npm start` builds the TypeScript project before starting `dist/index.js`.

## Configuration

Use [.env.example](.env.example) as the starting point.
The source also reads variables that are not currently listed in that template.

| Variables | Purpose |
| --- | --- |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_HOST`, `POSTGRES_PORT` | PostgreSQL connection used by TypeORM and the evaluation queue. |
| `MEMORY_FOLDER_FS_PATH`, `SESSION_LOG_FS_PATH` | Absolute paths for local memory and per-session logs. |
| `GOOGLE_GCAL_CREDENTIALS_PATH`, `GOOGLE_GCAL_DEFAULT_CALENDAR_ID` | Google service account file and calendar selected by the calendar tool. The calendar ID is read by the source but is absent from `.env.example`. |
| `DISCORD_BOT_TOKEN`, `DISCORD_ACCOUNT_ID`, `DISCORD_PRODUCTIVITY_CHANNEL_NAME`, `DISCORD_SYSTEM_DESIGN_CHANNEL_NAME` | Discord connection, allowed user, and channel routing. |
| `WYD_API_BASE_URL`, `WYD_API_TOKEN`, `WYD_ALLOWED_FOLDER_IDS` | Optional Wyd task integration. Configure all three together; the API base URL must be an `http` or `https` origin without a path. Replace the template value with a fully qualified origin. |
| `OPENSERP_API_KEY`, `OPENSERP_BASE_URL` | OpenSERP search integration. |
| `OLLAMA_BASE_URL` | Ollama embedding service endpoint. |
| `CLOUDFLARE_AI_WORKER_ACCOUNT_ID`, `CLOUDFLARE_AI_WORKER_API_TOKEN` | Cloudflare Workers AI reranker credentials. These are read by the source but absent from `.env.example`. |
| `OTEL_SERVICE_NAME`, `SERVICE_NAMESPACE`, `ENVIRONMENT_NAME`, `APP_VERSION` | OpenTelemetry service identity. |
| `TEMPO_QUERY_URL` | Tempo endpoint used by the online evaluation worker. |

The model provider adapter uses model identifiers from the AI SDK.
Configure the provider credentials expected by that SDK for your environment.

## Docker Compose

Compose defines the application, online evaluation worker, and PostgreSQL services.
The app and worker depend on a healthy PostgreSQL service.

The full composition references external Docker networks named `telemetry` and `observability_backend`.
Create those networks through your observability stack before starting the full composition.
Compose does not create external networks.

The application mounts the configured memory directory, session log directory, and Google credentials file.
It overrides the PostgreSQL host to `postgres` and sends OTLP data to `otel-collector`.

After configuring `.env` and the external networks, start the services:

```sh
docker compose up -d --build
```

Compose does not apply TypeORM migrations automatically.
Apply migrations before relying on database-backed features.

## Telemetry

The runtime initializes the OpenTelemetry Node SDK with automatic Node.js instrumentation and OTLP exporters for traces, metrics, and logs.
Metrics are exported every second.
The Compose app and evaluation worker send OTLP data to `otel-collector` using HTTP protobuf.

The code records custom metrics across agent sessions, model usage, tools, compaction, evaluation, memory context, and RAG.
Examples include:

| Area | Custom metrics | What they measure |
| --- | --- | --- |
| Agent sessions | `agent-session.sessions.count`, `agent-session.turns.count`, `agent-session.turn.duration` | Created sessions, turn attempts, and turn duration. |
| Model usage | `llm.tokens.input`, `llm.tokens.output` | Input and output token counts, with provider counts or baseline estimates. |
| Tools | `tool.call.count`, `tool.call.duration` | Logical tool calls and duration, including configured retries. |
| Compaction | `compaction.tokens.before`, `compaction.tokens.after`, `compaction.tokens.saved`, `compaction.token.reduction.ratio` | Context size and reduction from compaction. |
| Evaluation | `evaluation.trials.count`, `evaluation.score` | Completed trials and grader scores, tagged by evaluation mode and name. |
| Memory and RAG | `context.operation.count`, `context.operation.duration`, `rag.operation.count`, `rag.operation.duration` | Context and RAG operation counts and durations, tagged by operation and outcome. |

See [src/telemetry/README.md](src/telemetry/README.md) for metric details and their source modules.

## Evaluation

Run the registered offline suites:

```sh
npm run evaluation:run
```

Run the asynchronous online evaluation worker:

```sh
npm run evaluation:worker
```

Offline evaluations run defined tasks and graders directly.
Online evaluations read completed traces from Tempo and save graded trials to PostgreSQL.
See [src/evaluation/README.md](src/evaluation/README.md) for the data flow.

## RAG indexing

Index Markdown files under an absolute directory:

```sh
npm run rag:index -- /absolute/path/to/markdown-files
```

The indexer stores document chunks in PostgreSQL, embeds them through Ollama, and uses the configured reranker during retrieval.
See [src/memory/README.md](src/memory/README.md) for the retrieval path.

## Development

```sh
npm run build
```

The `test` script in `package.json` is a placeholder and exits with an error.
Automated tests are not configured through that script.

## Source layout

- `src/agent` — agent configuration, conversation state, and provider/tool turn loop
- `src/compaction` — ordered compaction pipeline and pipeline nodes
- `src/evaluation` — suites, graders, persistence, and online processing
- `src/harness` — session composition, state, lifecycle, and logging
- `src/memory` — local memory stores, context assembly, and PostgreSQL RAG
- `src/providers` — language model provider contract and SDK adapter
- `src/tools` — tool contracts, invocation, and implementations
- `src/telemetry` — OpenTelemetry setup and instrumentation
- `src/scripts` — indexing and evaluation entry points
