/**
 * NotesScopeSection — plan 070: god-only "Show other users' notes" toggle.
 *
 * Notes belong to their creator; a `god` account can additionally read/edit/
 * delete every user's notes, but only while this is on (`notesScopeStore`,
 * per-user + One Save synced). Sister-shape to AccountsSection.tsx (god-only
 * gate via `useUser()`).
 */
import { useSyncExternalStore } from 'react';
import { useUser } from '../../context/UserContext';
import { notesScopeStore } from '../../lib/notesScopeStore';

export default function NotesScopeSection() {
    const { user } = useUser();
    const prefs = useSyncExternalStore(notesScopeStore.subscribe, notesScopeStore.getSnapshot, notesScopeStore.getServerSnapshot);

    // God-only surface.
    if (user?.role !== 'god') return null;

    return (
        <section className="cp-section">
            <h3 className="cp-section__title">Notes</h3>
            <label className="cp-checkbox">
                <input type="checkbox" checked={prefs.readOthers}
                    onChange={e => notesScopeStore.setReadOthers(e.target.checked)} />
                <span>Show other users' notes</span>
            </label>
            <p style={{ fontSize: 12, color: 'var(--text-tertiary, #808080)', lineHeight: 1.5, margin: '4px 2px 0' }}>
                Notepad, ⌘K and Search will include every user's notes; edits and deletes apply to them too.
            </p>
        </section>
    );
}
