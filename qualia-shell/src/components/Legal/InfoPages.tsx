/**
 * Public Privacy / Terms / Help pages (no auth, no providers, no browser
 * globals — safe to server-render). Every factual statement here describes
 * behaviour that exists in this codebase; keep it that way when editing:
 *  - Sentry replay masking        → src/services/sentry.ts
 *  - API keys encrypted pre-sync  → src/utils/integrationsCrypto.ts
 *  - AI calls go browser → provider → src/lib/llmClient.ts
 *  - no cookies set by app code   → `git grep document.cookie src` is empty
 */
import type { ReactNode } from 'react';
import './InfoPages.css';

export const CONTACT_EMAIL = 'andy@dwellium.com';
export const LAST_UPDATED = '17 September 2026';

const PAGES = [
    { href: '/privacy', label: 'Privacy' },
    { href: '/terms', label: 'Terms' },
    { href: '/help', label: 'Help' },
] as const;

function Contact() {
    return <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;
}

function InfoShell({ title, current, children }: { title: string; current: string; children: ReactNode }) {
    return (
        <div className="info-page">
            <a className="info-page__skip" href="#info-main">Skip to content</a>
            <header className="info-page__header">
                <a className="info-page__brand" href="/">Dwellium</a>
                <nav aria-label="Information pages">
                    <ul className="info-page__nav">
                        {PAGES.map(p => (
                            <li key={p.href}>
                                <a href={p.href} aria-current={p.href === current ? 'page' : undefined}>{p.label}</a>
                            </li>
                        ))}
                    </ul>
                </nav>
            </header>
            <main id="info-main" className="info-page__main">
                <h1>{title}</h1>
                {children}
            </main>
            <footer className="info-page__footer">
                <a href="/">← Back to sign in</a>
            </footer>
        </div>
    );
}

export function PrivacyPage() {
    return (
        <InfoShell title="Privacy" current="/privacy">
            <p className="info-page__meta">Last updated: {LAST_UPDATED}</p>
            <p>
                This page explains what information Dwellium handles, why, and the choices you have.
                Questions or requests: <Contact />.
            </p>

            <h2>Who this covers</h2>
            <p>
                Dwellium is property-management software. It is used by property-management staff, and by
                residents through the Resident Portal. Information about residents is entered by, or at the
                direction of, the property manager who uses Dwellium. If you are a resident, your property
                manager is the best first contact for questions about your information.
            </p>

            <h2>Information Dwellium handles</h2>
            <ul>
                <li><strong>Account details</strong> — name, email address and role. If Google sign-in is used, Google provides your name and email address.</li>
                <li><strong>Property-management records</strong> entered by users — for example properties, residents, leases, maintenance requests, vendors, owners and accounting entries — and files that users upload.</li>
                <li><strong>Connected accounts</strong> — if a user connects Gmail or Google Calendar, Dwellium accesses that account only with the permission granted on Google’s consent screen, to show mail and events inside Dwellium. Access can be removed in Dwellium or in the Google account’s security settings.</li>
                <li><strong>Settings</strong> — workspace layout, theme and similar preferences saved to the account.</li>
                <li><strong>API keys you add</strong> for AI or other integrations are encrypted in your browser before they are saved to your account.</li>
                <li><strong>Technical information</strong> — our hosting providers process network information such as IP address in order to deliver the service. When error monitoring is enabled, error reports are sent to Sentry; any session replay attached to a report masks all text and form inputs and blocks images and media.</li>
            </ul>

            <h2>Browser storage</h2>
            <p>
                Dwellium’s own code does not set cookies. It uses your browser’s local storage to keep you
                signed in and to remember preferences such as theme and layout. If you use Google sign-in,
                Google may set its own cookies.
            </p>

            <h2>AI features</h2>
            <p>
                When you use an AI feature with your own API key, the text you submit is sent from your
                browser directly to the provider you selected — OpenAI, Anthropic, Google, OpenRouter, or a
                local or custom endpoint you configured — and is handled under that provider’s terms and
                privacy policy.
            </p>

            <h2>How information is used and shared</h2>
            <p>
                Information is used to provide the service: signing you in, showing and saving your records,
                and diagnosing errors. Dwellium does not sell personal information and does not use it for
                advertising. Information is shared only with the service providers needed to run Dwellium
                (Netlify for website hosting, Google Cloud for the application server, Google for sign-in and
                connected accounts, and Sentry for error monitoring), with the AI provider you choose as
                described above, or where the law requires it.
            </p>

            <h2>Keeping and deleting information</h2>
            <p>
                Information is kept while the account is in use. Users can delete records they created inside
                Dwellium. To close an account, or to ask for a copy, a correction or deletion of your
                information, email <Contact />. Residents can also ask their property manager. Depending on
                where you live, you may have additional legal rights over your information; requests will be
                answered as the applicable law requires.
            </p>

            <h2>Security</h2>
            <p>
                Dwellium is served over HTTPS, API keys are encrypted before they are saved, and error
                replays are masked as described above. No system is perfectly secure; please use a strong,
                unique password and tell us promptly at <Contact /> if you believe your account has been
                misused.
            </p>

            <h2>Children</h2>
            <p>Dwellium is a business tool and is not intended for children.</p>

            <h2>Changes to this page</h2>
            <p>When this page changes, the date at the top changes with it.</p>
        </InfoShell>
    );
}

