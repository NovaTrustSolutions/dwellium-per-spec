import { Fragment } from 'react';
import { MUTED_TEXT, HIT } from './fileExplorerTheme';

interface Props {
    path: string;
    onNavigate: (path: string) => void;
}

interface Crumb { label: string; path: string }

const MAX_SEGMENTS = 4;

const base = {
    minHeight: HIT,
    minWidth: HIT,
    justifyContent: 'center',
    display: 'inline-flex',
    alignItems: 'center',
    padding: '0 6px',
    font: 'inherit',
    fontSize: 12,
} as const;

function buildCrumbs(path: string): Crumb[] {
    const segs = path.split('/').filter(Boolean);
    const crumbs = segs.map((label, i) => ({ label, path: segs.slice(0, i + 1).join('/') }));
    return [{ label: 'root', path: '' }, ...crumbs];
}

/** `root › A › B › file`; past 4 path segments the middle ones collapse to "…". */
export function Breadcrumbs({ path, onNavigate }: Props) {
    const crumbs = buildCrumbs(path);
    const collapsed = crumbs.length - 1 > MAX_SEGMENTS;
    // root, first segment, …, last two segments
    const shown: (Crumb | null)[] = collapsed ? [crumbs[0], crumbs[1], null, ...crumbs.slice(-2)] : crumbs;
    const last = crumbs[crumbs.length - 1];
    return (
        <nav aria-label="Location" title={path || 'root'} style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', color: MUTED_TEXT }}>
            {shown.map((c, i) => (
                <Fragment key={c ? `c:${c.path}` : 'gap'}>
                    {i > 0 && <span aria-hidden="true" style={{ color: MUTED_TEXT }}>›</span>}
                    {c === null ? (
                        <span title={path} style={{ ...base, color: MUTED_TEXT }}>…</span>
                    ) : c === last ? (
                        <span aria-current="page" style={{ ...base, color: 'var(--text-primary)' }}>{c.label}</span>
                    ) : (
                        <button type="button" onClick={() => onNavigate(c.path)} style={{ ...base, background: 'transparent', border: 'none', cursor: 'pointer', color: MUTED_TEXT }}>{c.label}</button>
                    )}
                </Fragment>
            ))}
        </nav>
    );
}
