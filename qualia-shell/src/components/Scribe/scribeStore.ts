import { create } from 'zustand';

interface ScribeState {
    activeContent: string;
    setActiveContent: (s: string) => void;
}

const SAMPLE_DOC = `# Welcome to Scribe

Markdown editor with AI redlines, inline comments, versioning, smart paste.

---

## What works in Cycle 4

- CodeMirror 6 editor with full markdown syntax highlighting
- Mark-hiding (markup chars vanish when cursor is elsewhere)
- Live table preview (GFM tables render as HTML when cursor leaves)
- Fenced code block highlighting
- ==Highlight== markers
- Smart paste (Cmd+Shift+V strips soft-wraps; Cmd+Shift+Alt+V collapses whitespace)
- Double-space period (iOS-style ". " insertion)

## What's coming

- **Cycle 5:** File CRUD against backend
- **Cycle 6:** AI redlines via \`callLlm()\`
- **Cycle 7:** Inline comments
- **Cycle 8:** Versioning + Table of Contents
- **Cycle 9:** Minimap
- **Cycle 10:** Theme settings UI

> "The filesystem is the source of truth, and the database is a rebuildable index."
> — Agenteryx architecture-v4

### Code example

\`\`\`typescript
import { callLlm } from '../lib/llmClient';

const response = await callLlm({
    prompt: selectedText,
    systemPrompt: REDLINE_SYSTEM_PROMPT,
    responseFormat: 'json',
}, integrations.llm);
\`\`\`

### Table example

| Feature | Status | Cycle |
|---------|--------|-------|
| Editor | Done | 4 |
| File CRUD | Planned | 5 |
| Redlines | Planned | 6 |
| Comments | Planned | 7 |

---

*Scribe is ported from [Agenteryx](https://github.com/NovaTrustSolutions/Agenteryx) — see \`Scripts/autorun/PORTING_PLAN.md\` for the full plan.*
`;

export const useScribeStore = create<ScribeState>((set) => ({
    activeContent: SAMPLE_DOC,
    setActiveContent: (s) => set({ activeContent: s }),
}));
