/**
 * araStarterPrompts — plan 046 A1 "ARA speaks first": per-persona starter
 * chips shown in the empty state. Keyed by BUILTIN_MODES ids; unknown ids fall
 * back to the Executive Assistant list. Pure data — no state, no component.
 */
export const STARTER_PROMPTS: Record<string, string[]> = {
    'executive-assistant': [
        'What should I focus on today?',
        'Which leases end in the next 60 days?',
        'Open Strata',
        'Draft a late-rent reminder for unit 4B',
        'Summarize my open work orders',
    ],
    'chief-of-staff': [
        'Turn my open goals into a plan for this week',
        "What's the critical path on my top goal?",
        'Which tasks have sat the longest on my board?',
        'Draft a weekly priorities memo',
    ],
    'research-synthesizer': [
        'Compare Georgia vs Florida security-deposit rules, with sources',
        'Brief me on this property from my files',
        "What's changed in rent regulation this year?",
        'Where are the gaps in our vendor compliance data?',
    ],
    'lead-counsel': [
        'Review this lease clause for risk: …',
        'What notice applies to a month-to-month tenant in Georgia?',
        'Flag compliance risks in our vendor onboarding',
        'What should a late-fee clause never say?',
    ],
    'clinical-analyst': [
        'Find outliers in our maintenance response times',
        'Is our vacancy trend meaningful or noise?',
        'Occupancy by property, with caveats',
        "Stress-test this forecast's assumptions",
    ],
    'financial-strategist': [
        'Model a 5% rent increase across occupied units',
        'Where is our biggest maintenance spend?',
        'Best/likely/worst case for a new roof',
        'Is this vendor quote in range?',
    ],
    'creative-director': [
        'Name our tenant newsletter',
        'Rewrite this listing to stand out',
        'Draft a welcome note for new residents',
        '3 taglines for the owner portal',
    ],
    diplomat: [
        'Tactful late-rent reminder for unit 4B',
        'Reply to an upset tenant about a delayed repair',
        'Owner update about a vacancy',
        'De-escalate a noise complaint between neighbors',
    ],
    'devils-advocate': [
        'Poke holes in my plan to self-manage maintenance',
        'What goes wrong if we raise rent 5%?',
        'Steelman keeping our slowest vendor',
        "What am I not seeing in my top goal?",
    ],
};

export function starterPromptsFor(modeId: string): string[] {
    return STARTER_PROMPTS[modeId] ?? STARTER_PROMPTS['executive-assistant'];
}
