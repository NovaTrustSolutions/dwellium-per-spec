/**
 * Strata Types — @canonical Single Source of Truth
 *
 * Every frontend module MUST import entity types from this file.
 * These interfaces mirror the backend dwelliumStore.ts types exactly.
 * Do NOT re-declare these types inline in components.
 */

// ═══════════════════════════════════════════════════════════════
// Constrained Union Types (match backend CHECK constraints)
// ═══════════════════════════════════════════════════════════════

export type PropertyStatus = 'active' | 'inactive' | 'onboarding' | 'archived';
export type UnitStatus = 'vacant' | 'occupied' | 'maintenance' | 'turn' | 'notice';
export type EntityType = 'tenant' | 'vendor' | 'employee' | 'owner' | 'trust' | 'llc' | 'corporate';
export type EntityStatus = 'active' | 'inactive' | 'pending' | 'archived';
export type WorkitemType = 'task' | 'work_order' | 'lease' | 'inspection' | 'payment' | 'recurring' | 'notice';
export type WorkitemStatus = 'open' | 'in_progress' | 'review' | 'completed' | 'cancelled' | 'on_hold' | 'pending' | 'resolved' | 'tenant_signoff';
export type WorkitemPriority = 'critical' | 'high' | 'medium' | 'low';
export type WorkitemDomain = 'maintenance' | 'leasing' | 'accounting' | 'compliance' | 'hr' | 'legal' | 'operations';
export type ThreadChannel = 'corporate' | 'management' | 'tenant' | 'combined';
export type EvidenceType = 'document' | 'photo' | 'email' | 'call_log' | 'receipt' | 'inspection_report' | 'video' | 'other';
export type DecisionType = 'approve' | 'caution' | 'decline';
export type ReportType = 'financial' | 'occupancy' | 'delinquency' | 'maintenance' | 'compliance' | 'portfolio';
export type ChannelType = 'email' | 'phone' | 'sms' | 'portal' | 'internal';
export type DirectionType = 'inbound' | 'outbound';

// ═══════════════════════════════════════════════════════════════
// Core Entity Interfaces
// ═══════════════════════════════════════════════════════════════

export interface Property {
    id: string;
    name: string;
    address: string | null;
    type: string;
    unitCount: number;
    ownerId: string | null;
    status: PropertyStatus;
    metadata: Record<string, any>;
    // Normalized metadata (v2 migration)
    city: string | null;
    state: string | null;
    zip: string | null;
    yearBuilt: number | null;
    marketValue: number | null;
    acquisitionDate: string | null;
    propertyManager: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface Unit {
    id: string;
    propertyId: string;
    unitNumber: string;
    bedrooms: number;
    bathrooms: number;
    sqFt: number;
    rentAmount: number;
    status: UnitStatus;
    currentTenantId: string | null;
    leaseStart: string | null;
    leaseEnd: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface EntityProfile {
    id: string;
    entityType: EntityType;
    name: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    metadata: Record<string, any>;
    propertyIds: string[];
    status: EntityStatus;
    // Normalized metadata (v2 migration)
    category: string | null;
    licenseNumber: string | null;
    licenseExpiry: string | null;
    ein: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface Workitem {
    id: string;
    type: WorkitemType;
    title: string;
    description: string;
    status: WorkitemStatus;
    priority: WorkitemPriority;
    propertyId: string | null;
    unitId: string | null;
    assignedTo: string | null;
    createdBy: string | null;
    dueDate: string | null;
    domain: WorkitemDomain;
    tags: string[];
    metadata: Record<string, any>;
    parentId: string | null;
    threadChannel: ThreadChannel;
    resolvedAt: string | null;
    trackingState: string;
    moduleKey: string | null;
    queueKey: string | null;
    deactivatedAt: string | null;
    reactivatedAt: string | null;
    recordType: string | null;
    recordId: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface Evidence {
    id: string;
    workitemId: string;
    type: EvidenceType;
    fileId: string | null;
    description: string;
    metadata: Record<string, any>;
    createdBy: string | null;
    createdAt: string;
}

export interface Decision {
    id: string;
    workitemId: string;
    decisionType: DecisionType;
    rationale: string;
    impactAnalysis: string;
    decidedBy: string | null;
    aiRecommendation: string | null;
    createdAt: string;
}

export interface Report {
    id: string;
    reportType: ReportType;
    propertyId: string | null;
    period: string;
    data: Record<string, any>;
    generatedBy: string | null;
    createdAt: string;
}

export interface Communication {
    id: string;
    workitemId: string | null;
    channel: ChannelType;
    direction: DirectionType;
    fromAddress: string;
    toAddress: string;
    subject: string;
    body: string;
    entityId: string | null;
    createdAt: string;
}

export interface DashboardStats {
    totalProperties: number;
    totalUnits: number;
    occupiedUnits: number;
    occupancyRate: string;
    openWorkOrders: number;
}

// ═══════════════════════════════════════════════════════════════
// Convenience Pick Aliases
// ═══════════════════════════════════════════════════════════════

/** Lightweight property reference for dropdowns / selectors */
export type PropertySummary = Pick<Property, 'id' | 'name'>;

export type StrataModule = 'overview' | 'manager-home' | 'calendar' | 'properties' | 'work-orders' | 'leasing' | 'residents' | 'vendors' | 'owners' | 'accounting' | 'maintenance' | 'reporting' | 'communication' | 'profiles' | 'corporate-review' | 'integrations' | 'tenant-portal' | 'forecast' | 'sentiment' | 'legal' | 'projects' | 'audit' | 'status-check' | 'visualization' | 'incidents' | 'compliance' | 'design-studio' | 'civil-engineering';

// ═══════════════════════════════════════════════════════════════
// Property Workspace Types
// ═══════════════════════════════════════════════════════════════

export interface ActivityEvent {
    id: string;
    type: 'workitem' | 'incident' | 'audit';
    action: string;
    title: string;
    status?: string;
    priority?: string;
    severity?: string;
    category?: string;
    domain?: string;
    actor: string;
    timestamp: string;
    entityType?: string;
    entityId: string;
    details?: Record<string, any>;
}

export interface PropertyReportCards {
    insurance: { totalPolicies: number; activePolicies: number; nearestExpiry: string | null; expiringSoon: number };
    compliance: { total: number; compliant: number; missing: number; expiring: number };
    vendors: { activeCount: number };
    leaseHealth: {
        totalUnits: number; occupied: number; vacant: number;
        expiringIn30: number; expiringIn60: number; expiringIn90: number; expired: number;
    };
    workOrders: { totalOpen: number; highPriority: number; byDomain: Record<string, number> };
    openIncidents: number;
}

// ═══════════════════════════════════════════════════════════════
// Resident Administration Types
// ═══════════════════════════════════════════════════════════════

export type ResidentStatus = 'onboarding' | 'active' | 'notice' | 'renewal' | 'former';

export interface ResidentHistoryEvent {
    id: string;
    type: 'communication' | 'workitem' | 'lease' | 'audit';
    action: string;
    title: string;
    timestamp: string;
    details?: Record<string, any>;
}

export type CommunicationTemplate = 'welcome' | 'lease_renewal' | 'rent_reminder' | 'notice_to_vacate' | 'maintenance_scheduled' | 'general';

export interface ResidentLinkage {
    tenantId: string;
    tenantName: string;
    health: 'valid' | 'warning' | 'broken';
    issues: string[];
    property: { id: string; name: string } | null;
    unit: { id: string; unitNumber: string; status: string } | null;
}


