// Standalone render of the Links & QR widget (no shell, no login) for plans/077 probes.
// Served by probe.cjs through an in-process Vite. StrictMode on purpose — the app mounts under it.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import ShortLinks from '../../qualia-shell/src/components/ShortLinks/ShortLinks';
import '../../qualia-shell/src/styles/global.css';
import '../../qualia-shell/src/styles/skins.css';

createRoot(document.getElementById('win')!).render(<StrictMode><ShortLinks /></StrictMode>);
