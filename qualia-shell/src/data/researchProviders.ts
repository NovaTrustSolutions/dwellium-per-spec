/**
 * researchProviders — the 31 free LLM API providers for the Research Lab.
 *
 * GENERATED-BUT-COMMITTED data file. Source of truth:
 *   https://github.com/NovaTrustSolutions/awesome-freellm-apis (README.md)
 *   README "Last updated": 2026-08-28
 * Parsed from the PERMANENT_FREE + RENEWABLE provider tables and the
 * "Quick Reference — Base URLs & API Keys" table. Base URLs are verbatim from
 * the README except where noted inline (Google Gemini). Do not hand-tune rate
 * limits here — the README refreshes daily; regenerate against it instead.
 *
 * These providers are for the RESEARCH SANDBOX ONLY. They must never receive
 * financial or resident/tenant data — enforced by researchLabImportGuard.test.ts
 * (structural isolation) and researchLlm/guard.ts (outbound scan).
 */

export interface ResearchProvider {
    /** Stable slug id. */
    id: string;
    /** Display name as it appears in the README. */
    name: string;
    /** OpenAI-compatible base URL (chat-completions appended by the client). */
    baseUrl: string;
    /** Where to create a free API key. */
    getKeyUrl: string;
    /** README "Credit Card?" column, verbatim (e.g. "No", "Registration"). */
    creditCard: string;
    /** Free-model count from the directory table. */
    freeModels: number;
    /** Max context, verbatim (e.g. "1M", "131K"). */
    maxContext: string;
    /** Modalities, verbatim list. */
    modalities: string[];
    /** 'permanent' free tier vs 'renewable' credits. */
    tier: 'permanent' | 'renewable';
    /** Cloudflare: base URL contains an `{account_id}` placeholder the user must fill. */
    needsAccountId?: boolean;
    /** Not usable browser-direct at all (e.g. Cline ships no public base URL). */
    unusable?: boolean;
    /** Why it is unusable / any substitution note. */
    note?: string;
}

export const RESEARCH_PROVIDERS_SOURCE = 'https://github.com/NovaTrustSolutions/awesome-freellm-apis';
export const RESEARCH_PROVIDERS_UPDATED = '2026-08-28';

