import type { SearchResult } from './search.js';
import type { RerankerConfig } from '../config.js';

type RerankResponse = {
  results?: { index: number; relevance_score: number }[];
};

function isRerankerDebugEnabled(): boolean {
  return process.env.LAT_RERANKER_DEBUG === '1';
}

function debugReranker(message: string): void {
  if (!isRerankerDebugEnabled()) return;
  process.stderr.write(`[reranker] ${message}\n`);
}

/**
 * Rerank KNN candidates via an OpenAI-compatible rerank endpoint.
 *
 * Expected endpoint contract:
 * POST {apiBase}/v1/rerank
 * body: { model, query, documents, top_n }
 */
export async function rerankSections(
  query: string,
  candidates: SearchResult[],
  reranker: RerankerConfig,
): Promise<SearchResult[]> {
  if (candidates.length === 0) return candidates;

  const documents = candidates.map((c) => c.content);
  const url = `${reranker.apiBase.replace(/\/$/, '')}/v1/rerank`;
  const topN = Math.min(reranker.topK, candidates.length);

  debugReranker(
    `request POST ${url} model=${reranker.model} candidates=${candidates.length} top_n=${topN}`,
  );

  const startedAt = Date.now();
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: reranker.model,
      query,
      documents,
      top_n: topN,
    }),
  });
  const elapsedMs = Date.now() - startedAt;

  if (!resp.ok) {
    const body = await resp.text();
    debugReranker(
      `response status=${resp.status} ms=${elapsedMs} error=${JSON.stringify(body.slice(0, 200))}`,
    );
    throw new Error(
      `Reranker API error (${resp.status}): ${body.slice(0, 200)}`,
    );
  }

  const json = (await resp.json()) as RerankResponse;
  const ranked = json.results;

  if (!ranked || ranked.length === 0) {
    debugReranker(`response status=${resp.status} ms=${elapsedMs} results=0`);
    return candidates;
  }

  const topPreview = ranked
    .slice(0, 5)
    .map((r) => `#${r.index}:${r.relevance_score.toExponential(2)}`)
    .join(', ');
  debugReranker(
    `response status=${resp.status} ms=${elapsedMs} results=${ranked.length} top=[${topPreview}]`,
  );

  const byIndex = new Map(candidates.map((c, i) => [i, c]));
  const sorted = ranked
    .slice()
    .sort((a, b) => b.relevance_score - a.relevance_score)
    .map((r) => byIndex.get(r.index))
    .filter((x): x is SearchResult => !!x);

  if (sorted.length === 0) return candidates;

  const seen = new Set(sorted.map((s) => s.id));
  for (const c of candidates) {
    if (!seen.has(c.id)) sorted.push(c);
  }

  return sorted;
}
