export type ProviderId = 'openai' | 'anthropic';

export interface ProviderInfo {
  label: string;
  defaultModel: string;
  models: string[];
}

export const PROVIDER_CONFIG: Record<ProviderId, ProviderInfo> = {
  openai: {
    label: 'OpenAI',
    defaultModel: 'gpt-5.4-mini',
    models: ['gpt-5.4-mini', 'gpt-5.4', 'gpt-5.5', 'gpt-5.4-nano', 'gpt-5-mini'],
  },
  anthropic: {
    label: 'Anthropic',
    defaultModel: 'claude-sonnet-4-6',
    models: ['claude-sonnet-4-6', 'claude-opus-4-8', 'claude-haiku-4-5'],
  },
};

export const DEFAULT_PROVIDER: ProviderId = 'openai';

export function isProviderId(value: unknown): value is ProviderId {
  return value === 'openai' || value === 'anthropic';
}
