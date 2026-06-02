import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { TagInput } from '../components/Tags/TagInput';
import TagFile from '../components/TagFile/TagFile';
import { tagStore, tagStoreUserIdHolder, setItemTags, getTagsForItem } from '../lib/tagStore';

// No UserProvider → components resolve the holder to null (anonymous); seed under the same key.
beforeEach(() => {
    try { localStorage.clear(); } catch { /* ignore */ }
    tagStoreUserIdHolder.current = null;
    tagStore.reset();
    cleanup();
});

describe('TagInput (drop-in) writes to the central Tag file', () => {
    it('typing a tag + Enter adds a chip and persists it', () => {
        render(<TagInput source="task-board" sourceId="c1" title="Card one" />);
        const input = screen.getByLabelText('Add a tag');
        fireEvent.change(input, { target: { value: 'urgent' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(getTagsForItem('task-board', 'c1')).toContain('urgent');
        expect(screen.getByLabelText('Remove tag urgent')).toBeTruthy();
    });
});

describe('TagFile viewer shows everything tagged', () => {
    it('lists a tagged item and its tag', () => {
        setItemTags({ source: 'task-board', sourceId: 'c1', title: 'My Card' }, ['urgent', 'legal']);
        render(<TagFile />);
        expect(screen.getByText('My Card')).toBeTruthy();
        // tag cloud contains a button whose label includes the tag
        expect(screen.getAllByRole('button').some(b => /urgent/i.test(b.textContent || ''))).toBe(true);
    });

    it('shows the empty state when nothing is tagged', () => {
        render(<TagFile />);
        expect(screen.getByText(/Nothing tagged yet/)).toBeTruthy();
    });
});
