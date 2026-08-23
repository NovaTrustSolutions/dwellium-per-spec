/**
 * photoVaultBridge — Strata → Photo Vault hand-off (plan 053).
 *
 * Maintenance work-order detail / Inspections call `openPhotoVaultForUnit`
 * with the item's property + unit; the widget opens on that unit's album
 * ("<Property> — <Unit>", Albums tab) with the Upload form preset to it.
 * Rides the typedBus pending-slot channel so the emit survives the widget's
 * mount race (typedBus replay/consume).
 */
import { busChannel } from '../../lib/typedBus';
import { openWidget } from '../../lib/dwelliumCommands';

export interface PhotoVaultPreset {
    tab: 'albums' | 'upload' | 'share';
    property?: string;
    unit?: string;
}

export const photoVaultPresetBus = busChannel<PhotoVaultPreset>('dwellium:photo-vault-preset');

/** Parse the unit label out of Strata workitem tags (the "unit: 12B" convention). */
export function unitFromTags(tags?: string[] | null): string | undefined {
    const tag = (tags || []).find(t => t.toLowerCase().startsWith('unit:'));
    const unit = tag?.split(':').slice(1).join(':').trim();
    return unit || undefined;
}

/** Open Photo Vault on a unit's album, Upload preset to it. */
export function openPhotoVaultForUnit(opts: { property?: string; unit?: string; tab?: PhotoVaultPreset['tab'] }): void {
    const property = opts.property?.trim();
    photoVaultPresetBus.emit({
        tab: opts.tab ?? 'albums',
        property: property && property !== '—' ? property : undefined,
        unit: opts.unit?.trim() || undefined,
    });
    openWidget('photo-vault');
}
