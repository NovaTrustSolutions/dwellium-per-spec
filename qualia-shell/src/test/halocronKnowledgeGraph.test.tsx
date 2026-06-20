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

const makePointerEvent = (
    type: string,
    init: MouseEventInit & { pointerId?: number } = {},
) => {
    const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        ...init,
    }) as PointerEvent;
    Object.defineProperty(event, 'pointerId', { value: init.pointerId ?? 1 });
    return event;
};

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

    it('pans the graph with a left-button pointer drag instead of scrolling the graph container', () => {
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

        const pointerDownRegistration = addEventListenerSpy.mock.calls.find(([eventName]) => eventName === 'pointerdown');
        expect(pointerDownRegistration).toBeTruthy();

        const bodyPointerMove = vi.fn();
        body!.addEventListener('pointermove', bodyPointerMove);

        const pointerDown = makePointerEvent('pointerdown', {
            button: 0,
            buttons: 1,
            clientX: 100,
            clientY: 100,
            pointerId: 7,
        });
        const downDispatched = canvas!.dispatchEvent(pointerDown);

        const pointerMove = makePointerEvent('pointermove', {
            button: 0,
            buttons: 1,
            clientX: 160,
            clientY: 135,
            pointerId: 7,
        });
        const moveDispatched = canvas!.dispatchEvent(pointerMove);

        canvas!.dispatchEvent(makePointerEvent('pointerup', {
            button: 0,
            buttons: 0,
            clientX: 160,
            clientY: 135,
            pointerId: 7,
        }));

        expect(pointerDown.defaultPrevented).toBe(true);
        expect(downDispatched).toBe(false);
        expect(pointerMove.defaultPrevented).toBe(true);
        expect(moveDispatched).toBe(false);
        expect(bodyPointerMove).not.toHaveBeenCalled();
    });
});
