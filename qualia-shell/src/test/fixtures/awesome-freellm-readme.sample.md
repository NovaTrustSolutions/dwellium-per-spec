# awesome-free-llm-apis (fixture)

A small hand-written slice of the upstream README's table format, for
`regen-research-providers.mjs` parser tests. Three providers: two mirror
`src/data/researchProviders.ts` (one unchanged, one with a deliberately
different base URL), one is new.

## Provider Directory

### Permanent Free Tiers

<!-- BEGIN_PERMANENT_FREE -->
| Provider | Free Models | Credit Card? | Max Context | Modalities | Get API Key |
|---|---|---|---|---|---|
| Groq | 12 | No | 262K | image, reasoning, text | <a href="https://console.groq.com/keys" target="_blank" rel="noopener">→</a> |
| Mistral AI | 12 | No | 256K | code, image, text | <a href="https://console.mistral.ai/api-keys" target="_blank" rel="noopener">→</a> |
| Fixture New Provider | 5 | No | 128K | text | <a href="https://example.com/keys" target="_blank" rel="noopener">→</a> |
<!-- END_PERMANENT_FREE -->

### Renewable Credits

<!-- BEGIN_RENEWABLE -->
| Provider | Free Models | Credit Model | Max Context | Modalities | Get API Key |
|---|---|---|---|---|---|
| OpenRouter | 29 | Free tier + $10 topup | 1M | audio, text | <a href="https://openrouter.ai/workspaces/default/keys" target="_blank" rel="noopener">→</a> |
<!-- END_RENEWABLE -->

## Quick Reference — Base URLs & API Keys

<!-- BEGIN_QUICK_REF -->
| Provider | Base URL | Get API Key | Credit Card? |
|---|---|---|---|
| Groq | `https://api.groq.com/openai/v1` | <a href="https://console.groq.com/keys" target="_blank" rel="noopener">Get Key →</a> | No |
| Mistral AI | `https://api.mistral.ai/v2` | <a href="https://console.mistral.ai/api-keys" target="_blank" rel="noopener">Get Key →</a> | No |
| Fixture New Provider | `https://example.com/v1` | <a href="https://example.com/keys" target="_blank" rel="noopener">Get Key →</a> | No |
| OpenRouter | `https://openrouter.ai/api/v1` | <a href="https://openrouter.ai/workspaces/default/keys" target="_blank" rel="noopener">Get Key →</a> | Registration |
<!-- END_QUICK_REF -->
