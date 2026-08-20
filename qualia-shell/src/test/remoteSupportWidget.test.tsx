/**
 * Remote Support widget (plan 047 phase 2 — RustDesk launcher).
 *
 * parseRustdeskRelay handles the `host:port,key` env shape; unset env →
 * community-relay note (needs-setup in the Tools hub); set → copyable
 * ID/relay-server + key rows. Download links point at the stock (AGPL,
 * unmodified) clients on github.com/rustdesk/rustdesk.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import RemoteSupport, { parseRustdeskRelay } from '../components/RemoteSupport/RemoteSupport';
import { WIDGET_REGISTRY } from '../registry/widgetRegistry';

afterEach(() => vi.unstubAllGlobals());

describe('parseRustdeskRelay', () => {
    it('null on unset/blank; host:port alone; host:port,key with trimming', () => {
        expect(parseRustdeskRelay(undefined)).toBeNull();
        expect(parseRustdeskRelay('   ')).toBeNull();
        expect(parseRustdeskRelay('remote.example.com:21116')).toEqual({ server: 'remote.example.com:21116' });
        expect(parseRustdeskRelay(' remote.example.com:21116 , AAAAC3Nz ')).toEqual({ server: 'remote.example.com:21116', key: 'AAAAC3Nz' });
    });
});

describe('RemoteSupport widget', () => {
    it('is registered as "remote-support" with the plan-047 icon', () => {
        expect(WIDGET_REGISTRY['remote-support']).toBeDefined();
        expect(WIDGET_REGISTRY['remote-support'].icon).toBe('monitor');
    });

    it('renders client download links and the community-relay note when the env is unset', () => {
        render(<RemoteSupport env={{}} />);
        for (const name of [/macOS \(Apple Silicon\)/, /macOS \(Intel\)/, /Windows \(64-bit\)/]) {
            const link = screen.getByRole('link', { name });
            expect(link.getAttribute('href')).toMatch(/^https:\/\/github\.com\/rustdesk\/rustdesk\/releases\/download\//);
        }
        expect(document.querySelector('[data-state="community-relay"]')).not.toBeNull();
        expect(screen.queryByRole('button', { name: 'Copy server address' })).toBeNull();
    });

    it('renders copyable server + key rows when VITE_RUSTDESK_RELAY is set', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
        render(<RemoteSupport env={{ VITE_RUSTDESK_RELAY: 'remote.example.com:21116,AAAAC3Nz' }} />);
        expect(screen.getByText('remote.example.com:21116')).toBeInTheDocument();
        expect(screen.getByText('AAAAC3Nz')).toBeInTheDocument();
        expect(document.querySelector('[data-state="community-relay"]')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Copy server address' }));
        await waitFor(() => expect(writeText).toHaveBeenCalledWith('remote.example.com:21116'));
        fireEvent.click(screen.getByRole('button', { name: 'Copy relay key' }));
        await waitFor(() => expect(writeText).toHaveBeenCalledWith('AAAAC3Nz'));
    });
});
