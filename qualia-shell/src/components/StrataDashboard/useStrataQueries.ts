/**
 * useStrataQueries.ts — React Query hooks for Strata Dashboard modules.
 *
 * Replaces the manual useState + useCallback + useEffect pattern used in every module.
 * Each hook wraps strataGet/strataPost with proper caching, stale-time, and automatic refetch.
 *
 * Usage:
 *   const { data: properties, isLoading, error, refetch } = useProperties();
 *   const invalidate = useStrataInvalidate();
 *   // After a mutation: invalidate('properties');
 */

import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { strataGet, strataPost, strataPut, strataDelete, strataGetPaginated } from './strataApi';
import type { Property, Unit, EntityProfile, Workitem } from './strataTypes';

// ── Query Key Factory ──────────────────────────────────────────
// Hierarchical keys enable precise invalidation:
//   strataKeys.all        → invalidate EVERYTHING
//   strataKeys.properties → invalidate all property queries
//   strataKeys.units(id)  → invalidate units for one property

export const strataKeys = {
    all: ['strata'] as const,

    // Properties
    properties: () => [...strataKeys.all, 'properties'] as const,
    property: (id: string) => [...strataKeys.properties(), id] as const,

    // Units (scoped to property)
    units: (propertyId?: string) => propertyId
        ? [...strataKeys.all, 'units', propertyId] as const
        : [...strataKeys.all, 'units'] as const,

    // Entity profiles (tenants, owners, vendors)
    entities: (type?: string) => type
        ? [...strataKeys.all, 'entities', type] as const
        : [...strataKeys.all, 'entities'] as const,
    entity: (id: string) => [...strataKeys.all, 'entity', id] as const,

    // Workitems (scoped to property or global)
    workitems: (propertyId?: string) => propertyId
        ? [...strataKeys.all, 'workitems', propertyId] as const
        : [...strataKeys.all, 'workitems'] as const,

    // Property linked data (work orders, legal, compliance, etc.)
    linkedData: (propertyId: string) => [...strataKeys.all, 'linked', propertyId] as const,

    // Property modules config
    moduleConfig: (propertyId: string) => [...strataKeys.all, 'modules', propertyId] as const,

    // Reports
    reports: (propertyId?: string) => propertyId
        ? [...strataKeys.all, 'reports', propertyId] as const
        : [...strataKeys.all, 'reports'] as const,

    // Maintenance
    maintenance: (propertyId?: string) => propertyId
        ? [...strataKeys.all, 'maintenance', propertyId] as const
        : [...strataKeys.all, 'maintenance'] as const,

    // Leases
    leases: () => [...strataKeys.all, 'leases'] as const,

    // Accounting
    accounting: () => [...strataKeys.all, 'accounting'] as const,

    // Calendar
    calendar: () => [...strataKeys.all, 'calendar'] as const,

    // Audit
    audit: () => [...strataKeys.all, 'audit'] as const,

    // Communication log
    communications: () => [...strataKeys.all, 'communications'] as const,

    // Incidents
    incidents: (propertyId?: string) => propertyId
        ? [...strataKeys.all, 'incidents', propertyId] as const
        : [...strataKeys.all, 'incidents'] as const,

    // Compliance
    compliance: () => [...strataKeys.all, 'compliance'] as const,

    // Vehicles
    vehicles: (propertyId: string) => [...strataKeys.all, 'vehicles', propertyId] as const,

    // Insurance
    insurance: (propertyId: string) => [...strataKeys.all, 'insurance', propertyId] as const,

    // Utilities
    utilities: (propertyId: string) => [...strataKeys.all, 'utilities', propertyId] as const,

    // Status check
    statusCheck: () => [...strataKeys.all, 'status-check'] as const,
};


// ── Read Hooks ──────────────────────────────────────────────────

/** Fetch all properties */
export function useProperties(enabled = true) {
    return useQuery({
        queryKey: strataKeys.properties(),
        queryFn: () => strataGet<Property[]>('/properties'),
        enabled,
        staleTime: 60_000,
    });
}

/** Fetch units for a specific property */
export function useUnits(propertyId: string | undefined) {
    return useQuery({
        queryKey: strataKeys.units(propertyId),
        queryFn: () => strataGet<Unit[]>('/units', { property_id: propertyId! }),
        enabled: !!propertyId,
        staleTime: 60_000,
    });
}

/** Fetch entity profiles by type */
export function useEntities(type?: string, enabled = true) {
    return useQuery({
        queryKey: strataKeys.entities(type),
        queryFn: () => strataGet<EntityProfile[]>('/entities', type ? { type } : undefined),
        enabled,
        staleTime: 60_000,
    });
}

/** Fetch workitems — optionally scoped to property */
export function useWorkitems(propertyId?: string, enabled = true) {
    return useQuery({
        queryKey: strataKeys.workitems(propertyId),
        queryFn: () => strataGet<Workitem[]>(
            '/workitems',
            propertyId ? { property_id: propertyId } : undefined
        ),
        enabled,
        staleTime: 30_000, // Workitems change more frequently
    });
}

