/**
 * templateAutofill — Property/EntityProfile → template variable mapping (plan 063 Cluster A).
 */
import { describe, it, expect } from 'vitest';
import { recordToValues, recordLabel } from '../components/DocViewer/templateAutofill';
import type { Property, EntityProfile } from '../components/StrataDashboard/strataTypes';

function property(over: Partial<Property> = {}): Property {
    return {
        id: 'prop-1',
        name: 'Fixture Property',
        address: '1 Fixture Way',
        type: 'residential',
        unitCount: 4,
        ownerId: 'owner-1',
        status: 'active',
        metadata: {},
        city: 'Testville',
        state: 'TS',
        zip: '00000',
        yearBuilt: null,
        marketValue: null,
        acquisitionDate: null,
        propertyManager: null,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        ...over,
    };
}

function entity(over: Partial<EntityProfile> = {}): EntityProfile {
    return {
        id: 'entity-1',
        entityType: 'tenant',
        name: 'Fixture Person',
        email: 'fixture@example.com',
        phone: '555-0100',
        address: null,
        metadata: {},
        propertyIds: [],
        status: 'active',
        category: null,
        licenseNumber: null,
        licenseExpiry: null,
        ein: null,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        ...over,
    };
}

describe('recordToValues — property', () => {
    it('maps a fully-populated property', () => {
        expect(recordToValues('property', property())).toEqual({
            property_name: 'Fixture Property',
            property_address: '1 Fixture Way, Testville, TS, 00000',
            property_city: 'Testville',
            property_state: 'TS',
            property_zip: '00000',
        });
    });

    it('omits empty fields instead of emitting an empty value', () => {
        const values = recordToValues(
            'property',
            property({ address: null, city: null, state: null, zip: null })
        );
        expect(values).toEqual({ property_name: 'Fixture Property' });
        expect(values.property_address).toBeUndefined();
    });

    it('joins only the address parts that exist', () => {
        const values = recordToValues('property', property({ city: null }));
        expect(values.property_address).toBe('1 Fixture Way, TS, 00000');
    });
});

describe('recordToValues — entities', () => {
    it('maps a tenant, including client_name', () => {
        expect(recordToValues('tenant', entity())).toEqual({
            tenant_name: 'Fixture Person',
            tenant_email: 'fixture@example.com',
            tenant_phone: '555-0100',
            client_name: 'Fixture Person',
        });
    });

    it('maps an owner without client_name', () => {
        expect(recordToValues('owner', entity({ entityType: 'owner' }))).toEqual({
            owner_name: 'Fixture Person',
            owner_email: 'fixture@example.com',
            owner_phone: '555-0100',
        });
    });

    it('maps a vendor without client_name', () => {
        expect(recordToValues('vendor', entity({ entityType: 'vendor' }))).toEqual({
            vendor_name: 'Fixture Person',
            vendor_email: 'fixture@example.com',
            vendor_phone: '555-0100',
        });
    });

    it('omits empty email/phone', () => {
        const values = recordToValues('vendor', entity({ email: null, phone: '' }));
        expect(values).toEqual({ vendor_name: 'Fixture Person' });
    });
});

describe('recordLabel', () => {
    it('labels a property with its address when present', () => {
        expect(recordLabel('property', property())).toBe('Fixture Property — 1 Fixture Way');
    });

    it('labels a property by name alone when it has no address', () => {
        expect(recordLabel('property', property({ address: null }))).toBe('Fixture Property');
    });

    it('labels an entity with its email when present', () => {
        expect(recordLabel('tenant', entity())).toBe('Fixture Person (fixture@example.com)');
    });

    it('labels an entity by name alone when it has no email', () => {
        expect(recordLabel('tenant', entity({ email: null }))).toBe('Fixture Person');
    });
});
