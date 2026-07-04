/**
 * auditLogAccess.ts — cosmetic catalog-visibility allowlist for the Audit Log
 * holocron (Holocron OS ▸ Apps ▸ Tools).
 *
 * This list controls ONLY whether the tile shows up in the Apps catalog
 * (`WIDGET_REGISTRY['audit-log'].restrictedToEmails`) — it is NOT the
 * security boundary. The real authz check happens server-side: the backend
 * rejects any session that isn't on its own AUDIT_LOG_VIEWER_EMAILS allowlist
 * (plan 033) with a 403, and the widget itself gates on "is a real session
 * signed in" + honors that 403 instead of duplicating an email list.
 *
 * Add an email here so the tile is visible for that account in the catalog;
 * the account still needs to be on the backend's AUDIT_LOG_VIEWER_EMAILS to
 * actually see data once the tile is opened.
 */
export const AUDIT_LOG_CATALOG_EMAILS = ['andy@dwellium.com'] as const;
