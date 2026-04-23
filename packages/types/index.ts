/**
 * @qualia/types — Shared Type Definitions
 *
 * Phase 6.3: Single source of truth for all entity types shared between
 * qualia-shell (frontend) and ai-dashboard369-file-manager (backend).
 *
 * Both packages import from this module via tsconfig path aliases:
 *   import { Property, Unit } from '@qualia/types';
 *
 * DO NOT duplicate these interfaces in frontend or backend code.
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
export type UserRole = 'god' | 'admin' | 'manager' | 'viewer' | 'tenant';

// ═══════════════════════════════════════════════════════════════
// Core Entity Interfaces
// ═══════════════════════════════════════════════════════════════

// ─── Task 1.3: Property schema — purchase history / late fee / maintenance / fixed assets ───
//
// Promotes AppFolio's Property Detail blocks out of the untyped
// `metadata: Record<string, any>` bag into typed shapes. Existing
// modules (PropertiesModule.tsx) continue to read legacy metadata.*
// values; the typed fields below are preferred when present and fall
// back to the untyped bag otherwise — same coexistence pattern used
// for vendor fields in Task 1.2.
//
// Source of truth: AppFolio_Screenshots/data/02_property_detail_128_buena_vista.json

export interface PurchaseHistory {
    purchaseDate: string;
    amount: number;
    seller: string | null;
    settlementAgent: string | null;
    parcel: string | null;
    notes: string | null;
}

export interface LateFeePolicy {
    effectiveOn: string | null;
    baseAmount: string | null;
    eligibleCharges: string | null;
    dailyAmountMonthlyMax: string | null;
    gracePeriod: string | null;
    graceBalance: string | null;
}

export interface MaintenanceConfig {
    maintenanceLimit: number | null;
    insuranceExpiration: string | null;
    homeWarranty: boolean;
    preAuthEntry: boolean;
    notes: string | null;
}

export interface FixedAsset {
    assetId: string;
    type: string;
    status: string;
    placedInService: string | null;
    warrantyExpiration: string | null;
    serialNumber: string | null;
}

export interface Property {
    id: string;
    name: string;
    address: string | null;
    type: string;
    unitCount: number;
    ownerId: string | null;
    status: PropertyStatus;
    metadata: Record<string, any>;
    city: string | null;
    state: string | null;
    zip: string | null;
    yearBuilt: number | null;
    marketValue: number | null;
    acquisitionDate: string | null;
    propertyManager: string | null;
    createdAt: string;
    updatedAt: string;
    // ─── Task 1.3 additions (all optional; backward compatible) ───
    purchaseHistory?: PurchaseHistory[];
    lateFeePolicy?: LateFeePolicy;
    maintenanceConfig?: MaintenanceConfig;
    fixedAssets?: FixedAsset[];
    parcelNumber?: string;
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

// ─── Task 1.1: Occupancy 1:N relations ──────────────────────────
//
// Models the AppFolio-style occupancy: one primary (financially
// responsible) tenant plus N other occupants in a single unit.
// All new EntityProfile fields below are optional to preserve
// backward compatibility with every seed and existing consumer.

export interface Occupancy {
    id: string;
    unitId: string | null;
    primaryTenantId: string;
    otherOccupantIds: string[];
    moveInDate: string | null;
    moveOutDate: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface EmergencyContact {
    name: string;
    relationship: string;
    phone: string;
    email: string | null;
}

export interface Animal {
    id: string;
    species: string;
    breed: string | null;
    name: string;
    weight: number | null;
    isServiceAnimal: boolean;
}

export interface Vehicle {
    id: string;
    make: string;
    model: string;
    year: number | null;
    color: string | null;
    licensePlate: string | null;
    state: string | null;
}

// ─── Task 1.2: Vendor 45-field / 10-block schema ────────────────
//
// Captures AppFolio's Federal Tax, Accounting Information, and
// Compliance blocks as first-class typed shapes on EntityProfile.
// Source of truth: AppFolio_Screenshots/data/10_vendor_detail_2story_roofing.json.
// All additions below are optional and additive — existing vendor
// seeds without these blocks continue to typecheck unchanged.

export type VendorPaymentMethod = 'Check' | 'ACH' | 'Zelle' | 'Wire' | 'Credit Card' | 'Other';

export interface VendorFederalTax {
    taxpayerName: string;
    w9Requested: boolean;
    taxIdMasked: string | null;
    taxFormAccountNumber: string | null;
    send1099: boolean;
}

export interface VendorAccountingInfo {
    checkConsolidation: string | null;
    checkStubBreakdown: string | null;
    holdPayments: boolean;
    emailECheckReceipt: boolean;
    paymentTerms: string | null;
    defaultCheckMemo: string | null;
    defaultGlAccount: string | null;
    workOrderAdjustmentPercent: number;
    discount: number | null;
    onlinePayablesEnabled: boolean;
    paymentType: VendorPaymentMethod;
    bankRoutingNumber: string | null;
    bankAccountNumber: string | null;
    savingsAccount: boolean;
}

export interface VendorCompliance {
    workersCompExpiration: string | null;
    generalLiabilityExpiration: string | null;
    epaCertificationExpiration: string | null;
    autoInsuranceExpiration: string | null;
    stateLicenseExpiration: string | null;
    contractExpiration: string | null;
    requestComplianceDocumentsCta: boolean;
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
    category: string | null;
    licenseNumber: string | null;
    licenseExpiry: string | null;
    ein: string | null;
    createdAt: string;
    updatedAt: string;
    // ─── Task 1.1 additions (all optional; backward compatible) ───
    occupancyId?: string | null;
    emergencyContacts?: EmergencyContact[];
    animals?: Animal[];
    vehicles?: Vehicle[];
    isPrimaryTenant?: boolean;
    // ─── Task 1.2 additions (all optional; backward compatible) ───
    // Legacy vendor compliance data historically lived loosely under
    // metadata (coiStatus / coiExpiry / w9OnFile / insuranceCarrier).
    // Those string-bag fields are retained on `metadata` for back-compat;
    // the canonical typed shape below supersedes them and is scheduled
    // to replace the metadata bag in the 2026-Q3 cleanup pass.
    vendorFederalTax?: VendorFederalTax;
    vendorAccountingInfo?: VendorAccountingInfo;
    vendorCompliance?: VendorCompliance;
    paymentMethod?: VendorPaymentMethod;
    send1099?: boolean;
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

export interface User {
    id: string;
    email: string;
    role: UserRole;
    name?: string;
    createdAt: string;
    updatedAt: string;
}

// ═══════════════════════════════════════════════════════════════
// Dashboard & Aggregation Types
// ═══════════════════════════════════════════════════════════════

export interface DashboardStats {
    totalProperties: number;
    totalUnits: number;
    occupiedUnits: number;
    occupancyRate: string;
    openWorkOrders: number;
}

// ═══════════════════════════════════════════════════════════════
// Convenience Aliases
// ═══════════════════════════════════════════════════════════════

/** Lightweight property reference for dropdowns / selectors */
export type PropertySummary = Pick<Property, 'id' | 'name'>;

// ═══════════════════════════════════════════════════════════════
// API Response Envelope Types
// ═══════════════════════════════════════════════════════════════

export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
    timestamp?: string;
}

export interface PaginatedResponse<T> {
    data: T[];
    pagination: {
        hasMore: boolean;
        nextCursor: string | null;
        limit: number;
    };
}

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

// ═══════════════════════════════════════════════════════════════
// Strata Module Navigation
// ═══════════════════════════════════════════════════════════════

export type StrataModule = 'overview' | 'manager-home' | 'calendar' | 'properties' | 'work-orders' | 'leasing' | 'residents' | 'vendors' | 'owners' | 'accounting' | 'maintenance' | 'reporting' | 'communication' | 'profiles' | 'corporate-review' | 'integrations' | 'tenant-portal' | 'forecast' | 'sentiment' | 'legal' | 'projects' | 'audit' | 'status-check' | 'visualization' | 'incidents' | 'compliance' | 'design-studio' | 'civil-engineering';
