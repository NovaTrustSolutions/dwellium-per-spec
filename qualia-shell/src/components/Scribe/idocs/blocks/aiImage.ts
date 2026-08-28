/**
 * aiImage — Wave 2 "Generate with AI" for image blocks / gallery items / card
 * images. Reuses the app's LibreChat-derived image-gen skill (`skill-image-gen`
 * in src/lib/agents/skills.ts: DALL·E 3 with the user's OpenAI key, Gemini
 * image as fallback) and downscales the result to a bounded data URL.
 *
 * The skill is invoked directly via `.run()` (the click is a human action) —
 * `runSkillForInput(..., 'model')` would refuse it (image-gen is not on the
 * autonomous-safe allowlist by design). skills.ts is imported lazily so the
 * block editor's module graph stays light.
 */
import type { IntegrationsBundle } from '../../../../types/integrations';
import { downscaleImageDataUrl } from '../../../../lib/imageDownscale';

export type LlmBundle = IntegrationsBundle['llm'];
export type ImageStyle = 'photo' | 'illustration' | '3d' | 'line-art' | 'abstract';
export type ImageSize = 'square' | 'wide' | 'tall';

export const IMAGE_STYLES: { id: ImageStyle; label: string; hint: string }[] = [
    { id: 'photo', label: 'Photo', hint: 'photorealistic photograph, natural lighting, shallow depth of field' },
    { id: 'illustration', label: 'Illustration', hint: 'flat vector illustration, clean shapes, limited palette' },
    { id: '3d', label: '3D', hint: '3D render, soft studio lighting, subtle materials' },
    { id: 'line-art', label: 'Line art', hint: 'minimal black line art on white, single-weight lines, no shading' },
    { id: 'abstract', label: 'Abstract', hint: 'abstract geometric composition, bold shapes, harmonious colors' },
];

// ponytail: the skill always requests 1024×1024; "size" steers composition via the prompt and the downscale cap; trigger: an image block ships at a size where the 1024 downscale visibly softens.
export const IMAGE_SIZES: { id: ImageSize; label: string; hint: string; maxEdge: number }[] = [
    { id: 'square', label: 'Square', hint: 'square composition', maxEdge: 1024 },
    { id: 'wide', label: 'Wide 16:9', hint: 'wide 16:9 landscape composition with room at the sides', maxEdge: 1280 },
    { id: 'tall', label: 'Tall 9:16', hint: 'tall 9:16 portrait composition', maxEdge: 1280 },
];

export function hasImageGenKey(llm: LlmBundle | undefined): boolean {
    return !!(llm?.openai?.apiKey || llm?.gemini?.apiKey);
}

export function buildImagePrompt(prompt: string, style: ImageStyle, size: ImageSize): string {
    const s = IMAGE_STYLES.find((x) => x.id === style)?.hint ?? '';
    const z = IMAGE_SIZES.find((x) => x.id === size)?.hint ?? '';
    return [prompt.trim(), s, z].filter(Boolean).join(', ');
}

/** Markdown `![alt](data:image/…)` (what the skill returns) → the data URL, or null. */
export function dataUrlFromSkillText(text: string): string | null {
    return /\((data:image\/[a-z0-9.+-]+;base64,[^)\s]+)\)/i.exec(text)?.[1] ?? null;
}

/** Generate → downscale → data URL. Throws a readable Error when no key / generation fails. */
export async function generateImageDataUrl(prompt: string, opts: { style: ImageStyle; size: ImageSize; llm: LlmBundle }): Promise<string> {
    if (!prompt.trim()) throw new Error('Describe the image first');
    if (!hasImageGenKey(opts.llm)) throw new Error('Add an OpenAI or Gemini key (Control Panel → API Keys) to generate images.');
    const { AGENT_SKILLS } = await import('../../../../lib/agents/skills');
    const skill = AGENT_SKILLS.find((s) => s.id === 'skill-image-gen');
    if (!skill) throw new Error('Image generation skill unavailable');
    const res = await skill.run(buildImagePrompt(prompt, opts.style, opts.size), { llm: opts.llm });
    if (!res.ok) throw new Error(res.text);
    const url = dataUrlFromSkillText(res.text);
    if (!url) throw new Error('No image returned');
    const maxEdge = IMAGE_SIZES.find((x) => x.id === opts.size)?.maxEdge ?? 1024;
    try { return await downscaleImageDataUrl(url, maxEdge, 0.85); } catch { return url; }
}
