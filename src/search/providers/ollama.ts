import type { EmbeddingProvider } from '../provider.js';

const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434';
const DEFAULT_OLLAMA_MODEL = 'qwen3-embedding:8b';

function ollamaProvider(model: string, baseUrl?: string): EmbeddingProvider {
  return {
    name: 'ollama',
    apiBase: `${baseUrl || DEFAULT_OLLAMA_BASE_URL}/v1`,
    model,
    dimensions: 4096,
    headers: () => ({ 'Content-Type': 'application/json' }),
  };
}

/**
 * Detect and parse LAT_LLM_KEY in ollama format.
 *
 * Supported formats:
 * - ollama:model
 * - ollama:model@http://host:port
 */
export function detectOllamaProvider(key: string): EmbeddingProvider | null {
  if (!key.startsWith('ollama:')) return null;

  const rest = key.slice('ollama:'.length);
  const atIdx = rest.indexOf('@');
  if (atIdx !== -1) {
    return ollamaProvider(rest.slice(0, atIdx), rest.slice(atIdx + 1));
  }
  return ollamaProvider(rest || DEFAULT_OLLAMA_MODEL);
}
