/**
 * SystemUpdateSection — managed-deployment mode (Cloud Run): the card must
 * explain that updates ship via deploys and must NOT offer git-based
 * Check/Update buttons (they produced "git fetch failed: spawn-error" in prod).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import SystemUpdateSection from '../components/ControlPanel/SystemUpdateSection';

beforeEach(() => { localStorage.clear(); });

describe('SystemUpdateSection', () => {
    it('managed:true → shows frontend version + backend revision, no Check/Update buttons', async () => {
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
            json: () => Promise.resolve({ success: true, managed: true, reason: 'Managed deployment — Cloud Run.', service: 'dwellium-backend', revision: 'dwellium-backend-00047-xzz', backendVersion: '1.0.0' }),
        } as Response)));
        render(<SystemUpdateSection />);
        await waitFor(() => expect(screen.getByText('Managed deployment')).toBeInTheDocument());
        expect(screen.getByText('dwellium-backend-00047-xzz')).toBeInTheDocument();
        expect(screen.getByText(/^v\d+\.\d+/)).toBeInTheDocument(); // frontend APP_VERSION
        expect(screen.queryByRole('button', { name: /Check for updates/ })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Update now/ })).not.toBeInTheDocument();
        expect(screen.getByText('Managed deployment — Cloud Run.')).toBeInTheDocument();
    });

    it('dev mode (git status) still renders the Check/Update buttons', async () => {
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
            json: () => Promise.resolve({ success: true, branch: 'main', sha: 'abc123', behind: 0, ahead: 0, dirty: false, progress: { state: 'idle', message: '', startedAt: null, finishedAt: null, exitCode: null } }),
        } as Response)));
        render(<SystemUpdateSection />);
        await waitFor(() => expect(screen.getByText('main')).toBeInTheDocument());
        expect(screen.getByRole('button', { name: /Check for updates/ })).toBeInTheDocument();
    });
});
