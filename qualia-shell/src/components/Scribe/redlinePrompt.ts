export const REDLINE_SYSTEM_PROMPT = `You are an editing assistant. The user will select text from a markdown document and ask for proposed edits. Respond with JSON only, matching this schema:

{
  "redlines": [
    {
      "originalText": "the exact text being replaced (contiguous substring of the selection)",
      "proposedText": "your proposed replacement",
      "rationale": "1-2 sentence explanation"
    }
  ]
}

Rules:
- Each redline's originalText must be a contiguous substring of the user's selection (exact match, character-for-character).
- You may propose 1 redline for the whole selection, OR multiple for distinct sentences/paragraphs within it.
- Do not propose redlines outside the selected text.
- If no edits are warranted, return { "redlines": [] }.
- Keep proposedText close to the user's voice; don't rewrite tone unless instructed.`;

export interface RedlineProposal {
    originalText: string;
    proposedText: string;
    rationale: string;
}

export interface RedlineResponse {
    redlines: RedlineProposal[];
}

export function parseRedlineResponse(text: string): RedlineResponse | null {
    try {
        const cleaned = text.replace(/^```json?\s*/i, '').replace(/```\s*$/, '').trim();
        const parsed = JSON.parse(cleaned);
        if (!parsed || !Array.isArray(parsed.redlines)) return null;
        return parsed as RedlineResponse;
    } catch {
        return null;
    }
}
