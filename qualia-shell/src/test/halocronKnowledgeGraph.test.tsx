import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import HalocronKnowledgeGraph from '../components/Shell/HalocronKnowledgeGraph';

vi.mock('../hooks/useIntegrations', () => ({
    useIntegrations: () => ({ integrations: { llm: {} } }),
}));

vi.mock('../lib/llmClient', () => ({
    callLlm: vi.fn(),
}));

vi.mock('../components/common/AgentEta', () => ({
    default: ({ label }: { label: string }) => <div>{label}</div>,
}));

class MockResizeObserver {
    observe = vi.fn();
    disconnect = vi.fn();
}

describe('HalocronKnowledgeGraph zoom handling', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.stubGlobal('ResizeObserver', MockResizeObserver);
        vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
        vi.stubGlobal('cancelAnimationFrame', vi.fn());
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false })));
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as CanvasRenderingContext2D);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('keeps wheel zoom on the canvas instead of bubbling to scroll containers', () => {
        const addEventListenerSpy = vi.spyOn(HTMLCanvasElement.prototype, 'addEventListener');
        const { container } = render(<HalocronKnowledgeGraph />);
        const canvas = container.querySelector<HTMLCanvasElement>('.kg-canvas');
        const body = container.querySelector<HTMLElement>('.kg-body');
        expect(canvas).not.toBeNull();
        expect(body).not.toBeNull();

        Object.defineProperty(canvas, 'getBoundingClientRect', {
            value: () => ({
                left: 0,
                top: 0,
                right: 800,
                bottom: 520,
                width: 800,
                height: 520,
                x: 0,
                y: 0,
                toJSON: () => ({}),
            }),
        });

        const bodyWheel = vi.fn();
        body!.addEventListener('wheel', bodyWheel);
        const wheel = new WheelEvent('wheel', {
            bubbles: true,
            cancelable: true,
            clientX: 400,
            clientY: 260,
            deltaY: -120,
        });
        const dispatched = canvas!.dispatchEvent(wheel);

        const wheelRegistration = addEventListenerSpy.mock.calls.find(([eventName]) => eventName === 'wheel');
        expect(wheelRegistration?.[2]).toMatchObject({ passive: false });
        expect(wheel.defaultPrevented).toBe(true);
        expect(dispatched).toBe(false);
        expect(bodyWheel).not.toHaveBeenCalled();
    });
});
