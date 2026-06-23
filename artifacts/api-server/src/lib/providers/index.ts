import { ProviderId, PROVIDER_CONFIG } from './config.js';
import { RunOptions } from './shared.js';
import { runOpenAI } from './openai.js';
import { runAnthropic } from './anthropic.js';

export { PROVIDER_CONFIG, DEFAULT_PROVIDER, isProviderId } from './config.js';
export type { ProviderId } from './config.js';

export const PROVIDER_ENV_KEY: Record<ProviderId, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
};

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