export const RESEARCH_PROVIDERS: readonly ResearchProvider[] = [
    { id: 'nvidia-nim', name: 'NVIDIA NIM', baseUrl: 'https://integrate.api.nvidia.com/v1', getKeyUrl: 'https://build.nvidia.com/settings/api-keys', creditCard: 'Phone verification', freeModels: 126, maxContext: '1M', modalities: ['audio', 'embedding', 'image', 'reasoning', 'rerank', 'text', 'video', 'vision'], tier: 'permanent' },
    { id: 'modelscope', name: 'ModelScope', baseUrl: 'https://api-inference.modelscope.cn/v1', getKeyUrl: 'https://modelscope.cn/my/myaccesstoken', creditCard: 'Registration', freeModels: 59, maxContext: '1M', modalities: ['audio', 'image', 'reasoning', 'text', 'video', 'vision'], tier: 'permanent' },
    {
        id: 'cloudflare-workers-ai', name: 'Cloudflare Workers AI',
        baseUrl: 'https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run',
        getKeyUrl: 'https://dash.cloudflare.com/profile/api-tokens', creditCard: 'No', freeModels: 40, maxContext: '10M',
        modalities: ['code', 'image', 'reasoning', 'text', 'video'], tier: 'permanent',
        needsAccountId: true, note: 'Base URL contains an {account_id} placeholder — set your Cloudflare account id before use.',
    },
    {
        id: 'google-gemini', name: 'Google Gemini',
        // README lists the native v1beta base (https://generativelanguage.googleapis.com/v1beta);
        // substituted with Google's documented OpenAI-compatibility endpoint so the
        // shared chat-completions client works unchanged.
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
        getKeyUrl: 'https://aistudio.google.com/app/apikey', creditCard: 'No', freeModels: 17, maxContext: '1M',
        modalities: ['audio', 'image', 'pdf', 'reasoning', 'text', 'video', 'vision'], tier: 'permanent',
        note: 'README base is the native v1beta API; this entry uses the OpenAI-compat endpoint instead.',
    },
    { id: 'github-models', name: 'GitHub Models', baseUrl: 'https://models.github.ai/inference', getKeyUrl: 'https://github.com/marketplace/models', creditCard: 'No', freeModels: 16, maxContext: '1M', modalities: ['image', 'pdf', 'reasoning', 'text'], tier: 'permanent' },
    { id: 'llm7-io', name: 'LLM7.io', baseUrl: 'https://api.llm7.io/v1', getKeyUrl: 'https://token.llm7.io', creditCard: 'No', freeModels: 16, maxContext: '1M', modalities: ['audio', 'code', 'image', 'pdf', 'reasoning', 'text', 'video', 'vision'], tier: 'permanent' },
    { id: 'ovhcloud', name: 'OVHcloud AI Endpoints', baseUrl: 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1', getKeyUrl: 'https://www.ovhcloud.com/en/public-cloud/ai-endpoints/catalog/', creditCard: 'Registration', freeModels: 14, maxContext: '262K', modalities: ['audio', 'code', 'image', 'reasoning', 'text', 'video'], tier: 'permanent' },
    { id: 'ollama-cloud', name: 'Ollama Cloud', baseUrl: 'https://api.ollama.com', getKeyUrl: 'https://ollama.com/settings/keys', creditCard: 'Registration', freeModels: 13, maxContext: '1M', modalities: ['code', 'image', 'reasoning', 'text', 'video', 'vision'], tier: 'permanent' },
    { id: 'groq', name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', getKeyUrl: 'https://console.groq.com/keys', creditCard: 'No', freeModels: 12, maxContext: '262K', modalities: ['image', 'reasoning', 'text'], tier: 'permanent' },
    { id: 'mistral', name: 'Mistral AI', baseUrl: 'https://api.mistral.ai/v1', getKeyUrl: 'https://console.mistral.ai/api-keys', creditCard: 'No', freeModels: 12, maxContext: '256K', modalities: ['code', 'image', 'text'], tier: 'permanent' },
    { id: 'cohere', name: 'Cohere', baseUrl: 'https://api.cohere.com/v2', getKeyUrl: 'https://dashboard.cohere.com/api-keys', creditCard: 'No', freeModels: 12, maxContext: '436K', modalities: ['image', 'text'], tier: 'permanent' },
    { id: 'kilo-code', name: 'Kilo Code', baseUrl: 'https://api.kilo.ai/api/gateway', getKeyUrl: 'https://kilo.ai', creditCard: 'No', freeModels: 12, maxContext: '1M', modalities: ['audio', 'code', 'image', 'reasoning', 'text', 'video'], tier: 'permanent' },
    { id: 'opencode-zen', name: 'OpenCode Zen', baseUrl: 'https://opencode.ai/zen/v1', getKeyUrl: 'https://opencode.ai/auth', creditCard: 'Registration', freeModels: 12, maxContext: '1M', modalities: ['audio', 'reasoning', 'vision'], tier: 'permanent' },
    { id: 'aion-labs', name: 'Aion Labs', baseUrl: 'https://api.aionlabs.ai/v1', getKeyUrl: 'https://www.aionlabs.ai', creditCard: 'Registration', freeModels: 7, maxContext: '131K', modalities: ['text'], tier: 'permanent' },
    { id: 'hugging-face', name: 'Hugging Face', baseUrl: 'https://router.huggingface.co/v1', getKeyUrl: 'https://huggingface.co/settings/tokens', creditCard: 'No', freeModels: 7, maxContext: '131K', modalities: ['code', 'text'], tier: 'permanent' },
    { id: 'cerebras', name: 'Cerebras', baseUrl: 'https://api.cerebras.ai/v1', getKeyUrl: 'https://cloud.cerebras.ai/', creditCard: 'No', freeModels: 6, maxContext: '131K', modalities: ['reasoning', 'text'], tier: 'permanent' },
    { id: 'agnes-ai', name: 'Agnes AI', baseUrl: 'https://apihub.agnes-ai.com/v1', getKeyUrl: 'https://platform.agnes-ai.com/settings/apiKeys', creditCard: 'Registration', freeModels: 5, maxContext: '256K', modalities: ['image', 'text', 'video', 'vision'], tier: 'permanent' },
    { id: 'alibaba-model-studio', name: 'Alibaba Cloud Model Studio', baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', getKeyUrl: 'https://bailian.console.alibabacloud.com/?apiKey=1', creditCard: 'Registration', freeModels: 5, maxContext: '1M', modalities: ['code', 'image', 'text'], tier: 'permanent' },
    { id: 'z-ai', name: 'Z AI (Zhipu AI)', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', getKeyUrl: 'https://open.bigmodel.cn/usercenter/apikeys', creditCard: 'No', freeModels: 4, maxContext: '200K', modalities: ['image', 'reasoning', 'text', 'video'], tier: 'permanent' },
    { id: 'sambanova', name: 'SambaNova', baseUrl: 'https://api.sambanova.ai/v1', getKeyUrl: 'https://cloud.sambanova.ai/apis', creditCard: 'Registration', freeModels: 4, maxContext: '128K', modalities: ['image', 'reasoning', 'text'], tier: 'permanent' },
    { id: 'siliconflow', name: 'SiliconFlow', baseUrl: 'https://api.siliconflow.cn/v1', getKeyUrl: 'https://cloud.siliconflow.cn/account/ak', creditCard: 'Registration', freeModels: 3, maxContext: '131K', modalities: ['text'], tier: 'permanent' },
    { id: 'xai', name: 'xAI', baseUrl: 'https://api.x.ai/v1', getKeyUrl: 'https://console.x.ai', creditCard: 'Registration', freeModels: 3, maxContext: '2M', modalities: ['text'], tier: 'permanent' },
    {
        id: 'cline', name: 'Cline', baseUrl: '', getKeyUrl: '', creditCard: 'Registration', freeModels: 3, maxContext: '0',
        modalities: ['text'], tier: 'permanent',
        unusable: true, note: 'README publishes no base URL or key page — Cline routes only through its own VS Code extension, so there is nothing to call browser-direct.',
    },
    { id: 'chutes-ai', name: 'Chutes.ai', baseUrl: 'https://api.chutes.ai/v1', getKeyUrl: 'https://chutes.ai/', creditCard: 'Registration', freeModels: 2, maxContext: '131K', modalities: ['reasoning', 'text'], tier: 'permanent' },
    { id: 'glhf-chat', name: 'Glhf.chat', baseUrl: 'https://glhf.chat/api/openai/v1', getKeyUrl: 'https://glhf.chat/', creditCard: 'Registration', freeModels: 2, maxContext: '131K', modalities: ['text'], tier: 'permanent' },
    { id: 'grok-xai', name: 'Grok (xAI)', baseUrl: 'https://api.x.ai/v1', getKeyUrl: 'https://console.x.ai/', creditCard: 'Registration', freeModels: 2, maxContext: '131K', modalities: ['text'], tier: 'permanent', note: '$25/month free credits track — same endpoint as the xAI row, separate program.' },
    { id: 'ai21-labs', name: 'AI21 Labs', baseUrl: 'https://api.ai21.com/studio/v1', getKeyUrl: 'https://studio.ai21.com/account/api-key', creditCard: 'Registration', freeModels: 2, maxContext: '256K', modalities: ['text'], tier: 'permanent' },
    { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', getKeyUrl: 'https://platform.deepseek.com/api_keys', creditCard: 'Registration', freeModels: 2, maxContext: '128K', modalities: ['text'], tier: 'permanent' },
    { id: 'nscale', name: 'Nscale', baseUrl: 'https://inference.api.nscale.com/v1', getKeyUrl: 'https://console.nscale.com/', creditCard: 'Registration', freeModels: 2, maxContext: '128K', modalities: ['text'], tier: 'permanent' },
    { id: 'nebius', name: 'Nebius', baseUrl: 'https://api.studio.nebius.com/v1', getKeyUrl: 'https://studio.nebius.com/settings/api-keys', creditCard: 'Registration', freeModels: 1, maxContext: '128K', modalities: ['text'], tier: 'permanent' },
    { id: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', getKeyUrl: 'https://openrouter.ai/workspaces/default/keys', creditCard: 'Registration', freeModels: 29, maxContext: '1M', modalities: ['audio', 'code', 'embeddings', 'image', 'reasoning', 'rerank', 'speech', 'text', 'video'], tier: 'renewable', note: 'Renewable credits: free tier + one-time $10 top-up unlocks 1K requests/day.' },
] as const;

/** Lookup by id; returns undefined for unknown ids. */
export function getResearchProvider(id: string): ResearchProvider | undefined {
    return RESEARCH_PROVIDERS.find(p => p.id === id);
}
