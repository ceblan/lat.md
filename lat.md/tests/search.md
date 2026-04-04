---
lat:
  require-code-mention: true
---
# Search

Tests in `tests/search.test.ts`.

## Provider Detection

Unit tests (always run). Verify `detectProvider` correctly identifies OpenAI (`sk-`), Vercel (`vck_`), Ollama (`ollama:model` and `ollama:model@url`), rejects Anthropic (`sk-ant-`) with a helpful message, and rejects unknown prefixes.

## Reranker Fallback

Unit tests verify the search pipeline keeps vector-search results as a safe fallback whenever reranking is unavailable.

### Uses vector ranking when reranker is not configured

When no reranker model is configured, the pipeline returns vector-search ordering and does not call rerank logic.

### Falls back to vector ranking when reranker fails

If reranker invocation throws (for example timeout or HTTP error), the pipeline returns vector-search ordering without failing the command.

## Reranker Config

Unit tests verify reranker configuration parsing is isolated and keeps fallback semantics predictable.

### Parses reranker config from env and file values

Env values take precedence over config-file values, and top_k is normalized to a positive integer.

### Treats missing model as disabled reranker

Without a model, reranker config resolves to undefined so search runs embeddings-only mode.

## RAG Replay Tests

Functional tests that exercise the full RAG pipeline using a replay server instead of a real embedding API.

The test covers indexing, hashing, vector insert, and KNN search via `tests/rag-replay-server.ts`. Test fixture lives in `tests/cases/rag/lat.md/` with pre-recorded vectors in `tests/cases/rag/replay-data/`.

The replay server has two modes:
- **Replay** (default `pnpm test`): serves cached vectors from binary replay data. Matches requests by SHA-256 of input text.
- **Capture** (`pnpm cook-test-rag`): proxies to real API via `LAT_LLM_KEY`, records all text→vector mappings, flushes binary data to `replay-data/` on teardown. Re-run this after changing how sections are chunked or which texts are embedded.

The test sets `LAT_LLM_KEY` to `REPLAY_LAT_LLM_KEY::<server-url>`, which `detectProvider` routes to the local replay server. This way the entire codebase runs unmodified — same `fetch()` calls, same provider logic.

### Indexes all sections

Index the RAG fixture (9 sections across 2 files), verify counts.

### Finds auth section for login query

Search for "how do we handle user login and security?" and verify the Authentication section ranks first.

### Finds performance section for latency query

Search for "what tools do we use to measure response times?" and verify the Performance Tests section ranks first.

### Incremental index skips unchanged sections

Re-index unchanged content, verify all sections reported as unchanged with zero re-embedding.

### Detects deleted sections when file is removed

Remove `testing.md`, re-index, verify 4 sections removed and 5 architecture sections remain.
