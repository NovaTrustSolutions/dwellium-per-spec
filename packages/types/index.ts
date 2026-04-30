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
export type WorkitemStatus = 'open' | 'in_progress' | 'review' | 'completed' | 'cancelled' | 'on_hold' | 'pending' | 'resolved' | 'tenant_signoff' | 'pending_countersign';
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

// ─── Task 1.4: Workitem schema — resident availability / actions log / labor / POs ───
//
// HIGHEST-criticality extension in Phase 1: Workitem is the shared
// spine across MaintenanceModule, LegalModule, ProjectsModule,
// LeasingModule, and WorkOrdersModule. Every addition below is
// strictly optional — no existing field changes shape or nullability,
// no WorkitemType/Status/Priority/Domain union is widened. TSC on the
// full suite is the gate that guarantees no consumer breaks.
//
// Source of truth: AppFolio_Screenshots/data/08_work_order_detail_19511.json

export interface ResidentAvailability {
    date: string | null;
    dayOfWeek: string | null;
    timeWindows: string[];
    timezone: string | null;
}

export interface ActionLogEntry {
    ts: string;
    actor: string;
    event: string;
    detail: string | null;
}

export interface LaborEntry {
    id: string;
    technician: string;
    date: string | null;
    hours: number | null;
    rate: number | null;
    totalCost: number | null;
    description: string | null;
}

export interface PurchaseOrderLink {
    id: string;
    poNumber: string;
    vendor: string | null;
    amount: number | null;
    status: string;
    createdAt: string | null;
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
    // ─── Task 1.4 additions (all optional; backward compatible) ───
    residentAvailability?: ResidentAvailability;
    actionsLog?: ActionLogEntry[];
    laborEntries?: LaborEntry[];
    purchaseOrders?: PurchaseOrderLink[];
    workOrderNumber?: string;
    permissionToEnter?: boolean;
    ownerApproved?: boolean;
    trade?: string | null;
    vendorInstructions?: string | null;
    nextFollowUpDate?: string | null;
}

// ─── Task 1.5: Accounting — recurring charges + payment method enum ───
//
// New top-level collection for tenant-side recurring rent schedules.
// Distinct from Workitem by design — Task 1.4 just stabilized the
// 5-consumer Workitem surface with a cross-type contamination guard,
// so Task 1.5 adds a new type rather than re-extending that surface.
// The DoR's monthly_charges block models a rent schedule (recurring
// plan), not a one-shot charge event — different shape, different
// interface.
//
// Payment-method enum is parallel to (not derived from) VendorPaymentMethod:
// vendors and tenants are distinct domains that may legitimately diverge
// later (e.g., tenant-only "Portal", or "Wire" dropped for tenants).
//
// Source of truth: AppFolio_Screenshots/data/09_tenant_detail_willie_white.json

export type TenantPaymentMethod = 'Check' | 'ACH' | 'Zelle' | 'Wire' | 'Credit Card' | 'Other';
export type RecurringChargeStatus = 'PAID' | 'UNPAID' | 'PARTIAL' | 'SCHEDULED';

export interface RecurringCharge {
    id: string;
    occupancyId: string | null;
    tenantId: string | null;
    propertyId: string | null;
    unitId: string | null;
    account: string;
    amount: number;
    startDate: string | null;
    endDate: string | null;
    nextChargeDate: string | null;
    previousChargeDate: string | null;
    previousStatus: RecurringChargeStatus | null;
    paymentMethod?: TenantPaymentMethod;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
}

// ─── Task 2.3: ComplianceEngine — vendor matrix + Section-8 rollup ───
//
// Promotes the existing module-local `ComplianceItem` shape (declared
// inside ComplianceEngine.tsx) into a canonical type in the shared
// package. New enums below are additive — no existing union is
// narrowed, no existing field is renamed or retyped. Consumers of the
// old local interface continue to typecheck because `ComplianceRecord`
// is a superset of the prior shape (one added field: `source`, which
// was already present on AppFolio-derived rows as a provenance tag).
//
// Section8Rollup is a separate, committed-fixture aggregate over the
// 9 AHA inspection rows at Riverwood Club. Lineage is enforced at
// test time (see complianceEngine.test.ts it-block #4) — the fixture
// is authoritative, and the raw rows must agree with it.
//
// Source of truth: AppFolio_Screenshots/data/10_vendor_detail_2story_roofing.json
// (vendor compliance block) + AppFolio_Screenshots/data/07_insurance_compliance.json
// (Section-8 / AHA / HCV / LIHTC feature-flag context).

