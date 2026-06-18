import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import ClaudePlaybook from '../components/Shell/ClaudePlaybook';

afterEach(cleanup);

const PHRASES = [
    'Launch sub agents',
    'Write me an implementation spec',
    'Interview me',
    'Verify before you build',
    'Based on this conversation build me a skill',
    'Automate this',
];

describe('ClaudePlaybook mini map', () => {
    it('renders all six phrase nodes', () => {
        render(<ClaudePlaybook onClose={() => {}} />);
        for (const p of PHRASES) {
            expect(screen.getByRole('button', { name: p })).toBeTruthy();
        }
    });

    it('starts with a hint and no explanation', () => {
        render(<ClaudePlaybook onClose={() => {}} />);
        expect(screen.getByText(/click a node to see what it does/i)).toBeTruthy();
    });

    it('reveals only the clicked node\'s explanation', () => {
        render(<ClaudePlaybook onClose={() => {}} />);
        fireEvent.click(screen.getByRole('button', { name: 'Interview me' }));
        const detail = screen.getByTestId('claude-playbook-detail');
        expect(detail.textContent).toMatch(/has Claude ask you the questions/i);
        // a different node's explanation must not be showing
        expect(detail.textContent).not.toMatch(/operational debt/i);

        fireEvent.click(screen.getByRole('button', { name: 'Automate this' }));
        expect(screen.getByTestId('claude-playbook-detail').textContent).toMatch(/operational debt/i);
    });

    it('closes via the ✕ button and via the backdrop', () => {
        const onClose = vi.fn();
        render(<ClaudePlaybook onClose={onClose} />);
        fireEvent.click(screen.getByLabelText('Close Claude playbook'));
        expect(onClose).toHaveBeenCalledTimes(1);
        fireEvent.click(screen.getByTestId('claude-playbook')); // backdrop
        expect(onClose).toHaveBeenCalledTimes(2);
    });

    it('does not close when the panel itself is clicked', () => {
        const onClose = vi.fn();
        render(<ClaudePlaybook onClose={onClose} />);
        fireEvent.click(screen.getByRole('button', { name: 'Launch sub agents' }));
        expect(onClose).not.toHaveBeenCalled();
    });
});
