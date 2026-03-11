/**
 * Strata Types — Shared TypeScript interfaces for all Strata modules.
 * Mirrors backend Dwellium entity types.
 */

export interface Property {
    id: string;
    name: string;
    address: string;
    type: string;
    unitCount: number;
    ownerId: string | null;
    status: string;
    metadata: Record<string, any>;
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
    status: string; // vacant | occupied | maintenance | turn
    currentTenantId: string | null;
    leaseStart: string | null;
    leaseEnd: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface EntityProfile {
    id: string;
    entityType: string; // tenant | vendor | employee | owner | trust | llc | corporate
    name: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    metadata: Record<string, any>;
    propertyIds: string[];
    status: string;
    createdAt: string;
    updatedAt: string;
}

export interface Workitem {
    id: string;
    type: string; // task | work_order | lease | inspection | payment | recurring
    title: string;
    description: string;
    status: string; // open | in_progress | review | completed | cancelled
    priority: string; // critical | high | medium | low
    propertyId: string | null;
    unitId: string | null;
    assignedTo: string | null;
    createdBy: string | null;
    dueDate: string | null;
    domain: string;
    tags: string[];
    metadata: Record<string, any>;
    parentId: string | null;
    threadChannel: string;
    resolvedAt: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface Evidence {
    id: string;
    workitemId: string;
    type: string;
    fileId: string | null;
    description: string;
    metadata: Record<string, any>;
    createdBy: string | null;
    createdAt: string;
}

export interface Decision {
    id: string;
    workitemId: string;
    decisionType: string;
    rationale: string;
    impactAnalysis: string;
    decidedBy: string | null;
    aiRecommendation: string | null;
    createdAt: string;
}

export interface Report {
    id: string;
    reportType: string;
    propertyId: string | null;
    period: string;
    data: Record<string, any>;
    generatedBy: string | null;
    createdAt: string;
}

export interface Communication {
    id: string;
    workitemId: string | null;
    channel: string;
    direction: string;
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

export type StrataModule = 'overview' | 'manager-home' | 'calendar' | 'properties' | 'work-orders' | 'leasing' | 'residents' | 'vendors' | 'owners' | 'accounting' | 'maintenance' | 'reporting' | 'communication' | 'profiles' | 'corporate-review' | 'integrations' | 'tenant-portal' | 'forecast' | 'sentiment' | 'legal' | 'projects' | 'audit' | 'status-check' | 'visualization' | 'incidents' | 'compliance' | 'design-studio' | 'civil-engineering';
