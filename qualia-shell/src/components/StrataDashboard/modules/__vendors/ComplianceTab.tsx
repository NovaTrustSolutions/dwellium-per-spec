/**
 * ComplianceTab — Task 1.2
 *
 * Renders the 6 AppFolio vendor compliance expiration dates as a
 * status-badged list. Reads vendor.vendorCompliance (additive field on
 * EntityProfile). Missing/null fields render as an em-dash with a
 * "Missing" badge; populated dates surface Valid / Expiring / Expired
 * based on 90-day-horizon arithmetic against now.
 *
 * Source of truth: AppFolio_Screenshots/data/10_vendor_detail_2story_roofing.json
 * See Docs/AppFolio_Parity_Implementation_Plan_v2.md §7 Task 1.2.
 */
import { Shield, AlertTriangle, CheckCircle, FileWarning } from 'lucide-react';
import type { EntityProfile } from '../../strataTypes';

type ExpirationStatus = 'Valid' | 'Expiring' | 'Expired' | 'Missing';

export function expirationColor(
    date: string | null | undefined,
    now: Date = new Date(),
): { status: ExpirationStatus; color: string } {
    if (!date) return { status: 'Missing', color: 'var(--text-tertiary)' };
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) return { status: 'Missing', color: 'var(--text-tertiary)' };
    const msPerDay = 86_400_000;
    const daysUntil = Math.floor((parsed.getTime() - now.getTime()) / msPerDay);
    if (daysUntil < 0) return { status: 'Expired', color: '#ef4444' };
    if (daysUntil <= 90) return { status: 'Expiring', color: '#f59e0b' };
    return { status: 'Valid', color: '#22c55e' };
}

const ROWS: Array<{ label: string; key: keyof NonNullable<EntityProfile['vendorCompliance']> }> = [
    { label: "Workers' Comp", key: 'workersCompExpiration' },
    { label: 'General Liability', key: 'generalLiabilityExpiration' },
    { label: 'EPA Certification', key: 'epaCertificationExpiration' },
    { label: 'Auto Insurance', key: 'autoInsuranceExpiration' },
    { label: 'State License', key: 'stateLicenseExpiration' },
    { label: 'Contract', key: 'contractExpiration' },
];

function statusIcon(status: ExpirationStatus) {
    switch (status) {
        case 'Valid':
            return <CheckCircle size={12} />;
        case 'Expiring':
            return <AlertTriangle size={12} />;
        case 'Expired':
            return <AlertTriangle size={12} />;
        default:
            return <FileWarning size={12} />;
    }
}

interface ComplianceTabProps {
    vendor: EntityProfile;
    now?: Date;
}

export default function ComplianceTab({ vendor, now }: ComplianceTabProps) {
    const vc = vendor.vendorCompliance;
    const cta = vc?.requestComplianceDocumentsCta === true;

    return (
        <div className="s-glass-card" data-testid="vendor-compliance-tab">
            <h3 style={{ marginBottom: 12, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Shield size={14} color="#818cf8" /> Compliance
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {ROWS.map((row) => {
                    const raw = vc ? vc[row.key] : null;
                    const value = typeof raw === 'string' ? raw : null;
                    const { status, color } = expirationColor(value, now);
                    return (
                        <div
                            key={row.key}
                            data-testid={`compliance-row-${row.key}`}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '8px 12px',
                                borderRadius: 8,
                                background: 'rgba(255,255,255,0.02)',
                                border: '1px solid rgba(255,255,255,0.06)',
                            }}
                        >
                            <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>{row.label}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span style={{ fontSize: 12, color: 'var(--text-primary)', fontFamily: 'ui-monospace, monospace' }}>
                                    {value ?? '—'}
                                </span>
                                <span
                                    data-testid={`compliance-badge-${row.key}`}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 4,
                                        padding: '2px 8px',
                                        borderRadius: 10,
                                        fontSize: 10,
                                        fontWeight: 600,
                                        color,
                                        background: `${color}22`,
                                        border: `1px solid ${color}55`,
                                    }}
                                >
                                    {statusIcon(status)} {status}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {cta && (
                <button
                    type="button"
                    // TODO(Task 1.3+): wire to /vendors/:id/request-compliance POST once
                    // the AP-side endpoint lands. For now this is a visual affordance only.
                    onClick={() => undefined}
                    data-testid="compliance-request-cta"
                    style={{
                        marginTop: 12,
                        padding: '8px 14px',
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 600,
                        background: 'color-mix(in srgb, var(--accent) 15%, transparent)',
                        border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
                        color: 'var(--accent)',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                    }}
                >
                    Request Compliance Documents
                </button>
            )}
        </div>
    );
}
