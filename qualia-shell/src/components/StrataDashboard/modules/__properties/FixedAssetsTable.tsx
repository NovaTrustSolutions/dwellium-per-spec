/**
 * FixedAssetsTable — Task 1.3
 *
 * Typed render of FixedAsset[] for the Property detail Fixed Assets
 * collapsible. Reads the typed `assets` prop directly; the parent
 * component is responsible for preferring `property.fixedAssets`
 * (typed) over `metadata.fixedAssets` (legacy bag).
 *
 * Source of truth: AppFolio_Screenshots/data/02_property_detail_128_buena_vista.json
 * See Docs/AppFolio_Parity_Implementation_Plan_v2.md §7 Task 1.3.
 */
import type { FixedAsset } from '../../strataTypes';

interface FixedAssetsTableProps {
    assets: FixedAsset[];
}

export default function FixedAssetsTable({ assets }: FixedAssetsTableProps) {
    if (assets.length === 0) {
        return (
            <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 11, padding: 12 }}>
                No fixed assets recorded.
            </div>
        );
    }
    return (
        <div className="s-table-wrap" data-testid="fixed-assets-table">
            <table className="s-table">
                <thead>
                    <tr>
                        <th>Asset ID</th>
                        <th>Serial #</th>
                        <th>Type</th>
                        <th>Status</th>
                        <th>Placed in Service</th>
                        <th>Warranty Expiration</th>
                    </tr>
                </thead>
                <tbody>
                    {assets.map((a) => (
                        <tr key={a.assetId} data-testid={`fixed-asset-row-${a.assetId}`}>
                            <td style={{ color: 'var(--s-accent, #6366f1)' }}>{a.assetId}</td>
                            <td>{a.serialNumber || '—'}</td>
                            <td className="s-td-bold">{a.type}</td>
                            <td>
                                <span className={`s-badge ${a.status === 'Installed' ? 'active' : 'maintenance'}`}>{a.status}</span>
                            </td>
                            <td>{a.placedInService || '—'}</td>
                            <td>{a.warrantyExpiration || '—'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
