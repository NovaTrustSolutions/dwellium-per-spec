/**
 * 055-p5: Finder-drag → widget drop zones. The AdminShell capture blocker
 * must let drags through when the target sits inside a designated zone —
 * Scribe's CodeMirror (.cm-editor / data-dwellium-drop-zone), the Whiteboard
 * root, the IDoc chat panel, and the two legacy class zones — and keep
 * blocking everywhere else.
 */
import { describe, it, expect } from 'vitest';
import { isFileDropTarget } from '../lib/fileDropZones';

function el(html: string): HTMLElement {
    const host = document.createElement('div');
    host.innerHTML = html;
    document.body.appendChild(host);
    return host.querySelector<HTMLElement>('[data-target]')!;
}

describe('isFileDropTarget', () => {
    it('allows the Scribe CodeMirror editor (.cm-editor)', () => {
        expect(isFileDropTarget(el('<div class="cm-editor"><div data-target></div></div>'))).toBe(true);
    });

    it('allows any [data-dwellium-drop-zone] container (Whiteboard, IDoc chat)', () => {
        expect(isFileDropTarget(el('<div data-dwellium-drop-zone="whiteboard"><canvas data-target></canvas></div>'))).toBe(true);
    });

    it('allows the legacy class zones (TranscriptionHub upload, File Manager)', () => {
        expect(isFileDropTarget(el('<div class="th-mock-upload-area"><span data-target></span></div>'))).toBe(true);
        expect(isFileDropTarget(el('<div class="file-manager"><span data-target></span></div>'))).toBe(true);
    });

    it('blocks everything else (desktop, arbitrary widgets)', () => {
        expect(isFileDropTarget(el('<div class="desktop"><div data-target></div></div>'))).toBe(false);
        expect(isFileDropTarget(null)).toBe(false);
    });
});
