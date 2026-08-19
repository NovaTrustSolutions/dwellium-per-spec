/**
 * Interactive Docs — Wave 3A PPTX import (tiny .pptx fixture built with jszip).
 */
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { importPptxFile, importPptxTheme } from '../components/Scribe/idocs/idocsPptxImport';

const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const rels = (items: [string, string, string?][]) => `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items.map(([id, target, mode]) => `<Relationship Id="${id}" Type="x" Target="${target}"${mode ? ` TargetMode="${mode}"` : ''}/>`).join('')}</Relationships>`;
const sp = (ph: string | null, paras: string) => `<p:sp><p:nvSpPr><p:cNvPr id="1" name="s"/><p:cNvSpPr/><p:nvPr>${ph ? `<p:ph type="${ph}"/>` : ''}</p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/>${paras}</p:txBody></p:sp>`;
const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const slide1 = `<?xml version="1.0"?><p:sld ${NS}><p:cSld><p:spTree>
${sp('title', '<a:p><a:r><a:rPr/><a:t>Welcome</a:t></a:r></a:p>')}
${sp('body', '<a:p><a:pPr><a:buChar char="•"/></a:pPr><a:r><a:rPr b="1"/><a:t>First</a:t></a:r><a:r><a:t> point</a:t></a:r></a:p><a:p><a:pPr lvl="1"><a:buChar char="•"/></a:pPr><a:r><a:t>Sub point</a:t></a:r></a:p><a:p><a:pPr><a:buAutoNum type="arabicPeriod"/></a:pPr><a:r><a:rPr><a:hlinkClick r:id="rId9"/></a:rPr><a:t>Linked</a:t></a:r></a:p>')}
${sp(null, '<a:p><a:pPr><a:buNone/></a:pPr><a:r><a:rPr i="1"/><a:t>Free text</a:t></a:r></a:p>')}
</p:spTree></p:cSld></p:sld>`;
const notes1 = `<?xml version="1.0"?><p:notes ${NS}><p:cSld><p:spTree>${sp('sldNum', '<a:p><a:r><a:t>1</a:t></a:r></a:p>')}${sp('body', '<a:p><a:r><a:t>Remember to smile</a:t></a:r></a:p><a:p><a:r><a:t>Second line</a:t></a:r></a:p>')}</p:spTree></p:cSld></p:notes>`;
const slide2 = `<?xml version="1.0"?><p:sld ${NS}><p:cSld><p:spTree>
${sp('ctrTitle', '<a:p><a:r><a:t>Data</a:t></a:r></a:p>')}
<p:pic><p:nvPicPr><p:cNvPr id="4" name="Picture" descr="A dot"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId2"/></p:blipFill><p:spPr/></p:pic>
<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="5" name="Table"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tr><a:tc><a:txBody><a:p><a:r><a:t>Name</a:t></a:r></a:p></a:txBody></a:tc><a:tc><a:txBody><a:p><a:r><a:t>Qty</a:t></a:r></a:p></a:txBody></a:tc></a:tr><a:tr><a:tc><a:txBody><a:p><a:r><a:t>Apples</a:t></a:r></a:p></a:txBody></a:tc><a:tc><a:txBody><a:p><a:r><a:t>3</a:t></a:r></a:p></a:txBody></a:tc></a:tr></a:tbl></a:graphicData></a:graphic></p:graphicFrame>
<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="6" name="Chart"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rId3"/></a:graphicData></a:graphic></p:graphicFrame>
</p:spTree></p:cSld></p:sld>`;
const chart1 = `<?xml version="1.0"?><c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><c:chart><c:title><c:tx><c:rich><a:p><a:r><a:t>Fruit</a:t></a:r></a:p></c:rich></c:tx></c:title><c:plotArea><c:pieChart><c:ser><c:cat><c:strRef><c:strCache><c:pt idx="0"><c:v>Apples</c:v></c:pt><c:pt idx="1"><c:v>Pears</c:v></c:pt></c:strCache></c:strRef></c:cat><c:val><c:numRef><c:numCache><c:pt idx="0"><c:v>3</c:v></c:pt><c:pt idx="1"><c:v>5</c:v></c:pt></c:numCache></c:numRef></c:val></c:ser></c:pieChart></c:plotArea></c:chart></c:chartSpace>`;
const theme1 = `<?xml version="1.0"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office"><a:themeElements><a:clrScheme name="Fancy"><a:dk1><a:sysClr val="windowText" lastClr="111111"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2><a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2></a:clrScheme><a:fontScheme name="Office"><a:majorFont><a:latin typeface="Calibri Light"/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/></a:minorFont></a:fontScheme></a:themeElements></a:theme>`;

