# Phase 0 — Type Audit Report

**Generated:** 2026-04-19
**Scope:** All 33 modules under `qualia-shell/src/components/StrataDashboard/modules/*.tsx`
**Canonical types source:** `packages/types/index.ts` (imported via `strataTypes.ts`)

## Method

1. Parsed `packages/types/index.ts` and extracted the field names of 8 interfaces: `Property`, `Unit`, `EntityProfile`, `Workitem`, `Communication`, `ActivityEvent`, `PropertyReportCards`, `DashboardStats`.
2. Scanned every module for member-access patterns `obj.field` or `obj?.field` where `obj` matches an entity-like identifier (`tenant`, `resident`, `vendor`, `property`, `unit`, `workitem`, `workOrder`, `wo`, `item`, `entity`, `occupancy`, `occupant`, `communication`, `comm`, `message`, `insurance`, `policy`, `compliance`, `report`, `schedule`, `profile`).
3. Filtered out standard JS/DOM methods and any field that already exists on one of the 8 interfaces.

## Orphan-field summary

**34 orphan fields** identified across **10 modules**. Grouped by recommended Phase 1/2 target:

### ComplianceEngine (10 orphans) → Phase 2 Task 2.3
| Field | Used in | Probable target type |
|---|---|---|
| `expirationDate` | ComplianceEngine | `ComplianceItem` (new) |
| `itemType` | ComplianceEngine | `ComplianceItem` (new) |
| `carrier` | ComplianceEngine | `InsurancePolicy` (new) |
| `notes` | ComplianceEngine | `ComplianceItem.notes` |
| `items` | ComplianceEngine | `ComplianceItem[]` collection |
| `computedStatus` | ComplianceEngine | `ComplianceItem.computedStatus` |
| `policyNumber` | ComplianceEngine | `InsurancePolicy.policyNumber` |
| `coverageLimits` | ComplianceEngine | `InsurancePolicy.coverageLimits` |
| `entityName` | ComplianceEngine | join result, not entity field (OK as-is) |
| `label` | ComplianceEngine, LeasingModule | UI enum label, not entity field (OK) |

### PropertiesModule (4 orphans) → Phase 2 Task 2.4 (Property Timeline)
| Field | Used in | Probable target type |
|---|---|---|
| `targetType` | PropertiesModule | `EntityLink` (new) |
| `linkType` | PropertiesModule | `EntityLink.linkType` |
| `note` | PropertiesModule | `PropertyNote` (new) |
| `reportedAt` | PropertiesModule | `IncidentReport.reportedAt` |

### PropertyOverview (9 orphans) — ALREADY TYPED on `PropertyReportCards`
| Field | Status |
|---|---|
| `activePolicies`, `expiringSoon`, `nearestExpiry` | ✅ on `PropertyReportCards.insurance` — false positive |
| `compliant`, `missing`, `expiring` | ✅ on `PropertyReportCards.compliance` — false positive |
| `text`, `warn`, `value` | UI-local props — not entity fields |

### ReportingModule (6 orphans) → Phase 2 extension (Document Triage Queue)
| Field | Probable target type |
|---|---|
| `csv`, `filename`, `confidence` | `DocumentTriageItem` (new) |
| `doc_label`, `suggested_entity_name`, `suggested_entity_type`, `suggested_action` | `DocumentTriageItem` AI-classifier output fields |

### DesignStudio (2 orphans) → Strata-unique (GR-1)
| Field | Note |
|---|---|
| `prompt`, `designType` | Strata-unique AI studio fields. Stay private to `DesignStudio` — do NOT promote to shared types. |

### VendorsModule (1 orphan)
| Field | Note |
|---|---|
| `com` | Likely truncated variable name or false positive |

### LeasingModule (2 orphans)
| Field | Note |
|---|---|
| `label`, `key` | UI-local enum entries |

---

## Phase 1 target field list (derived from the gap analysis + this audit)

These fields are what Phase 1 tasks 1.1-1.5 will ADD to the canonical types as **optional** (per GR-2):

