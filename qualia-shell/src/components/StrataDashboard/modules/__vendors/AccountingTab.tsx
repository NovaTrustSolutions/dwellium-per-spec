/**
 * AccountingTab — Task 1.2
 *
 * Surfaces the AppFolio Federal Tax + Accounting Information + Payment
 * Method + Bank Info blocks for a vendor. Reads the typed shapes on
 * EntityProfile (vendorFederalTax, vendorAccountingInfo, paymentMethod,
 * send1099). Bank account / routing numbers are never rendered raw —
 * only a last-4 mask when present.
 *
 * Source of truth: AppFolio_Screenshots/data/10_vendor_detail_2story_roofing.json
 * See Docs/AppFolio_Parity_Implementation_Plan_v2.md §7 Task 1.2.
 */
import { DollarSign, FileText, CreditCard, Landmark } from 'lucide-react';
import type { EntityProfile, VendorPaymentMethod } from '../../strataTypes';

interface AccountingTabProps {
    vendor: EntityProfile;
}

function maskLast4(value: string | null | undefined): string {
    if (!value) return '—';
    const digits = value.replace(/\D/g, '');
    if (digits.length < 4) return '••••';
    return `•••• ${digits.slice(-4)}`;
}

function formatPercent(n: number | null | undefined): string {
    if (n === null || n === undefined) return '—';
    return `${n.toFixed(2)}%`;
}

function formatDiscount(n: number | null | undefined): string {
    if (n === null || n === undefined) return '—';
    return n.toString();
}

function paymentIcon(method: VendorPaymentMethod | undefined) {
    switch (method) {
        case 'Check':
            return <FileText size={12} />;
        case 'ACH':
        case 'Wire':
            return <Landmark size={12} />;
        case 'Credit Card':
            return <CreditCard size={12} />;
        default:
            return <DollarSign size={12} />;
    }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div
            style={{
                marginBottom: 12,
                padding: 12,
                borderRadius: 8,
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.06)',
            }}
        >
            <h4
                style={{
                    fontSize: 11,
                    color: 'var(--text-secondary)',
                    fontWeight: 600,
                    margin: 0,
                    marginBottom: 10,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                }}
            >
                {title}
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, auto) 1fr', rowGap: 6, columnGap: 16, fontSize: 12 }}>
                {children}
            </div>
        </div>
    );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <>
            <span style={{ color: 'var(--text-tertiary)' }}>{label}</span>
            <span style={{ color: 'var(--text-primary)' }}>{value}</span>
        </>
    );
}

export default function AccountingTab({ vendor }: AccountingTabProps) {
    const ft = vendor.vendorFederalTax;
    const ai = vendor.vendorAccountingInfo;
    const method: VendorPaymentMethod | undefined = vendor.paymentMethod ?? ai?.paymentType;
    const send1099 = vendor.send1099 ?? ft?.send1099 ?? false;

    return (
        <div className="s-glass-card" data-testid="vendor-accounting-tab">
            <h3 style={{ marginBottom: 12, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                <DollarSign size={14} color="#818cf8" /> Accounting
            </h3>

            <Section title="Federal Tax (W-9 / 1099)">
                <Row label="Taxpayer Name" value={ft?.taxpayerName ?? '—'} />
                <Row label="W-9 Requested" value={ft?.w9Requested ? 'Yes' : 'No'} />
                <Row label="Tax ID (masked)" value={ft?.taxIdMasked ?? '—'} />
                <Row label="Tax Form Account #" value={ft?.taxFormAccountNumber ?? '—'} />
                <Row label="Send 1099" value={<span data-testid="accounting-send-1099">{send1099 ? 'Yes' : 'No'}</span>} />
            </Section>

            <Section title="Accounting Information">
                <Row label="Check Consolidation" value={ai?.checkConsolidation ?? '—'} />
                <Row label="Check Stub Breakdown" value={ai?.checkStubBreakdown ?? '—'} />
                <Row label="Hold Payments" value={ai?.holdPayments ? 'Yes' : 'No'} />
                <Row label="Email eCheck Receipt" value={ai?.emailECheckReceipt ? 'Yes' : 'No'} />
                <Row label="Payment Terms" value={ai?.paymentTerms ?? '—'} />
                <Row label="Default Check Memo" value={ai?.defaultCheckMemo ?? '—'} />
                <Row label="Default GL Account" value={ai?.defaultGlAccount ?? '—'} />
                <Row label="Work Order Adjustment" value={formatPercent(ai?.workOrderAdjustmentPercent)} />
                <Row label="Discount" value={formatDiscount(ai?.discount)} />
                <Row label="Online Payables" value={ai?.onlinePayablesEnabled ? 'Enabled' : 'Disabled'} />
            </Section>

            <Section title="Payment Method">
                <Row
                    label="Method"
                    value={
                        <span
                            data-testid="accounting-payment-method"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                        >
                            {paymentIcon(method)} {method ?? '—'}
                        </span>
                    }
                />
            </Section>

            <Section title="Bank Information">
                <Row label="Routing Number" value={maskLast4(ai?.bankRoutingNumber)} />
                <Row label="Account Number" value={maskLast4(ai?.bankAccountNumber)} />
                <Row label="Savings Account" value={ai?.savingsAccount ? 'Yes' : 'No'} />
            </Section>
        </div>
    );
}
