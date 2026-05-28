/**
 * Hook for reading Scribe's per-user layout (TOC width, Minimap width,
 * TabBar height). Sister to useScribeTheme — useContext(UserContext)
 * directly for test resilience.
 */
import { useContext, useSyncExternalStore } from 'react';
import { UserContext } from '../../context/UserContext';
import {
    scribeLayoutStore,
    scribeLayoutUserIdHolder,
    saveScribeLayout,
    type ScribeLayout,
} from './scribeLayoutStore';

export function useScribeLayout(): ScribeLayout & {
    setTocWidth: (w: number) => void;
    setMinimapWidth: (w: number) => void;
    setTabBarHeight: (h: number) => void;
} {
    const userCtx = useContext(UserContext);
    scribeLayoutUserIdHolder.current = userCtx?.user?.id ?? null;

    const layout = useSyncExternalStore(
        scribeLayoutStore.subscribe,
        scribeLayoutStore.getSnapshot,
        scribeLayoutStore.getServerSnapshot,
    );

    return {
        ...layout,
        setTocWidth: (w) => saveScribeLayout({ tocWidth: w }),
        setMinimapWidth: (w) => saveScribeLayout({ minimapWidth: w }),
        setTabBarHeight: (h) => saveScribeLayout({ tabBarHeight: h }),
    };
}