/** Fetch linked data for a property (workitems, legal, compliance, incidents) */
export function useLinkedData(propertyId: string | undefined) {
    return useQuery({
        queryKey: strataKeys.linkedData(propertyId!),
        queryFn: () => strataGet<any>(`/property-linked/${propertyId}`),
        enabled: !!propertyId,
        staleTime: 60_000,
    });
}

/** Fetch module config for a property */
export function useModuleConfig(propertyId: string | undefined) {
    return useQuery({
        queryKey: strataKeys.moduleConfig(propertyId!),
        queryFn: () => strataGet<any[]>('/property-modules', { property_id: propertyId! }),
        enabled: !!propertyId,
        staleTime: 120_000, // Config rarely changes
    });
}

/** Fetch leases */
export function useLeases(enabled = true) {
    return useQuery({
        queryKey: strataKeys.leases(),
        queryFn: () => strataGet<any[]>('/leases'),
        enabled,
        staleTime: 60_000,
    });
}

/** Fetch calendar events */
export function useCalendarEvents(enabled = true) {
    return useQuery({
        queryKey: strataKeys.calendar(),
        queryFn: () => strataGet<any[]>('/calendar'),
        enabled,
        staleTime: 120_000,
    });
}

/** Fetch audit log */
export function useAuditLog(enabled = true) {
    return useQuery({
        queryKey: strataKeys.audit(),
        queryFn: () => strataGet<any[]>('/audit'),
        enabled,
        staleTime: 30_000,
    });
}

/** Fetch communication log */
export function useCommunications(enabled = true) {
    return useQuery({
        queryKey: strataKeys.communications(),
        queryFn: () => strataGet<any[]>('/communication-log'),
        enabled,
        staleTime: 30_000,
    });
}


// ── Mutation Hooks ──────────────────────────────────────────────

/** Create a property */
export function useCreateProperty() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (data: Partial<Property>) => strataPost<Property>('/properties', data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: strataKeys.properties() });
        },
    });
}

/** Update a property */
export function useUpdateProperty() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
            strataPut<Property>(`/properties/${id}`, data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: strataKeys.properties() });
        },
    });
}

/** Delete a property */
export function useDeleteProperty() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => strataDelete(`/properties/${id}`),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: strataKeys.properties() });
        },
    });
}

/** Create a workitem */
export function useCreateWorkitem() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (data: Partial<Workitem>) => strataPost<Workitem>('/workitems', data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: strataKeys.workitems() });
        },
    });
}

/** Update a workitem */
export function useUpdateWorkitem() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
            strataPut<Workitem>(`/workitems/${id}`, data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: strataKeys.workitems() });
        },
    });
}

/** Delete a workitem */
export function useDeleteWorkitem() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => strataDelete(`/workitems/${id}`),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: strataKeys.workitems() });
        },
    });
}

/** Create an entity profile */
export function useCreateEntity() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (data: Partial<EntityProfile>) => strataPost<EntityProfile>('/entities', data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: strataKeys.entities() });
        },
    });
}

/** Update an entity profile */
export function useUpdateEntity() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
            strataPut<EntityProfile>(`/entities/${id}`, data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: strataKeys.entities() });
        },
    });
}

/** Delete an entity profile */
export function useDeleteEntity() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => strataDelete(`/entities/${id}`),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: strataKeys.entities() });
        },
    });
}

/** Toggle a property module */
export function useToggleModule() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ propertyId, moduleKey, enabled }: { propertyId: string; moduleKey: string; enabled: boolean }) =>
            strataPut<any>('/property-modules', { propertyId, moduleKey, enabled }),
        onSuccess: (_data, vars) => {
            qc.invalidateQueries({ queryKey: strataKeys.moduleConfig(vars.propertyId) });
        },
    });
}


// ── Utility: Invalidation Helper ────────────────────────────────

type EntityType = 'properties' | 'units' | 'entities' | 'workitems' | 'leases'
    | 'calendar' | 'audit' | 'communications' | 'compliance' | 'all';

/**
 * Returns a function that invalidates queries by entity type.
 * Usage:
 *   const invalidate = useStrataInvalidate();
 *   invalidate('properties');       // refresh properties list
 *   invalidate('all');              // refresh everything
 */
export function useStrataInvalidate() {
    const qc = useQueryClient();
    return (type: EntityType, scopeId?: string) => {
        switch (type) {
            case 'properties': return qc.invalidateQueries({ queryKey: strataKeys.properties() });
            case 'units': return qc.invalidateQueries({ queryKey: strataKeys.units(scopeId) });
            case 'entities': return qc.invalidateQueries({ queryKey: strataKeys.entities(scopeId) });
            case 'workitems': return qc.invalidateQueries({ queryKey: strataKeys.workitems(scopeId) });
            case 'leases': return qc.invalidateQueries({ queryKey: strataKeys.leases() });
            case 'calendar': return qc.invalidateQueries({ queryKey: strataKeys.calendar() });
            case 'audit': return qc.invalidateQueries({ queryKey: strataKeys.audit() });
            case 'communications': return qc.invalidateQueries({ queryKey: strataKeys.communications() });
            case 'compliance': return qc.invalidateQueries({ queryKey: strataKeys.compliance() });
            case 'all': return qc.invalidateQueries({ queryKey: strataKeys.all });
        }
    };
}
