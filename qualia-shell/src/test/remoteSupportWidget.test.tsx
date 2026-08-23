/**
 * Remote Support widget (plan 047 phase 2 launcher → plan 053 tabs).
 *
 * Connect tab: per-user address book with `rustdesk://connect/<ID>` deep
 * links (no embeddable web client exists — https://rustdesk.com/web/ sends
 * `x-frame-options: SAMEORIGIN`, verified 2026-08-23), Copy ID, honest relay
 * pill from GET /api/remote/relay-status (up / down / unconfigured /
 * backend-offline). Setup tab keeps the stock download links + relay config
 * copy rows gated on `VITE_RUSTDESK_RELAY`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import RemoteSupport, { parseRustdeskRelay } from '../components/RemoteSupport/RemoteSupport';
import { remoteMachinesUserIdHolder, resetRemoteMachines } from '../components/RemoteSupport/remoteMachinesStore';
import { WIDGET_REGISTRY } from '../registry/widgetRegistry';

const relayUp = { up: true, ports: { '21115': true, '21116': true, '21117': true }, checkedAt: '2026-08-23T00:00:00Z' };
const okResponse = (body: unknown, status = 200) => ({ ok: status < 300, status, json: async () => body });

beforeEach(() => {
    localStorage.clear();
    remoteMachinesUserIdHolder.current = null;
    resetRemoteMachines();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(relayUp)));
});
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
});

describe('Connect tab (default)', () => {
    it('renders the seeded example machines with disabled Connect and the relay-up pill', async () => {
        render(<RemoteSupport env={{}} />);
        expect(screen.getAllByText('example — replace with your machines')).toHaveLength(3);
        expect(screen.getByText('Woodland Parc leasing office PC')).toBeInTheDocument();
        expect(screen.getByText('Riverwood Club lobby kiosk')).toBeInTheDocument();
        // Seeds carry no ID → Connect renders as a disabled button, never a dead link.
        const connects = screen.getAllByRole('button', { name: 'Connect' });
        expect(connects).toHaveLength(3);
        connects.forEach(b => expect(b).toBeDisabled());
        await waitFor(() => expect(screen.getByText('Relay up')).toBeInTheDocument());
    });

    it('adds a machine and wires one-click Connect to the verified rustdesk:// deep link', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
        render(<RemoteSupport env={{}} />);
        fireEvent.click(screen.getByRole('button', { name: /Add machine/ }));
        fireEvent.change(screen.getByLabelText('Machine name'), { target: { value: 'Front desk PC' } });
        fireEvent.change(screen.getByLabelText('RustDesk ID'), { target: { value: '123 456 789' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save machine' }));

        const connect = screen.getByRole('link', { name: 'Connect' });
        expect(connect.getAttribute('href')).toBe('rustdesk://connect/123456789');
        expect(screen.getByRole('link', { name: 'Files' }).getAttribute('href')).toBe('rustdesk://file-transfer/123456789');

        fireEvent.click(screen.getByRole('button', { name: 'Copy ID for Front desk PC' }));
        await waitFor(() => expect(writeText).toHaveBeenCalledWith('123 456 789'));
    });

    it('removes a machine via its row button (UI-initiated only)', () => {
        render(<RemoteSupport env={{}} />);
        fireEvent.click(screen.getByRole('button', { name: 'Remove Riverwood Club lobby kiosk' }));
        expect(screen.queryByText('Riverwood Club lobby kiosk')).toBeNull();
        expect(screen.getAllByText('example — replace with your machines')).toHaveLength(2);
    });

    it('edits a machine inline', () => {
        render(<RemoteSupport env={{}} />);
        fireEvent.click(screen.getByRole('button', { name: 'Edit Woodland Parc leasing office PC' }));
        fireEvent.change(screen.getByLabelText('RustDesk ID'), { target: { value: '555666777' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save machine' }));
        const links = screen.getAllByRole('link', { name: 'Connect' });
        expect(links[0].getAttribute('href')).toBe('rustdesk://connect/555666777');
        // Editing replaced the placeholder → its example badge is gone.
        expect(screen.getAllByText('example — replace with your machines')).toHaveLength(2);
    });

    it('shows the honest unconfigured state on backend 503 needsSetup', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse({ success: false, needsSetup: true }, 503)));
        render(<RemoteSupport env={{}} />);
        await waitFor(() => expect(screen.getByText('Relay not configured')).toBeInTheDocument());
        expect(document.querySelector('[data-state="relay-unconfigured"]')?.textContent).toMatch(/RUSTDESK_RELAY_HOST/);
    });

    it('shows Relay down when the probe reports ports closed, and Backend offline when fetch fails', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse({ up: false, ports: { '21116': false, '21117': false }, checkedAt: 'x' })));
        const { unmount } = render(<RemoteSupport env={{}} />);
        await waitFor(() => expect(screen.getByText('Relay down')).toBeInTheDocument());
        unmount();

        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network')));
        render(<RemoteSupport env={{}} />);
        await waitFor(() => expect(screen.getByText('Backend offline')).toBeInTheDocument());
        expect(document.querySelector('[data-state="backend-offline"]')).not.toBeNull();
    });

    it('imports machines from a JSON file (merge-only) and reports the count', async () => {
        render(<RemoteSupport env={{}} />);
        const payload = [{ id: 'imp-1', name: 'Imported kiosk', rustdeskId: '999888777', notes: '', tags: ['Kiosk'], createdAt: 1, updatedAt: 1 }];
        const file = new File([JSON.stringify(payload)], 'machines.json', { type: 'application/json' });
        fireEvent.change(screen.getByLabelText('Import machines JSON'), { target: { files: [file] } });
        await waitFor(() => expect(screen.getByText('Imported 1 machine (merged by id — nothing removed).')).toBeInTheDocument());
        expect(screen.getByText('Imported kiosk')).toBeInTheDocument();
        expect(screen.getByText('Woodland Parc leasing office PC')).toBeInTheDocument(); // seeds survived
    });
});

describe('Setup tab', () => {
    it('renders client download links and the community-relay note when the env is unset', () => {
        render(<RemoteSupport env={{}} />);
        fireEvent.click(screen.getByRole('tab', { name: 'Setup' }));
        for (const name of [/macOS \(Apple Silicon\)/, /macOS \(Intel\)/, /Windows \(64-bit\)/, /Linux \(\.deb, x86_64\)/, /Android \(APK\)/]) {
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
        fireEvent.click(screen.getByRole('tab', { name: 'Setup' }));
        expect(screen.getByText('remote.example.com:21116')).toBeInTheDocument();
        expect(screen.getByText('AAAAC3Nz')).toBeInTheDocument();
        expect(document.querySelector('[data-state="community-relay"]')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Copy server address' }));
        await waitFor(() => expect(writeText).toHaveBeenCalledWith('remote.example.com:21116'));
        fireEvent.click(screen.getByRole('button', { name: 'Copy relay key' }));
        await waitFor(() => expect(writeText).toHaveBeenCalledWith('AAAAC3Nz'));
    });
});
