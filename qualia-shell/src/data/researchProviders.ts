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
 *
 * BROWSER-ONLY SET (Ilya 2026-08-29: "providers will refuse browser-direct
 * calls — do not even include them"). Every entry below PASSED a live CORS
 * preflight (OPTIONS <base>/chat/completions, Origin: argyleholocron.netlify.app,
 * probed 2026-08-29) — access-control-allow-origin '*' or the exact origin.
 * EXCLUDED (revive behind the backend research proxy when it ships):
 *   nvidia-nim, sambanova, kilo-code, ollama-cloud, opencode-zen,
 *   github-models, glhf-chat — no ACAO header on preflight;
 *   cloudflare-workers-ai — {account_id} placeholder base URL;
 *   cline — empty base URL in the source README;
 *   grok-xai — duplicate of xai (same https://api.x.ai/v1).
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
    { id: 'modelscope', name: 'ModelScope', baseUrl: 'https://api-inference.modelscope.cn/v1', getKeyUrl: 'https://modelscope.cn/my/myaccesstoken', creditCard: 'Registration', freeModels: 59, maxContext: '1M', modalities: ['audio', 'image', 'reasoning', 'text', 'video', 'vision'], tier: 'permanent' },
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
    { id: 'llm7-io', name: 'LLM7.io', baseUrl: 'https://api.llm7.io/v1', getKeyUrl: 'https://token.llm7.io', creditCard: 'No', freeModels: 16, maxContext: '1M', modalities: ['audio', 'code', 'image', 'pdf', 'reasoning', 'text', 'video', 'vision'], tier: 'permanent' },
    { id: 'ovhcloud', name: 'OVHcloud AI Endpoints', baseUrl: 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1', getKeyUrl: 'https://www.ovhcloud.com/en/public-cloud/ai-endpoints/catalog/', creditCard: 'Registration', freeModels: 14, maxContext: '262K', modalities: ['audio', 'code', 'image', 'reasoning', 'text', 'video'], tier: 'permanent' },
    { id: 'groq', name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', getKeyUrl: 'https://console.groq.com/keys', creditCard: 'No', freeModels: 12, maxContext: '262K', modalities: ['image', 'reasoning', 'text'], tier: 'permanent' },
    { id: 'mistral', name: 'Mistral AI', baseUrl: 'https://api.mistral.ai/v1', getKeyUrl: 'https://console.mistral.ai/api-keys', creditCard: 'No', freeModels: 12, maxContext: '256K', modalities: ['code', 'image', 'text'], tier: 'permanent' },
    { id: 'cohere', name: 'Cohere', baseUrl: 'https://api.cohere.com/v2', getKeyUrl: 'https://dashboard.cohere.com/api-keys', creditCard: 'No', freeModels: 12, maxContext: '436K', modalities: ['image', 'text'], tier: 'permanent' },
    { id: 'aion-labs', name: 'Aion Labs', baseUrl: 'https://api.aionlabs.ai/v1', getKeyUrl: 'https://www.aionlabs.ai', creditCard: 'Registration', freeModels: 7, maxContext: '131K', modalities: ['text'], tier: 'permanent' },
    { id: 'hugging-face', name: 'Hugging Face', baseUrl: 'https://router.huggingface.co/v1', getKeyUrl: 'https://huggingface.co/settings/tokens', creditCard: 'No', freeModels: 7, maxContext: '131K', modalities: ['code', 'text'], tier: 'permanent' },
    { id: 'cerebras', name: 'Cerebras', baseUrl: 'https://api.cerebras.ai/v1', getKeyUrl: 'https://cloud.cerebras.ai/', creditCard: 'No', freeModels: 6, maxContext: '131K', modalities: ['reasoning', 'text'], tier: 'permanent' },
    { id: 'agnes-ai', name: 'Agnes AI', baseUrl: 'https://apihub.agnes-ai.com/v1', getKeyUrl: 'https://platform.agnes-ai.com/settings/apiKeys', creditCard: 'Registration', freeModels: 5, maxContext: '256K', modalities: ['image', 'text', 'video', 'vision'], tier: 'permanent' },
    { id: 'alibaba-model-studio', name: 'Alibaba Cloud Model Studio', baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', getKeyUrl: 'https://bailian.console.alibabacloud.com/?apiKey=1', creditCard: 'Registration', freeModels: 5, maxContext: '1M', modalities: ['code', 'image', 'text'], tier: 'permanent' },
    { id: 'z-ai', name: 'Z AI (Zhipu AI)', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', getKeyUrl: 'https://open.bigmodel.cn/usercenter/apikeys', creditCard: 'No', freeModels: 4, maxContext: '200K', modalities: ['image', 'reasoning', 'text', 'video'], tier: 'permanent' },
    { id: 'siliconflow', name: 'SiliconFlow', baseUrl: 'https://api.siliconflow.cn/v1', getKeyUrl: 'https://cloud.siliconflow.cn/account/ak', creditCard: 'Registration', freeModels: 3, maxContext: '131K', modalities: ['text'], tier: 'permanent' },
    { id: 'xai', name: 'xAI', baseUrl: 'https://api.x.ai/v1', getKeyUrl: 'https://console.x.ai', creditCard: 'Registration', freeModels: 3, maxContext: '2M', modalities: ['text'], tier: 'permanent' },
    { id: 'chutes-ai', name: 'Chutes.ai', baseUrl: 'https://api.chutes.ai/v1', getKeyUrl: 'https://chutes.ai/', creditCard: 'Registration', freeModels: 2, maxContext: '131K', modalities: ['reasoning', 'text'], tier: 'permanent' },
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