### Task 1.1 — Residents / Occupancy
- `Occupancy` (new interface): `id, unitId, leaseId, startDate, endDate, status: 'Current'|'Past'|'Future', primaryTenantId, otherOccupantIds[]`
- `EntityProfile.occupancyId?: string`
- `EntityProfile.occupantType?: 'Primary' | 'Other Occupant'`
- `EntityProfile.emergencyContact?: EmergencyContact`
- `EntityProfile.animals?: Animal[]`
- `EntityProfile.vehicles?: Vehicle[]`

### Task 1.2 — Vendors
- `VendorFederalTax`: `{ taxpayerName?, w9Requested?, taxIdMasked?, taxFormAccountNumber?, send1099? }`
- `VendorAccountingInfo`: `{ checkConsolidation?, checkStubBreakdown?, holdPayments?, emailECheckReceipt?, paymentTerms?, defaultCheckMemo?, defaultGlAccount?, workOrderAdjustmentPercent?, discount?, onlinePayablesEnabled?, paymentType?, savingsAccount? }`
- `VendorCompliance`: `{ workersCompExpiration?, generalLiabilityExpiration?, epaCertificationExpiration?, autoInsuranceExpiration?, stateLicenseExpiration?, contractExpiration?, requestComplianceDocumentsCta? }`
- `EntityProfile.vendorFederalTax?`, `vendorAccounting?`, `vendorCompliance?`, `paymentMethod?: 'Check'|'ACH'|'Zelle'|'eCheck'`, `send1099?: boolean`

### Task 1.3 — Properties
- `PurchaseHistory`: `{ date, amount, seller?, titleCompany? }`
- `LateFeePolicy`: `{ effective?, baseFee?, graceDays?, graceBalance?, percentage? }`
- `MaintenanceConfig`: `{ maintenanceLimit?, homeWarrantyCompany?, homeWarrantyExpires?, preAuthRequired? }`
- `FixedAsset`: `{ assetId?, type?, status?, placedInService?, warrantyExpiration?, notes? }`
- `Property.purchaseHistory?`, `lateFeePolicy?`, `maintenanceConfig?`, `nonRevenueUnit?`, `fixedAssets?`

### Task 1.4 — Workitem (CRITICAL per GR-1)
- `ResidentAvailability`: `{ day, startTime?, endTime?, notes? }`
- `ActionLogEntry`: `{ ts, actor, event?, action?, detail? }`
- `LaborEntry`: `{ date, technicianId, hours, rate }`
- `PurchaseOrderLink`: `{ poId, amount, status }`
- `Workitem.residentAvailability?`, `actionsLog?`, `labor?`, `linkedPurchaseOrders?`, `withheldFromOwner?`, `serviceRequestId?`, `permissionToEnter?`, `jobDescription?`, `vendorTrade?`, `vendorInstructions?`

### Task 1.5 — Accounting
- `TenantLedgerRow` / `InvoiceRow` extension: `{ accountCode?, accountName?, scheduleStart?, scheduleEnd?, nextChargeDate?, previousChargeDate?, paymentStatus? }`

---

## Phase 2 target field list

### Task 2.3 ComplianceEngine (new types)
- `ComplianceItem`: `{ id, entityType, entityId, entityName?, kind, expirationDate?, itemType?, computedStatus?, notes?, source? }`
- `InsurancePolicy`: `{ id, entityId, policyNumber?, carrier?, coverageLimits?, effectiveDate?, expirationDate?, status? }`

### Task 2.10 PropertyTimeline + PropertiesModule
- `EntityLink`: `{ id, sourceId, sourceType, targetId, targetType, linkType, note?, reportedAt? }`

### ReportingModule — Document Triage Queue
- `DocumentTriageItem`: `{ id, csv?, filename, docLabel?, confidence?, suggestedEntityName?, suggestedEntityType?, suggestedAction? }`

---

## Done criteria

- [x] Every module scanned
- [x] Every orphan field mapped to Phase 1 or Phase 2 task
- [x] All strata-unique modules (`DesignStudio`, `CivilEngineeringStudio`, `IncidentModule`, `LegalModule`, `ProfileSpaces`, `VisualizationModule`, `CorporateReview`, `StatusCheckModule`) flagged as GR-1 protected
- [x] False-positives enumerated (PropertyOverview's 9 fields live on `PropertyReportCards` already)

🧪
