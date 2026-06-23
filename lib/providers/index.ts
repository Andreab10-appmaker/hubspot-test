import { ProviderId, PROVIDER_CONFIG } from './config';
import { RunOptions } from './shared';
import { runOpenAI } from './openai';
import { runAnthropic } from './anthropic';

export { PROVIDER_CONFIG, DEFAULT_PROVIDER, isProviderId } from './config';
export type { ProviderId } from './config';

// Nome della variabile d'ambiente con la API key di ciascun provider.
export const PROVIDER_ENV_KEY: Record<ProviderId, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
};

// Modello da usare: scelta esplicita dell'utente > override via env > default app.
export function resolveModel(provider: ProviderId, requested?: string): string {
  if (requested && requested.trim()) return requested.trim();
  const envOverride =
    provider === 'openai' ? process.env.OPENAI_MODEL : process.env.ANTHROPIC_MODEL;
  if (envOverride && envOverride.trim()) return envOverride.trim();
  return PROVIDER_CONFIG[provider].defaultModel;
}

export async function runAgent(
  provider: ProviderId,
  opts: RunOptions
): Promise<void> {
  if (provider === 'anthropic') return runAnthropic(opts);
  return runOpenAI(opts);
}
