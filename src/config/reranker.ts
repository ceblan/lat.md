import type { LatConfig, RerankerConfig } from '../config.js';

type RerankerEnv = Record<string, string | undefined>;

function parsePositiveInt(name: string, raw: number | string): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(
      `Invalid reranker ${name} value: ${raw}. Expected a positive number.`,
    );
  }
  return Math.floor(value);
}

export function resolveRerankerConfig(
  config: LatConfig,
  env: RerankerEnv = process.env,
): RerankerConfig | undefined {
  const model = env.LAT_RERANKER_MODEL || config.reranker_model;
  if (!model) return undefined;

  const apiBase =
    env.LAT_RERANKER_API_BASE ||
    config.reranker_api_base ||
    'http://localhost:8082';

  const rawTopK = env.LAT_RERANKER_TOP_K ?? config.reranker_top_k;
  const topK = rawTopK === undefined ? 20 : parsePositiveInt('top_k', rawTopK);

  return { model, apiBase, topK };
}
