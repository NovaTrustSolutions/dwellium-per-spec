/**
 * activateOnEnterOrSpace — the one keyboard path for every clickable non-button
 * element in the Strata modules (2026-09-06 a11y sweep, Docs/code.md).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { activateOnEnterOrSpace } from '../components/common/keyboardActivate';

afterEach(cleanup);

describe('activateOnEnterOrSpace', () => {
    it('Enter and Space on the element itself re-dispatch its click once each; other keys are ignored', () => {
        const onClick = vi.fn();
        render(<div role="button" tabIndex={0} onKeyDown={activateOnEnterOrSpace} onClick={onClick}>Open</div>);
        const el = screen.getByRole('button', { name: 'Open' });

        expect(fireEvent.keyDown(el, { key: 'a' })).toBe(true); // default not prevented
        expect(onClick).not.toHaveBeenCalled();

        expect(fireEvent.keyDown(el, { key: 'Enter' })).toBe(false); // preventDefault() ran
        expect(onClick).toHaveBeenCalledTimes(1);

        expect(fireEvent.keyDown(el, { key: ' ' })).toBe(false); // Space must not scroll
        expect(onClick).toHaveBeenCalledTimes(2);
    });

    it('keys pressed on a nested control are left to that control', () => {
        const onClick = vi.fn();
        render(
            <div role="button" tabIndex={0} onKeyDown={activateOnEnterOrSpace} onClick={onClick}>
                Row <button type="button" onClick={e => e.stopPropagation()}>Delete</button>
            </div>,
        );
        fireEvent.keyDown(screen.getByRole('button', { name: 'Delete' }), { key: 'Enter' });
        expect(onClick).not.toHaveBeenCalled();
    });

    it('inside a mouse-convenience container (role=presentation + onClick), Enter on the title reaches the container once', () => {
        const open = vi.fn();
        render(
            <div role="presentation" onClick={open}>
                <span role="button" tabIndex={0} onKeyDown={activateOnEnterOrSpace}>Title</span>
                <button type="button" onClick={e => e.stopPropagation()}>Delete</button>
            </div>,
        );
        fireEvent.keyDown(screen.getByRole('button', { name: 'Title' }), { key: 'Enter' });
        expect(open).toHaveBeenCalledTimes(1);
        fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
        expect(open).toHaveBeenCalledTimes(1); // nested control still isolated from the container
    });
});
