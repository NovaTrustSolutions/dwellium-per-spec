/**
 * Scribe — markdown editor widget.
 *
 * Cycle 3 scaffold (2026-05-27): empty placeholder. Subsequent cycles
 * port the CodeMirror 6 editor, redline plugin, comments, versioning,
 * smart paste from Docs/holocron-reference/editor/src/renderer/src/
 * components/scribe/. See Scripts/autorun/PORTING_PLAN.md.
 */

import './Scribe.css';

export default function Scribe() {
    return (
        <div className="scribe">
            <div className="scribe__placeholder">
                <h2>Scribe</h2>
                <p>Markdown editor with AI redlines, inline comments, versioning, smart paste.</p>
                <p className="scribe__muted">Coming online via incremental ports — see <code>Scripts/autorun/PORTING_PLAN.md</code>.</p>
            </div>
        </div>
    );
}
