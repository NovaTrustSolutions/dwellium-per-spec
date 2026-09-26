/**
 * SubscriptionsEditor — plan 068 phase 2 (D4). Replaces the Home card's
 * sequential `window.prompt` editing with an inline add/rename/reprice/remove
 * list. Edits happen on a DRAFT copy; nothing reaches `saveSubscriptions`
 * until Save. If the store changes underneath a clean draft (another tab,
 * another device via One Save hydrate), the draft follows it — but never
 * clobbers in-progress typing.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { monthlyTotal, saveSubscriptions, useSubscriptions, type Subscription } from '../../lib/subscriptionsStore';
import './SubscriptionsEditor.css';

interface DraftRow {
    key: string;      // stable React key; NOT persisted
    id: string;       // existing subscription id, or '' for a brand-new row
    name: string;
    vendor: string;
    monthly: string;  // raw input text; parsed/validated separately
}

let keySeq = 0;
function nextKey(): string {
    keySeq += 1;
    return `subed-row-${keySeq}`;
}

function slugify(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'sub';
}

function toDraft(list: Subscription[]): DraftRow[] {
    return list.map((s) => ({ key: s.id || nextKey(), id: s.id, name: s.name, vendor: s.vendor ?? '', monthly: String(s.monthly ?? 0) }));
}

interface RowCheck { valid: boolean; reason?: string }

function checkRow(row: DraftRow, index: number): RowCheck {
    if (!row.name.trim()) return { valid: false, reason: `Row ${index + 1}: name is required` };
    const n = Number(row.monthly);
    if (!Number.isFinite(n) || n < 0) return { valid: false, reason: `Row ${index + 1}: monthly price must be 0 or more` };
    return { valid: true };
}

export default function SubscriptionsEditor() {
    const subscriptions = useSubscriptions();
    const [draft, setDraft] = useState<DraftRow[]>(() => toDraft(subscriptions));
    const [dirty, setDirty] = useState(false);
    const [status, setStatus] = useState('');
    const [focusKey, setFocusKey] = useState<string | null>(null);
    const nameRefs = useRef<Record<string, HTMLInputElement | null>>({});

    // Clean draft follows the store; a dirty one keeps the user's typing.
    useEffect(() => {
        if (!dirty) setDraft(toDraft(subscriptions));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [subscriptions]);

    useEffect(() => {
        if (focusKey) {
            nameRefs.current[focusKey]?.focus();
            setFocusKey(null);
        }
    }, [focusKey, draft]);

    const total = monthlyTotal(subscriptions);
    const validity = useMemo(() => draft.map(checkRow), [draft]);
    const firstInvalid = validity.find((v) => !v.valid);
    const saveDisabled = !dirty || Boolean(firstInvalid);

    function markDirty() {
        setDirty(true);
        setStatus('');
    }

    function updateRow(key: string, patch: Partial<DraftRow>) {
        setDraft((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
        markDirty();
    }

    function removeRow(key: string) {
        setDraft((rows) => rows.filter((r) => r.key !== key));
        markDirty();
    }

    function addRow() {
        const key = nextKey();
        setDraft((rows) => [...rows, { key, id: '', name: '', vendor: '', monthly: '0' }]);
        setFocusKey(key);
        markDirty();
    }

    function cancel() {
        setDraft(toDraft(subscriptions));
        setDirty(false);
        setStatus('');
    }

    function save() {
        if (saveDisabled) return;
        const cleaned: Subscription[] = draft.map((row) => ({
            id: row.id || `${slugify(row.name.trim())}-${Date.now()}`,
            name: row.name.trim(),
            vendor: row.vendor.trim(),
            monthly: Math.round(Number(row.monthly) * 100) / 100,
        }));
        saveSubscriptions(cleaned);
        setDirty(false);
        setStatus('Saved');
    }

    return (
        <div className="subed">
            <div className="subed__head">
                <h2 className="subed__title">Subscriptions</h2>
                <span className="subed__total">{`$${total.toFixed(2)} / month`}</span>
            </div>

            {draft.length === 0 ? (
                <p className="subed__empty">No subscriptions yet — add the AI plans you pay for.</p>
            ) : (
                <table className="subed__table">
                    <thead>
                        <tr>
                            <th scope="col">Name</th>
                            <th scope="col">Vendor</th>
                            <th scope="col">Monthly $</th>
                            <th scope="col"><span className="subed__sr-only">Remove</span></th>
                        </tr>
                    </thead>
                    <tbody>
                        {draft.map((row, i) => {
                            const nameId = `subed-name-${row.key}`;
                            const vendorId = `subed-vendor-${row.key}`;
                            const priceId = `subed-price-${row.key}`;
                            return (
                                <tr key={row.key}>
                                    <td>
                                        <label className="subed__sr-only" htmlFor={nameId}>{`Name for row ${i + 1}`}</label>
                                        <input
                                            id={nameId}
                                            ref={(el) => { nameRefs.current[row.key] = el; }}
                                            className="subed__input"
                                            type="text"
                                            required
                                            value={row.name}
                                            onChange={(e) => updateRow(row.key, { name: e.target.value })}
                                        />
                                    </td>
                                    <td>
                                        <label className="subed__sr-only" htmlFor={vendorId}>{`Vendor for row ${i + 1}`}</label>
                                        <input
                                            id={vendorId}
                                            className="subed__input"
                                            type="text"
                                            value={row.vendor}
                                            onChange={(e) => updateRow(row.key, { vendor: e.target.value })}
                                        />
                                    </td>
                                    <td>
                                        <label className="subed__sr-only" htmlFor={priceId}>{`Monthly price for row ${i + 1}`}</label>
                                        <input
                                            id={priceId}
                                            className="subed__input subed__input--num"
                                            type="number"
                                            min={0}
                                            step={0.01}
                                            value={row.monthly}
                                            onChange={(e) => updateRow(row.key, { monthly: e.target.value })}
                                        />
                                    </td>
                                    <td>
                                        <button type="button" className="subed__remove" onClick={() => removeRow(row.key)}>
                                            {`Remove ${row.name.trim() || `row ${i + 1}`}`}
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            )}

            <button type="button" className="subed__add" onClick={addRow}>Add subscription</button>

            <div className="subed__actions">
                <button
                    type="button"
                    className="subed__save"
                    disabled={saveDisabled}
                    aria-describedby={firstInvalid ? 'subed-save-reason' : undefined}
                    onClick={save}
                >
                    Save
                </button>
                <button type="button" className="subed__cancel" disabled={!dirty} onClick={cancel}>Cancel</button>
                {firstInvalid?.reason && <span id="subed-save-reason" className="subed__reason">{firstInvalid.reason}</span>}
            </div>

            <p className="subed__status" aria-live="polite">{status}</p>
        </div>
    );
}
