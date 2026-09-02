/**
 * araHelloMode — plan 056 §1: the keyless first ARA reply.
 *
 * When NO LLM key is configured and the backend chat path fails, ARA answers
 * through the free, anonymous Pollinations endpoint (the Research Lab's
 * verified keyless provider — request shape copied, module NOT imported:
 * researchLlm is firewalled the other way, see researchLabImportGuard.test).
 *
 * HARD RULE (enforced by araHelloMode.test.ts): the outgoing body is EXACTLY
 * {model, messages:[system, user], stream:false} — the fixed orientation
 * prompt plus the user's typed text. No store imports, no context, no
 * Authorization header. This file must never import from any app-data module.
 */

export const HELLO_MODE_URL = 'https://text.pollinations.ai/openai';
export const HELLO_MODE_MODEL = 'openai';

export const HELLO_MODE_SYSTEM_PROMPT =
    'You are ARA, Dwellium\'s assistant, in hello mode: greet, explain what Dwellium does in two sentences ' +
    '(a property-management desk: properties, tenants, inbox, and an AI team that does real work), ' +
    'and suggest adding an AI key in Control Panel → API Keys for full answers. ' +
    'You have NO access to any property, tenant, or financial data — never claim to.';

/** The chip shown on every hello-mode reply and the banner text while keyless. */
export const HELLO_MODE_CHIP = 'Hello mode — free, anonymous, no property data · Add a key for the full ARA';
export const HELLO_MODE_BANNER = 'Hello mode active — ARA answers anonymously with no property data. Add a key for the full ARA.';

/** Pure: the exact request ARA sends in hello mode. Exported so the test can pin it. */
export function buildHelloModeRequest(userText: string): RequestInit & { body: string } {
    return {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: HELLO_MODE_MODEL,
            messages: [
                { role: 'system', content: HELLO_MODE_SYSTEM_PROMPT },
                { role: 'user', content: userText },
            ],
            stream: false,
        }),
    };
}

/** One keyless reply. Throws on any failure so the caller can fall to its error surface. */
export async function callHelloMode(userText: string, signal?: AbortSignal): Promise<string> {
    const res = await fetch(HELLO_MODE_URL, { ...buildHelloModeRequest(userText), signal });
    if (!res.ok) throw new Error(`Hello mode HTTP ${res.status}`);
    const body = await res.json() as { choices?: { message?: { content?: string } }[] };
    const text = body.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error('Hello mode returned an empty reply');
    return text;
}
