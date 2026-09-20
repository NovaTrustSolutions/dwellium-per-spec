/**
 * templateAutofill — pure mapping from a Dwellium record (Property / EntityProfile)
 * to `{{key}}` template variable values.
 *
 * No React, no browser globals. The caller applies only the returned keys that
 * are actually present in the active template, and never overwrites an existing
 * value with an empty one (this module never emits an empty value to begin with).
 */
import type { Property, EntityProfile } from '../StrataDashboard/strataTypes';

export type AutofillKind = 'property' | 'tenant' | 'owner' | 'vendor';

function setIfNonEmpty(out: Record<string, string>, key: string, value: string | null | undefined): void {
    if (value != null && value !== '') out[key] = value;
}

export function recordToValues(kind: AutofillKind, record: Property | EntityProfile): Record<string, string> {
    const out: Record<string, string> = {};
    if (kind === 'property') {
        const p = record as Property;
        const addressParts = [p.address, p.city, p.state, p.zip].filter(
            (part): part is string => !!part
        );
        setIfNonEmpty(out, 'property_name', p.name);
        setIfNonEmpty(out, 'property_address', addressParts.join(', '));
        setIfNonEmpty(out, 'property_city', p.city);
        setIfNonEmpty(out, 'property_state', p.state);
        setIfNonEmpty(out, 'property_zip', p.zip);
        return out;
    }

    const e = record as EntityProfile;
    setIfNonEmpty(out, `${kind}_name`, e.name);
    setIfNonEmpty(out, `${kind}_email`, e.email);
    setIfNonEmpty(out, `${kind}_phone`, e.phone);
    if (kind === 'tenant') setIfNonEmpty(out, 'client_name', e.name);
    return out;
}

export function recordLabel(kind: AutofillKind, record: Property | EntityProfile): string {
    if (kind === 'property') {
        const p = record as Property;
        return p.address ? `${p.name} — ${p.address}` : p.name;
    }
    const e = record as EntityProfile;
    return e.email ? `${e.name} (${e.email})` : e.name;
}
