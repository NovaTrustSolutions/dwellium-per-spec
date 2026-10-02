// BEFORE render: same harness, widget imported from the main checkout this worktree hangs off (<main>/.claude/worktrees/<name>/plans/077-assets → five levels up).
// Served by probe.cjs through an in-process Vite. StrictMode on purpose — the app mounts under it.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import ShortLinks from '../../../../../qualia-shell/src/components/ShortLinks/ShortLinks';
import '../../../../../qualia-shell/src/styles/global.css';
import '../../../../../qualia-shell/src/styles/skins.css';

createRoot(document.getElementById('win')!).render(<StrictMode><ShortLinks /></StrictMode>);