export function TermsPage() {
    return (
        <InfoShell title="Terms of use" current="/terms">
            <p className="info-page__meta">Last updated: {LAST_UPDATED}</p>
            <p>
                These terms apply when you use Dwellium, including the Resident Portal. By using Dwellium you
                agree to them. If you do not agree, please do not use the service. Questions: <Contact />.
            </p>

            <h2>Accounts</h2>
            <ul>
                <li>Accounts are provided by Dwellium or by the property manager you work with or rent from.</li>
                <li>Keep your sign-in details private and do not share an account. You are responsible for activity under your account.</li>
                <li>Tell us promptly at <Contact /> if you think someone else has used your account.</li>
            </ul>

            <h2>Acceptable use</h2>
            <p>You agree not to:</p>
            <ul>
                <li>access information or accounts you are not authorised to access;</li>
                <li>interfere with, probe or overload the service, or try to bypass its security;</li>
                <li>upload malware, or content that is unlawful or that you have no right to share;</li>
                <li>use Dwellium to break the law, including housing, privacy and consumer-protection laws.</li>
            </ul>

            <h2>Your content</h2>
            <p>
                You keep ownership of the records and files you put into Dwellium. You give Dwellium
                permission to store, process and display that content only as needed to provide the service
                to you. You are responsible for having the right to enter the information you add, including
                information about other people.
            </p>

            <h2>AI features and connected services</h2>
            <p>
                AI features send the text you submit to the AI provider you selected, under that provider’s
                terms, and any usage charges on your own API key are yours. AI output can be wrong or
                incomplete — check it before relying on it. Services you connect, such as Google, are
                governed by their own terms.
            </p>

            <h2>Not professional advice</h2>
            <p>
                Dwellium provides tools for organising property-management work. Nothing in it, including AI
                output, legal snippets, or accounting and compliance views, is legal, tax, financial or other
                professional advice.
            </p>

            <h2>Availability and changes</h2>
            <p>
                Dwellium is provided “as is” and “as available”. Features may change, and the service may be
                interrupted for maintenance or for reasons outside our control. Keep your own copies of
                anything you cannot afford to lose.
            </p>

            <h2>Liability</h2>
            <p>
                To the fullest extent the law allows, Dwellium is not liable for indirect, incidental or
                consequential losses, or for loss of data, profits or business, arising from use of the
                service. Nothing in these terms limits liability that cannot be limited by law.
            </p>

            <h2>Ending use</h2>
            <p>
                You may stop using Dwellium at any time. Access may be suspended or ended if these terms are
                broken or if continuing would create a legal or security risk.
            </p>

            <h2>Changes to these terms</h2>
            <p>
                When these terms change, the date at the top changes with them. Continuing to use Dwellium
                after a change means you accept the updated terms.
            </p>
        </InfoShell>
    );
}

export function HelpPage() {
    return (
        <InfoShell title="Help" current="/help">
            <h2>Signing in — staff</h2>
            <ol>
                <li>On the first screen choose <strong>Sign in</strong>.</li>
                <li>Enter the access password, then <strong>Continue</strong>.</li>
                <li>Enter your email and password, then <strong>Sign in</strong>.</li>
            </ol>

            <h2>Signing in — residents</h2>
            <ol>
                <li>On the first screen choose <strong>Resident? Sign in here</strong>.</li>
                <li>Enter the email address and password your property manager set up for you, then <strong>Sign In</strong>.</li>
            </ol>

            <h2>Forgotten password or no account</h2>
            <ul>
                <li><strong>Staff:</strong> ask your administrator to set or reset your password in Control Panel → Accounts.</li>
                <li><strong>Residents:</strong> contact your property manager, who can set up or reset your access.</li>
                <li>Still stuck? Email <Contact />.</li>
            </ul>

            <h2>Common messages</h2>
            <dl>
                <dt>“Incorrect access password.” / “Incorrect email or password.”</dt>
                <dd>Check for typing mistakes and that Caps Lock is off, then try again. If it keeps happening, use the steps above to have your password reset.</dd>
                <dt>“Password not set yet”</dt>
                <dd>Your account exists but has no password. Ask your administrator to set one in Control Panel → Accounts.</dd>
                <dt>“Can’t reach the server.”</dt>
                <dd>Check your internet connection and choose <strong>Retry server sign-in</strong>. If you continue offline, nothing you save will sync to your account until you sign in again online.</dd>
            </dl>

            <h2>Accessibility</h2>
            <p>
                The sign-in screens work with a keyboard (Tab, Shift+Tab, Enter), and background motion is
                turned off when your device is set to reduce motion. If something is hard to use with your
                assistive technology, tell us at <Contact /> and describe the page and the problem.
            </p>

            <h2>Report a problem or a security concern</h2>
            <p>
                Email <Contact /> with what you were doing, what you expected, what happened instead, and
                the time it happened. Please do not include passwords.
            </p>
        </InfoShell>
    );
}
