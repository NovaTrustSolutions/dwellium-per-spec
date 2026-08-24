/**
 * fluidVoiceLocalApi — plan 053 "Dictation to 100%": live detection of the
 * FluidVoice companion app + one-click vocabulary seed over its loopback API.
 *
 * FluidVoice's opt-in Local API listens on http://127.0.0.1:47733 (loopback
 * only, no auth, NO CORS headers — verified from upstream source:
 * https://raw.githubusercontent.com/altic-dev/FluidVoice/main/Sources/Fluid/Services/LocalAPI/LocalAPIModels.swift
 * `defaultPort = 47_733`; …/LocalAPIServer.swift loopback guard;
 * …/LocalAPIRouter.swift routes incl. GET /v1/health and
 * POST /v1/dictionary/custom-words).
 *
 * Because the server sends no CORS headers, the browser can only make
 * `mode: 'no-cors'` requests: the response is OPAQUE — we can never read the
 * body or status. Honesty contract (plan 053 target 1):
 *   - a no-cors fetch that RESOLVES  ≈ something answered on :47733 → "Running"
 *   - a no-cors fetch that REJECTS   ≈ nothing listening            → "Not detected"
 * Chrome/Firefox permit http://127.0.0.1 subresource requests from https
 * pages (loopback is a potentially-trustworthy origin per the W3C Secure
 * Contexts spec, https://www.w3.org/TR/secure-contexts/), so this works from
 * the deployed app; older browsers that still block it simply report
 * "Not detected" — which is the honest answer there too.
 */
import { useEffect, useState } from 'react';
import { buildVocabularyPayload } from '../data/fluidVoiceVocabulary';

export const FLUIDVOICE_BASE = 'http://127.0.0.1:47733';
export const FLUIDVOICE_HEALTH_URL = `${FLUIDVOICE_BASE}/v1/health`;
export const FLUIDVOICE_CUSTOM_WORDS_URL = `${FLUIDVOICE_BASE}/v1/dictionary/custom-words`;

export type FluidVoiceState = 'unknown' | 'checking' | 'running' | 'not-detected';

type FetchLike = (input: string, init?: RequestInit) => Promise<unknown>;

/** FluidVoice is macOS-only (README "Requirements"); only probe on Macs. */
export function isMacLike(nav: { platform?: string; userAgent?: string } = navigator): boolean {
    return /mac/i.test(nav.platform ?? '') || /mac os/i.test(nav.userAgent ?? '');
}

function timeoutSignal(ms: number): AbortSignal | undefined {
    try {
        return AbortSignal.timeout(ms);
    } catch {
        return undefined; // very old runtimes — probe just waits for the network error
    }
}

/**
 * Ping the Local API health route. Opaque-response honesty: resolve ≈ running,
 * network error ≈ not detected (we cannot read the body either way).
 */
export async function probeFluidVoice(fetchFn: FetchLike = fetch): Promise<'running' | 'not-detected'> {
    try {
        await fetchFn(FLUIDVOICE_HEALTH_URL, { mode: 'no-cors', cache: 'no-store', signal: timeoutSignal(2500) });
        return 'running';
    } catch {
        return 'not-detected';
    }
}

/**
 * One-click vocabulary seed: POST the append-mode payload to the custom-words
 * route. `no-cors` means we CANNOT read FluidVoice's response — 'sent' only
 * says the request left the browser without a network error (fire-and-recheck;
 * the UI must say so). The clipboard + curl path remains the verifiable
 * fallback. Payload shape matches upstream `CustomWordsWriteRequest`
 * (`entries[{text,weight?,aliases?}]`, `mode`) per DictionaryAPIController.swift.
 */
export async function sendVocabulary(fetchFn: FetchLike = fetch): Promise<'sent' | 'unreachable'> {
    try {
        await fetchFn(FLUIDVOICE_CUSTOM_WORDS_URL, {
            method: 'POST',
            mode: 'no-cors',
            // no-cors forces the content-type to a safelisted value (text/plain);
            // FluidVoice decodes the JSON body regardless of the header.
            body: JSON.stringify(buildVocabularyPayload()),
            signal: timeoutSignal(4000),
        });
        return 'sent';
    } catch {
        return 'unreachable';
    }
}

/**
 * Hook: live FluidVoice state. Probes once on mount (macOS only — elsewhere it
 * stays 'unknown' and the caller shows the non-Mac copy). `recheck` re-probes.
 */
export function useFluidVoiceStatus(): { state: FluidVoiceState; recheck: () => void } {
    const [state, setState] = useState<FluidVoiceState>('unknown');
    const [nonce, setNonce] = useState(0);
    useEffect(() => {
        if (!isMacLike()) return;
        let on = true;
        setState('checking');
        void probeFluidVoice().then((r) => { if (on) setState(r); });
        return () => { on = false; };
    }, [nonce]);
    return { state, recheck: () => setNonce((n) => n + 1) };
}
