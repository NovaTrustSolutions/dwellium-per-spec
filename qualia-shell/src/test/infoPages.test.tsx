import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CONTACT_EMAIL, HelpPage, PrivacyPage, TermsPage } from '../components/Legal/InfoPages';
import TenantLoginScreen from '../components/Auth/TenantLoginScreen';

vi.mock('../context/UserContext', () => ({
    useUser: () => ({ login: vi.fn() }),
}));

describe('public information pages', () => {
    it.each([
        ['Privacy', PrivacyPage],
        ['Terms of use', TermsPage],
        ['Help', HelpPage],
    ])('%s renders one h1, a main landmark and the contact address', (title, Page) => {
        const { container } = render(<Page />);
        expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument();
        expect(container.querySelectorAll('h1')).toHaveLength(1);
        expect(screen.getByRole('main')).toBeInTheDocument();
        expect(container.querySelector(`a[href="mailto:${CONTACT_EMAIL}"]`)).not.toBeNull();
    });

    it('makes no compliance or uptime claims the codebase cannot back up', () => {
        const { container } = render(<><PrivacyPage /><TermsPage /><HelpPage /></>);
        expect(container.textContent).not.toMatch(/SOC ?2|ISO ?27001|HIPAA|GDPR[- ]compliant|24\/7|99\.\d+ ?%/i);
    });

    it('resident footer links point at real pages, not "#"', () => {
        const { container } = render(<TenantLoginScreen />);
        const hrefs = [...container.querySelectorAll('.tenant-login__footer-links a')].map(a => a.getAttribute('href'));
        expect(hrefs).toEqual(['/privacy', '/terms', '/help']);
    });
});
