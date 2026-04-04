import type { Client } from '@libsql/client';
import type { EmbeddingProvider } from './provider.js';
import { searchSections, type SearchResult } from './search.js';
import { rerankSections } from './reranker.js';
import type { RerankerConfig } from '../config.js';

export type SearchPipelineInput = {
  db: Client;
  query: string;
  provider: EmbeddingProvider;
  key: string;
  limit: number;
  reranker?: RerankerConfig;
};

export type SearchPipelineDeps = {
  searchSections: typeof searchSections;
  rerankSections: typeof rerankSections;
};

const DEFAULT_DEPS: SearchPipelineDeps = {
  searchSections,
  rerankSections,
};

function isRerankerDebugEnabled(): boolean {
  return process.env.LAT_RERANKER_DEBUG === '1';
}

function debugReranker(message: string): void {
  if (!isRerankerDebugEnabled()) return;
  process.stderr.write(`[reranker] ${message}\n`);
}

/**
 * Runs vector search with optional reranking.
 *
 * Fallback behavior is strict:
 * - if reranker is not configured, return vector ranking
 * - if reranker fails, return vector ranking
 */
export async function runSearchPipeline(
  input: SearchPipelineInput,
  deps: SearchPipelineDeps = DEFAULT_DEPS,
): Promise<SearchResult[]> {
  const { db, query, provider, key, limit, reranker } = input;

  const initialK = reranker ? Math.max(limit, reranker.topK) : limit;
  const vectorResults = await deps.searchSections(
    db,
    query,
    provider,
    key,
    initialK,
  );

  debugReranker(
    `pipeline query=${JSON.stringify(query.slice(0, 80))} limit=${limit} initialK=${initialK} vectorResults=${vectorResults.length} enabled=${!!reranker}`,
  );

  if (!reranker) {
    debugReranker('pipeline skip rerank: not configured');
    return vectorResults;
  }

  if (vectorResults.length === 0) {
    debugReranker('pipeline skip rerank: no vector results');
    return vectorResults;
  }

  try {
    const reranked = await deps.rerankSections(query, vectorResults, reranker);
    debugReranker(
      `pipeline rerank applied: input=${vectorResults.length} output=${reranked.length}`,
    );
    return reranked;
  } catch (err) {
    debugReranker(
      `pipeline rerank failed, fallback to vector order: ${(err as Error).message}`,
    );
    return vectorResults;
  }
}