async function fixturePptx(): Promise<File> {
    const zip = new JSZip();
    // Slide order in presentation.xml is deliberately 2 → 1 via rIds mapping to test ordering by sldIdLst.
    zip.file('ppt/presentation.xml', `<?xml version="1.0"?><p:presentation ${NS}><p:sldIdLst><p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId3"/></p:sldIdLst></p:presentation>`);
    zip.file('ppt/_rels/presentation.xml.rels', rels([['rId1', 'theme/theme1.xml'], ['rId2', 'slides/slide1.xml'], ['rId3', 'slides/slide2.xml']]));
    zip.file('ppt/slides/slide1.xml', slide1);
    zip.file('ppt/slides/_rels/slide1.xml.rels', rels([['rId1', '../notesSlides/notesSlide1.xml'], ['rId9', 'https://example.com/link', 'External']]));
    zip.file('ppt/notesSlides/notesSlide1.xml', notes1);
    zip.file('ppt/slides/slide2.xml', slide2);
    zip.file('ppt/slides/_rels/slide2.xml.rels', rels([['rId2', '../media/image1.png'], ['rId3', '../charts/chart1.xml']]));
    zip.file('ppt/media/image1.png', PNG_1PX, { base64: true });
    zip.file('ppt/charts/chart1.xml', chart1);
    zip.file('ppt/theme/theme1.xml', theme1);
    const buf = await zip.generateAsync({ type: 'uint8array' });
    return new File([buf], 'My Deck.pptx', { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
}

describe('importPptxFile', () => {
    it('2 slides → 2 cards with titles, bullets, notes, image, table, chart', async () => {
        const doc = await importPptxFile(await fixturePptx());
        expect(doc.title).toBe('My Deck');
        expect(doc.cards).toHaveLength(2);
        const [c1, c2] = doc.cards;
        expect(c1.title).toBe('Welcome');
        expect(c1.blocks.map((b) => b.type)).toEqual(['text', 'text']);
        const md = c1.blocks[0].type === 'text' ? c1.blocks[0].md : '';
        expect(md).toBe('- **First** point\n  - Sub point\n1. [Linked](https://example.com/link)');
        expect(c1.blocks[1]).toMatchObject({ type: 'text', md: '*Free text*' });
        expect(c1.notes).toBe('Remember to smile\nSecond line');

        expect(c2.title).toBe('Data');
        expect(c2.blocks.map((b) => b.type)).toEqual(['image', 'table', 'chart']);
        expect(c2.blocks[0]).toMatchObject({ type: 'image', alt: 'A dot' });
        expect(c2.blocks[0].type === 'image' && c2.blocks[0].src.startsWith('data:image/png;base64,iVBOR')).toBe(true);
        expect(c2.blocks[1]).toMatchObject({ type: 'table', headers: ['Name', 'Qty'], rows: [['Apples', '3']] });
        expect(c2.blocks[2]).toMatchObject({ type: 'chart', kind: 'pie', title: 'Fruit', data: [{ label: 'Apples', value: 3 }, { label: 'Pears', value: 5 }] });
    });
    it('rejects a zip without slides', async () => {
        const zip = new JSZip(); zip.file('hello.txt', 'x');
        await expect(importPptxFile(new File([await zip.generateAsync({ type: 'uint8array' })], 'nope.pptx'))).rejects.toThrow(/No slides/);
    });
});

describe('importPptxTheme', () => {
    it('maps clrScheme + fontScheme to the --idoc-* vars', async () => {
        const t = await importPptxTheme(await fixturePptx());
        expect(t.name).toBe('Fancy');
        expect(t.vars).toMatchObject({ '--idoc-bg': '#e7e6e6', '--idoc-surface': '#ffffff', '--idoc-text': '#111111', '--idoc-muted': '#44546a', '--idoc-accent': '#4472c4', '--idoc-radius': '8px' });
        expect(t.vars['--idoc-heading-font']).toBe('"Calibri Light", sans-serif');
        expect(t.vars['--idoc-body-font']).toBe('"Calibri", sans-serif');
        expect(t.vars['--idoc-border']).toMatch(/^#[0-9a-f]{6}$/);
        expect(Object.keys(t.vars).every((k) => k.startsWith('--idoc-'))).toBe(true);
    });
});
