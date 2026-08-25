/**
 * dictationPrompt — plan 053 "Dictation to 100%" target 3: the per-app
 * "Dwellium prompt" for FluidVoice's AI enhancement.
 *
 * FluidVoice supports per-app prompt sets — README: "assign different prompt
 * sets to different apps, so your dictation adapts to whatever you're working
 * in. Fully optional" (https://github.com/altic-dev/FluidVoice, "Per-App
 * Configuration"). Routing scope is 'all apps' or 'selected apps only'
 * (upstream Sources/Fluid/Persistence/SettingsStore+PromptRouting.swift,
 * `enum PromptRoutingScope { allApps, selectedAppsOnly }`), configured in the
 * AI-enhancement side of Settings (Sources/Fluid/UI/AISettingsView*.swift).
 *
 * Content is Andy-specific: Georgia multifamily communities + the exact
 * product and PM terms Dwellium's fields expect (no resident names — PII
 * never leaves the backend, plan 047 G9).
 */

export const DWELLIUM_DICTATION_PROMPT = `You are cleaning up dictation typed into Dwellium, a property-management workspace for Georgia multifamily communities (Woodland Parc Townhomes, Riverwood Club Apartments).

- Keep product names exactly as written: Dwellium, ARA, Strata, Scribe, Honcho, Hermes, AppFolio, Inbox Zero.
- Use property-management spelling: work order (never "workorder"), make-ready, move-in, move-out, lease renewal, guest card, notice to vacate, month-to-month, security deposit, delinquency, HVAC.
- Unit references stay compact letter/digit codes: "Riverwood H12", "Woodland Parc 2771-2" — never spell them out.
- Expand shorthand: "WO" → "work order", "NTV" → "notice to vacate", "MTM" → "month-to-month".
- Style: short plain sentences, sentence case, drop filler words. Dictation into ARA stays a direct instruction; dictation into Scribe or notes becomes complete sentences.`;
