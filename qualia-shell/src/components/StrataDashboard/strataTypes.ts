/**
 * Strata Types — Re-exports from @qualia/types (Phase 6.3)
 *
 * @canonical All entity types are defined in `packages/types/index.ts`.
 * This file re-exports everything for backward compatibility so that
 * existing imports from `./strataTypes` continue to work without changes.
 *
 * New code should import directly from '@qualia/types' when the path
 * alias is configured.
 */

export type {
    PropertyStatus,
    UnitStatus,
    EntityType,
    EntityStatus,
    WorkitemType,
    WorkitemStatus,
    WorkitemPriority,
    WorkitemDomain,
    ThreadChannel,
    EvidenceType,
    DecisionType,
    ReportType,
    ChannelType,
    DirectionType,
    UserRole,
    Property,
    Unit,
    EntityProfile,
    Occupancy,
    EmergencyContact,
    Animal,
    Vehicle,
    Workitem,
    Evidence,
    Decision,
    Report,
    Communication,
    DashboardStats,
    PropertySummary,
    StrataModule,
    ActivityEvent,
    PropertyReportCards,
    ResidentStatus,
    ResidentHistoryEvent,
    CommunicationTemplate,
    ResidentLinkage,
    ApiResponse,
    PaginatedResponse,
    VendorPaymentMethod,
    VendorFederalTax,
    VendorAccountingInfo,
    VendorCompliance,
} from '../../../../packages/types/index';