export type ComplianceEntityType = 'vendor' | 'inspection' | 'policy' | 'property';

export type ComplianceItemType =
    | 'workers_comp'
    | 'general_liability'
    | 'epa_certification'
    | 'auto_insurance'
    | 'state_license'
    | 'contract'
    | 'section_8_aha'
    | 'insurance'
    | 'coi'
    | 'w9'
    | 'llc_renewal'
    | 'pool_permit'
    | 'business_license'
    | 'tax_filing';

export type ComplianceStatus = 'valid' | 'tracked' | 'warning' | 'expired' | 'missing' | 'scheduled';

export interface ComplianceRecord {
    id: string;
    entityType: ComplianceEntityType;
    entityId: string;
    entityName: string | null;
    itemType: ComplianceItemType;
    label: string;
    status: ComplianceStatus;
    expirationDate: string | null;
    propertyId: string | null;
    documentFileId: string | null;
    carrier: string | null;
    policyNumber: string | null;
    coverageLimits: string | null;
    notes: string;
    source: string | null;
    lastAuditedAt: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface Section8Rollup {
    propertyId: string;
    propertyName: string;
    totalScheduled: number;
    uniqueInspectionDates: string[];
    nextInspectionDate: string | null;
    status: 'on-track' | 'attention' | 'overdue';
    generatedAt: string;
}

// ─── Task 2.5: InsuranceModule — FolioGuard enforcement ───
//
// Promotes the existing InsuranceModule.tsx-local `Policy` interface
// (a subset shape) into a canonical `InsurancePolicy` type in the
// shared package, and introduces the AppFolio "Insurance Enforcement
// Report" concept via an `enforcementStatus` union + FolioGuardRollup
// aggregate.
//
// Source of truth: AppFolio_Screenshots/data/07_insurance_compliance.json
// (Insurance Enforcement Report schema: 6 visible columns plus access-
// control flags showing InsuranceEnforcementReport + TenantInsuranceCoverageReport
// enabled for the portfolio). GAP-COMP-02 in that file's dwellium_mapping_notes
// calls this the "direct model for Dwellium Compliance module's Insurance tab."
//
// Additive-only (GR-2): all extension fields on InsurancePolicy are
// optional; the interface itself is net-new (no existing type renamed or
// narrowed); `EnforcementStatus` is a net-new union. InsuranceModule.tsx's
// module-local `interface Policy` (L20-35 of that file) stays as-is in
// this commit and is aliased to `InsurancePolicy` in commit 4, same
// additive pattern as Task 2.3's ComplianceItem → ComplianceRecord.
//
// Task 2.5 is link 2/3 of the B3 serial chain (2.3 → 2.5 → 2.7) per
// Docs/Session_Notes/2026-04-23_phase_2_schedule.md §3 SCC-A, rebasing
// onto Task 2.3's type additions landed at `36ee8ca`.

export type InsurancePolicyType =
    | 'liability'
    | 'property'
    | 'flood'
    | 'umbrella'
    | 'workers_comp'
    | 'auto'
    | 'other';

export type InsurancePolicyStatus = 'active' | 'expired' | 'cancelled' | 'pending';

// Enforcement states map AppFolio's Insurance Enforcement Report
// (LeaseRequiresInsurance × InsuranceRequirement × ActiveCoverage) to an
// enum:
//   - 'required'      → enforcement applies, coverage not yet verified
//   - 'not-required'  → lease does not require insurance
//   - 'lapsed'        → required but coverage missing/expired (RED)
//   - 'fulfilled'     → required + active coverage verified (GREEN)
export type EnforcementStatus = 'required' | 'not-required' | 'lapsed' | 'fulfilled';

export interface InsurancePolicy {
    id: string;
    propertyId: string;
    policyType: InsurancePolicyType;
    policyNumber: string;
    carrier: string;
    agentName: string;
    agentPhone: string;
    premiumAnnual: number | null;
    coverageAmount: number | null;
    deductible: number | null;
    effectiveDate: string;
    expirationDate: string;
    status: InsurancePolicyStatus;
    notes: string;
    metadata: Record<string, any>;
    createdAt: string;
    updatedAt: string;
    // ─── Task 2.5 FolioGuard additions (all optional; backward compatible) ───
    enforcementStatus?: EnforcementStatus;
    leaseRequiresInsurance?: boolean;
    insuranceRequirement?: string | null;
    activeCoverageVerified?: boolean;
}

export interface FolioGuardRollup {
    propertyId: string;
    propertyName: string;
    totalPolicies: number;
    required: number;
    notRequired: number;
    lapsed: number;
    fulfilled: number;
    lapsedRatio: number;
    status: 'on-track' | 'attention' | 'overdue';
    generatedAt: string;
}

// ─── Task 2.7: AuditModule — unified activity timeline (B3 closure) ───
//
// Final link of the B3 serial chain (2.3 → 2.5 → 2.7) per
// Docs/Session_Notes/2026-04-23_phase_2_schedule.md §3 SCC-A. Task 2.7
// does NOT re-declare any Task-2.3 or Task-2.5 type; the unified timeline
// is an aggregation SHAPE that the handler populates from multiple source
// tables at query time, with each AuditEvent carrying an explicit `source`
// provenance tag (defends against type-confusion per the /security-review
// checklist for multi-source join handlers).
//
// Plan reference: v2.0 §8 Task 2.7 rescope ("WO actions log + communication
// log as a unified activity timeline for a given entity") + Phase-2
// Clarifications item #3 (rewire AuditModule.tsx archive-search off direct
// localhost:3000 fetch + extend /audit handler). Scope reconciliation acked
// 2026-04-23: unified multi-source AuditEvent joining 5 sources (compliance
// + insurance + workitem actionsLog + audit_log + communication).
//
// Sources that can materialize into an AuditEvent:
//   - 'compliance'     → ComplianceRecord (Task 2.3)
//   - 'insurance'      → InsurancePolicy (Task 2.5)
//   - 'workitem'       → Workitem.actionsLog[] entries (Task 1.4)
//   - 'audit_log'      → pre-existing audit_log.json rows
//   - 'communication'  → Communication (existing; fixture currently empty)

export type AuditEventSource =
    | 'compliance'
    | 'insurance'
    | 'workitem'
    | 'audit_log'
    | 'communication';

export type AuditEventSeverity = 'info' | 'warning' | 'critical';

export type AuditEventCategory =
    | 'compliance_change'
    | 'policy_enforcement'
    | 'work_order_action'
    | 'user_action'
    | 'communication';

export interface AuditEvent {
    id: string;
    source: AuditEventSource;
    sourceId: string;
    category: AuditEventCategory;
    severity: AuditEventSeverity;
    title: string;
    description: string;
    propertyId: string | null;
    entityId: string | null;
    actor: string | null;
    timestamp: string;
    relatedComplianceId?: string;
    relatedPolicyId?: string;
    relatedWorkitemId?: string;
}

export interface UnifiedTimelineView {
    events: AuditEvent[];
    total: number;
    sourceBreakdown: Record<AuditEventSource, number>;
    propertyId: string | null;
    generatedAt: string;
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

// ─── Task 2.2 — Communication seed extension ─────────────────────
//
// Additive fields on the existing Communication interface and a new
// CommunicationThreadRollup aggregate. GR-2 additive-only: every
// Phase-1 consumer that instantiates a Communication by name
// (tests, fixtures, existing render paths in CommunicationModule.tsx)
// continues to typecheck because all new fields are optional.
//
// `propertyId` is the join key Task 2.7's /audit/unified-timeline
// handler already reads defensively at L242 — seeding it here
// "lights up" the source: 'communication' branch automatically.
//
// `threadId` enables threaded conversation grouping and powers the
// new /communications/thread-rollup route. `preview`, `readStatus`,
// and `attachmentCount` mirror AppFolio's inbox list-view affordances
// (short excerpt, unread chip, paperclip icon).
//
// Plan reference: v2.3 §8 L305 ("Task 2.2 (Communication seed)") +
// v2.4 §9 tracker row added at this PR's merge.

export type CommunicationReadStatus = 'unread' | 'read' | 'archived';

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
    // Task 2.2 — additive fields (all optional, GR-2):
    propertyId?: string | null;
    threadId?: string | null;
    preview?: string;
    readStatus?: CommunicationReadStatus;
    attachmentCount?: number;
}

// Aggregate shape returned by /communications/thread-rollup. Mirrors
// the Task 2.3 Section8Rollup / Task 2.5 FolioGuardRollup pattern:
// derivable from communications.json rows at query time; no separate
// fixture required. Lineage enforced at test time.
export interface CommunicationThreadRollup {
    threadId: string | null;
    propertyId: string | null;
    participantCount: number;
    messageCount: number;
    lastMessageAt: string;
    channels: ChannelType[];
    unreadCount: number;
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

// ─── Task 2.10 — PropertyTimeline multi-source merge expansion ──
//
// Widens the existing ActivityEvent.type union from 3 literals
// ('workitem' | 'incident' | 'audit') to 6 — adds 'communication',
// 'compliance', 'insurance' so the /property-activity/{id} handler
// can emit events from 5 merged sources (Task 2.7 pattern applied
// to a property-scoped view). audit_log stays a DISTINCT source
// kept OUT of property-scoped queries per the Ambiguity #3
// security-critical exclusion (Task 2.7 precedent at
// strataApi.static.ts:244 — cross-property leak guard).
//
// GR-2 widening safety: verified via repo-wide grep at commit time
// (see commit 1 message body). Only PropertyTimeline.tsx has a
// switch(type) consumer; it already has a `default` case at L25,
// so the widening adds no never-branch risk. All other ev.type
// consumers render ev.type as text or use unrelated unions.
//
// Additive-only (GR-2): the 3 original literal values remain valid
// and all new fields are optional — every pre-existing consumer
// keeps typechecking. Same discipline as Task 2.2 / 2.1.

export type ActivityEventSource =
    | 'workitem'
    | 'incident'
    | 'audit'
    | 'communication'
    | 'compliance'
    | 'insurance';

export interface ActivityEvent {
    id: string;
    type: ActivityEventSource;
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
    // Task 2.10 additive optional fields (all optional per GR-2):
    propertyId?: string | null;
    sourceId?: string;
    description?: string;
    relatedWorkitemId?: string;
    relatedComplianceId?: string;
    relatedPolicyId?: string;
    relatedCommunicationId?: string;
}

// Aggregate shape returned by the upgraded /property-activity/{id}
// handler. Mirrors Task 2.7's UnifiedTimelineView pattern but scoped
// to a single property. Superset of the pre-Task-2.10 return shape
// ({events: ActivityEvent[]}) so existing consumers reading .events
// remain unaffected.
export interface PropertyTimelineView {
    events: ActivityEvent[];
    total: number;
    propertyId: string;
    sourceBreakdown: Record<ActivityEventSource, number>;
    generatedAt: string;
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

// ─── Task 2.4 — Forecast static handler shapes ──────────────────
//
// Models the contract returned by the new GET /forecast static handler
// in strataApi.static.ts. ForecastModule.tsx is rewired off the raw
// localhost:3000/api/forecast fetch (Task 2.7 AuditModule precedent)
// and consumes these shapes via strataGet<ForecastResult>('/forecast').
// Pure projection from units.json (rentAmount × occupied) and the
// per-property maintenanceConfig.maintenanceLimit (Task 1.3 field) —
// no synthetic data; every number traces back to seed.

export interface MonthlyForecast {
    month: string;
    label: string;
    projectedRevenue: number;
    projectedExpenses: number;
    netCashFlow: number;
    occupancyRate: number;
    occupiedUnits: number;
    totalUnits: number;
}

export interface ForecastSummary {
    totalRevenue: number;
    totalExpenses: number;
    totalNet: number;
    avgOccupancy: number;
    breakEvenOccupancy: number;
}

export interface ForecastAssumptions {
    occupancyRateOverride: number | null;
    rentChangePercent: number;
    baseMonthlyExpenseRate: number;
}

export interface ForecastResult {
    propertyId: string | null;
    propertyName: string;
    months: MonthlyForecast[];
    summary: ForecastSummary;
    assumptions: ForecastAssumptions;
}

// ─── Task 2.8 — Sentiment static handler shapes ─────────────────
//
// Models the contract returned by the new GET /sentiment/* static
// handlers in strataApi.static.ts. SentimentModule.tsx is rewired off
// the raw localhost:3000/api/sentiment/{trends,response} fetch
// (Task 2.4 ForecastModule precedent) and consumes these shapes via
// strataGet<SentimentScoreView>('/sentiment/scores'),
// strataGet<SentimentHistory>('/sentiment/history?tenantId=X'),
// strataGet<SentimentByEntity>('/sentiment/by-entity?...').
//
// Backed by qualia-shell/public/data/sentiment_scores.json (40 rows
// / 20 at-risk, deterministic from sorted entities.json tenantIds).
// entities.json explicitly NOT touched per plan v2.8 §8 L330 — the
// at-risk set lives in the new fixture, not on the tenant surface.
//
// Post-B3 additive append (4th post-2.7 amendment after Tasks 2.2 /
// 2.10 / 2.4); Appendix D row 1 text UNCHANGED per precedent across
// PRs #8–#16.

export type SentimentTrendDirection = 'improving' | 'stable' | 'declining';
export type SentimentChannel = 'manual' | 'email' | 'sms';

export interface SentimentResponse {
    id: string;
    score: number;
    comments: string;
    surveyDate: string;
    channel: SentimentChannel;
}

export interface SentimentScore {
    id: string;
    tenantId: string;
    tenantName: string;
    unit: string;
    propertyId: string;
    propertyName: string;
    latestScore: number;
    avgScore: number;
    trend: SentimentTrendDirection;
    consecutiveDeclines: number;
    atRisk: boolean;
    responses: SentimentResponse[];
}

export interface SentimentScoreView {
    trends: SentimentScore[];
    totalTracked: number;
    atRiskCount: number;
    improvingCount: number;
    avgScore: number;
}

export interface SentimentHistoryStats {
    count: number;
    avg: number;
    min: number;
    max: number;
    latestDate: string | null;
}

export interface SentimentHistory {
    tenantId: string;
    tenantName: string;
    responses: SentimentResponse[];
    stats: SentimentHistoryStats;
}

export interface SentimentByEntity {
    entityType: string;
    entityId: string;
    entityName: string;
    totalTracked: number;
    atRiskCount: number;
    avgScore: number;
    byTenant: SentimentScore[];
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

// ═══════════════════════════════════════════════════════════════
// Corporate Review Types
// ═══════════════════════════════════════════════════════════════
// Phase-3 Task 3.8 hoist from CorporateReview.tsx:14-28 (5th post-B3
// additive append after Tasks 2.2 / 2.10 / 2.4 / 2.8). Mirrors the
// inline shape line-for-line — additive only, no removals.

export type ReviewStatus = 'pending' | 'triaged' | 'approved' | 'rejected';

export type DocPriority = 'critical' | 'high' | 'medium' | 'low';

export interface ReviewDocument {
    id: string;
    filename: string;
    uploadedBy: string;
    status: ReviewStatus;
    priority: DocPriority;
    category: string;
    notes: string;
    workitemId: string | null;
    createdAt: string;
    updatedAt: string;
}

// ═══════════════════════════════════════════════════════════════
// Tenant Portal Types
// ═══════════════════════════════════════════════════════════════
// Phase-3 Task 3.9 hoist from TenantPortalModule.tsx (6th post-B3
// additive amendment after Tasks 2.2 / 2.10 / 2.4 / 2.8 / 3.8 —
// Task 3.7 was the only post-B3 task to skip; 3.9 returns to
// additive-append cadence). Mirrors the inline shape line-for-line
// — additive only, no removals. `Pagination` and `Stats` were too
// generic to live unprefixed in a global types module so they are
// hoisted as `TenantPortalPagination` and `TenantPortalStats`.

export type PortalTab = 'directory' | 'maintenance' | 'payments' | 'messages' | 'lease-alerts';

export interface TenantPortalPagination {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}

export interface TenantPortalStats {
    totalTenants: number;
    totalUnits: number;
    occupiedUnits: number;
    vacantUnits: number;
    openMaintenanceRequests: number;
    expiringLeases: number;
}

export interface TenantPortalMessage {
    id: string;
    tenantId: string;
    tenantName: string;
    direction: 'inbound' | 'outbound';
    subject: string;
    body: string;
    channel: string;
    createdAt: string;
    readStatus: 'read' | 'unread';
}
