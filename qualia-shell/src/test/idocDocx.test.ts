/**
 * Interactive Docs — Wave 3A DOCX export (docx lib runs in node → Packer.toBuffer).
 */
import { describe, it, expect } from 'vitest';
import { Packer } from 'docx';
import JSZip from 'jszip';
import { buildIdocDocx } from '../components/Scribe/idocs/idocDocx';
import { BLOCK_TYPES, createEmptyDoc, defaultBlock, type IDoc } from '../components/Scribe/idocs/idocTypes';

function fixture(): IDoc {
    return createEmptyDoc({
        title: 'Word Export',
        description: 'desc',
        theme: 'forest',
        cards: [
            { id: 'c1', title: 'One', layout: 'default', notes: 'presenter says hi', blocks: [
                { id: 'b1', type: 'heading', level: 2, text: 'Sub' },
                { id: 'b2', type: 'text', md: 'Text with **bold**\n- a\n- b' },
                { id: 'b3', type: 'callout', tone: 'warning', md: 'Careful' },
                { id: 'b4', type: 'table', headers: ['H1', 'H2'], rows: [['1', '2']] },
                { id: 'b5', type: 'chart', kind: 'bar', title: 'Sales', data: [{ label: 'Q1', value: 3 }] },
                { id: 'b6', type: 'image', src: 'https://img.example/x.png', alt: 'An image' },
            ], children: [{ id: 'c1a', title: 'Child', layout: 'default', blocks: [{ id: 'b7', type: 'quiz', question: 'Q?', options: ['A', 'B'], answerIndex: 1 }] }] },
            { id: 'c2', title: 'Two', layout: 'default', blocks: BLOCK_TYPES.map((t) => defaultBlock(t)) },
        ],
    });
}

async function documentXml(doc: IDoc): Promise<string> {
    const buf = await Packer.toBuffer(buildIdocDocx(doc));
    expect(buf.length).toBeGreaterThan(1000);
    expect(String.fromCharCode(buf[0], buf[1])).toBe('PK'); // zip signature
    const zip = await JSZip.loadAsync(buf);
    return zip.file('word/document.xml')!.async('string');
}

describe('buildIdocDocx', () => {
    it('produces a non-empty docx zip with title, headings for cards/blocks/nested, notes appendix', async () => {
        const xml = await documentXml(fixture());
        expect(xml).toContain('Word Export');
        expect((xml.match(/w:val="Heading1"/g) ?? []).length).toBe(3); // One, Two, Presenter notes
        expect((xml.match(/w:val="Heading2"/g) ?? []).length).toBe(1); // nested "Child"
        expect((xml.match(/w:val="Heading3"/g) ?? []).length).toBe(2); // heading blocks (level 2 → H3): fixture + defaultBlock('heading')
        expect(xml).toContain('Presenter notes');
        expect(xml).toContain('presenter says hi');
    });
    it('renders table + chart data table + caption, callout shading, image placeholder when unfetched', async () => {
        const xml = await documentXml(fixture());
        expect(xml).toContain('<w:tbl>');
        expect(xml).toContain('chart: bar — Sales — see live doc');
        expect(xml).toContain('w:fill="FFFBEB"'); // warning callout shading
        expect(xml).toContain('[image: An image]');
        expect(xml).toContain('Answer: B');
        expect(xml).toContain('<w:b/>'); // bold run from markdown
    });
    it('every default block type survives packing', async () => {
        const xml = await documentXml(fixture());
        expect(xml).toContain('E = mc^2');
        expect(xml).toContain('flowchart LR');
        expect(xml).toContain('Awareness: 100');
    });
});
