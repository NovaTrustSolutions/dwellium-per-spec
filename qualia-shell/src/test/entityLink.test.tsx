/**
 * EntityLink + StrataNavContext extension (universal clickable entities).
 *
 * Pins the contract the module sweep depends on:
 *  - a linked name renders as a real <button> (axe button-name via text)
 *  - clicking dispatches the right navigate* → module + searchNavTarget
 *  - clicks do NOT bubble to the enclosing row's onClick
 *  - id-less rows degrade to a plain <span> (no dead buttons)
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import EntityLink from '../components/StrataDashboard/EntityLink';
import { StrataNavProvider } from '../components/StrataDashboard/StrataNavContext';

function renderWithNav(ui: React.ReactNode) {
    const setActiveModule = vi.fn();
    const setSearchNavTarget = vi.fn();
    render(
        <StrataNavProvider setActiveModule={setActiveModule} setSearchNavTarget={setSearchNavTarget}>
            {ui}
        </StrataNavProvider>,
    );
    return { setActiveModule, setSearchNavTarget };
}

describe('EntityLink', () => {
    it('renders a button and navigates to the vendor module with a nav target', () => {
        const { setActiveModule, setSearchNavTarget } = renderWithNav(
            <EntityLink type="vendor" id="v1">Acme Plumbing</EntityLink>,
        );
        const btn = screen.getByRole('button', { name: 'Acme Plumbing' });
        fireEvent.click(btn);
        expect(setSearchNavTarget).toHaveBeenCalledWith({ type: 'vendor', id: 'v1' });
        expect(setActiveModule).toHaveBeenCalledWith('vendors');
    });

    it('routes each entity type to its module', () => {
        const cases: Array<[string, string, string]> = [
            ['property', 'p1', 'properties'],
            ['tenant', 't1', 'residents'],
            ['owner', 'o1', 'owners'],
            ['workitem', 'w1', 'work-orders'],
        ];
        for (const [type, id, module] of cases) {
            const { setActiveModule, setSearchNavTarget } = renderWithNav(
                <EntityLink type={type as any} id={id}>{`name-${type}`}</EntityLink>,
            );
            fireEvent.click(screen.getByRole('button', { name: `name-${type}` }));
            expect(setSearchNavTarget).toHaveBeenCalledWith({ type, id });
            expect(setActiveModule).toHaveBeenCalledWith(module);
        }
    });

    it('unit links carry the parent property id', () => {
        const { setSearchNavTarget, setActiveModule } = renderWithNav(
            <EntityLink type="unit" id="u1" parentId="p9">A-01</EntityLink>,
        );
        fireEvent.click(screen.getByRole('button', { name: 'A-01' }));
        expect(setSearchNavTarget).toHaveBeenCalledWith({ type: 'unit', id: 'u1', parentId: 'p9' });
        expect(setActiveModule).toHaveBeenCalledWith('properties');
    });

    it('does not bubble the click to the enclosing row', () => {
        const rowClick = vi.fn();
        renderWithNav(
            <div onClick={rowClick}>
                <EntityLink type="property" id="p1">Riverwood</EntityLink>
            </div>,
        );
        fireEvent.click(screen.getByRole('button', { name: 'Riverwood' }));
        expect(rowClick).not.toHaveBeenCalled();
    });

    it('renders a plain span when there is no id', () => {
        renderWithNav(<EntityLink type="tenant" id={null}>Stub Tenant</EntityLink>);
        expect(screen.queryByRole('button', { name: 'Stub Tenant' })).toBeNull();
        expect(screen.getByText('Stub Tenant').tagName).toBe('SPAN');
    });
});
