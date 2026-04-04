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

  if (!reranker || vectorResults.length === 0) {
    return vectorResults;
  }

  try {
    return await deps.rerankSections(query, vectorResults, reranker);
  } catch {
    return vectorResults;
  }
}
