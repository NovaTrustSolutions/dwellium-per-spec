/**
 * FillFromRecord — picks a Property/Tenant/Owner/Vendor record from the live
 * Strata data and applies its fields onto the active template's values,
 * restricted to keys the template actually has.
 *
 * Honest states only: loading, "couldn't load" when the backend is
 * unreachable, "no records yet" when it answered with none.
 */
import { useEffect, useState } from 'react';
import { useEntities, useProperties } from '../StrataDashboard/useStrataQueries';
import { recordLabel, recordToValues, type AutofillKind } from './templateAutofill';
import type { EntityProfile, Property } from '../StrataDashboard/strataTypes';

export interface FillFromRecordProps {
    /** Only these keys are ever applied — the caller's current template variables. */
    templateKeys: string[];
    onFill: (values: Record<string, string>, count: number) => void;
}

export default function FillFromRecord({ templateKeys, onFill }: FillFromRecordProps) {
    const [kind, setKind] = useState<AutofillKind>('property');
    const [recordId, setRecordId] = useState('');

    const propertiesQuery = useProperties(kind === 'property');
    const entitiesQuery = useEntities(kind === 'property' ? undefined : kind, kind !== 'property');
    const query = kind === 'property' ? propertiesQuery : entitiesQuery;
    const records = (query.data ?? []) as Array<Property | EntityProfile>;

    useEffect(() => setRecordId(''), [kind]);

    function fill() {
        const record = records.find((r) => r.id === recordId);
        if (!record) return;
        const values = recordToValues(kind, record);
        const applied: Record<string, string> = {};
        let count = 0;
        for (const key of templateKeys) {
            if (values[key]) {
                applied[key] = values[key];
                count += 1;
            }
        }
        onFill(applied, count);
    }

    return (
        <div className="tg-fill">
            <select
                className="tg-select"
                aria-label="Record type"
                value={kind}
                onChange={(e) => setKind(e.target.value as AutofillKind)}
            >
                <option value="property">Property</option>
                <option value="tenant">Tenant</option>
                <option value="owner">Owner</option>
                <option value="vendor">Vendor</option>
            </select>

            {query.isLoading ? (
                <p className="tg-fill__status">Loading…</p>
            ) : query.isError ? (
                <p className="tg-fill__status">Couldn't load records. Is the backend connected?</p>
            ) : records.length === 0 ? (
                <p className="tg-fill__status">No {kind} records yet.</p>
            ) : (
                <>
                    <select
                        className="tg-select"
                        aria-label="Record"
                        value={recordId}
                        onChange={(e) => setRecordId(e.target.value)}
                    >
                        <option value="">Choose…</option>
                        {records.map((r) => (
                            <option key={r.id} value={r.id}>
                                {recordLabel(kind, r)}
                            </option>
                        ))}
                    </select>
                    <button type="button" className="tg-action-btn" onClick={fill} disabled={!recordId}>
                        Fill
                    </button>
                </>
            )}
        </div>
    );
}
