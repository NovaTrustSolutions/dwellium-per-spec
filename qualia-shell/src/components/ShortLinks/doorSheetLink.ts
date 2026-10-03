/**
 * doorSheetLink — "print maintenance QR for this property/unit" from anywhere
 * in the app (plan 077 phase 4). Same pending-slot + live-event pattern as
 * pendingDeepLink consumers (Notepad, TranscriptionHub).
 */
import { setPendingDeepLink, takePendingDeepLink } from '../../lib/pendingDeepLink';
import { openWidget } from '../../lib/dwelliumCommands';

export const DOOR_SHEET_EVENT = 'dwellium:open-door-sheet';
export interface DoorSheetRequest { propertyId: string; propertyName: string; units?: string[] }  // units omitted = the whole roster

const str = (v: unknown): v is string => typeof v === 'string' && v !== '';

/** Validate an event detail or stored payload; malformed → null. */
export function parseDoorSheetRequest(raw: unknown): DoorSheetRequest | null {
    if (!raw || typeof raw !== 'object') return null;
    const { propertyId, propertyName, units } = raw as Record<string, unknown>;
    if (!str(propertyId) || !str(propertyName)) return null;
    if (units === undefined) return { propertyId, propertyName };
    if (!Array.isArray(units) || !units.every(str)) return null;
    return units.length ? { propertyId, propertyName, units: [...units] } : { propertyId, propertyName }; // [] = whole roster
}

/** Remember the request for an unmounted widget, tell a mounted one, open the widget. */
export function openDoorSheet(req: DoorSheetRequest): void {
    setPendingDeepLink('short-links', JSON.stringify(req));
    window.dispatchEvent(new CustomEvent(DOOR_SHEET_EVENT, { detail: req }));
    openWidget('short-links');
}

/** The pending request, if any. One-shot. */
export function takeDoorSheetRequest(): DoorSheetRequest | null {
    const s = takePendingDeepLink('short-links');
    if (!s) return null;
    try { return parseDoorSheetRequest(JSON.parse(s)); } catch { return null; }
}
