import { describe, it, expect } from 'vitest';
import { nextActiveKey } from '../components/Shell/HalocronOS';

// Browser tab-close behavior for the Classic-OS split stage: closing the
// active/visible tab must reveal the adjacent remaining tab, never blank the
// stage. (Regression: a setActiveKey-inside-setTabs nesting could leave
// activeKey on the closed tab → stageTabs returns [] → empty stage.)
const order = [{ key: 'a' }, { key: 'b' }, { key: 'c' }];

describe('HalocronOS — browser tab-close heir (nextActiveKey)', () => {
    it('closing the active tab falls through to the RIGHT neighbor', () => {
        expect(nextActiveKey(order, 'a', 'a')).toBe('b');
        expect(nextActiveKey(order, 'b', 'b')).toBe('c');
    });

    it('closing the active LAST tab falls back to the LEFT neighbor', () => {
        expect(nextActiveKey(order, 'c', 'c')).toBe('b');
    });

    it('closing a BACKGROUND (non-active) tab leaves the active tab unchanged', () => {
        expect(nextActiveKey(order, 'b', 'a')).toBe('a');
        expect(nextActiveKey(order, 'c', 'a')).toBe('a');
    });

    it('closing the only remaining (active) tab clears the stage → null', () => {
        expect(nextActiveKey([{ key: 'a' }], 'a', 'a')).toBeNull();
    });

    it('is a no-op when the closing key is not found', () => {
        expect(nextActiveKey(order, 'zzz', 'a')).toBe('a');
    });
});
